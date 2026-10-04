// 体检命令（A5/A6/D2/D3）回归：名单差集 / 宿主全认 / 世代回退扫描 / 账本冷热 / 待办计数 /
// --json 可解析 / --no-probe 无探活段 / 探活解析 / 编制单渠道告警 / 用法退出码。
// 夹具全部走临时目录 + 环境变量注入，零网络零计费（探活路径一律 --no-probe）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseProbeStdout, summarizeProbe } from '../skills/ctbz/scripts/体检.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/ctbz/scripts/体检.mjs', import.meta.url));

function writeJson(file, value) {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
}

// 一套最小夹具：状态根（CTBZ_HOME）+ 宿主模型表（CTBZ_PROVIDER_CONFIG）+ 账本（CTBZ_HEALTH_FILE）+ 工作区
function fixture({ team = null, hostIds = ['glm-5.3', 'deepseek-v4.1-flash', 'hy3'], host = true, ledger = undefined, pending = undefined, stateExtra = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ctbz-tijian-'));
  const home = join(dir, 'ctbz');
  mkdirSync(home, { recursive: true });
  const state = { version: '2.1.4', phase: 'initialized', teamPath: null, agents: null, ...stateExtra };
  if (team) {
    state.teamPath = join(home, 'generations', 'gen-1', 'team.json');
    writeJson(state.teamPath, team);
  }
  writeJson(join(home, '初始化状态.json'), state);
  const hostFile = join(dir, 'provider_config.json');
  if (host) {
    writeJson(hostFile, { schemaVersion: 1, config: { providerConfigRules: { providerRules: [
      { providerId: 'wb', config: { personalModelIds: hostIds } },
    ] } } });
  }
  const healthFile = join(dir, '模型健康.json');
  if (ledger !== undefined) writeFileSync(healthFile, JSON.stringify(ledger));
  if (pending !== undefined) writeJson(join(dir, 'ws', '.ctbz-record', '内审', 'pending.json'), pending);
  return { dir, home, ws: join(dir, 'ws'), hostFile, healthFile };
}

const teamOf = (roles) => ({ version: 1, team: 'ctbz', roles: Object.fromEntries(
  Object.entries(roles).map(([role, refs]) => [role, { variants: refs.map((modelRef) => ({ modelRef })) }]),
) });

function run(fx, args = []) {
  const r = spawnSync(process.execPath, [SCRIPT, '--workspace', fx.ws, ...args], {
    encoding: 'utf8',
    env: { ...process.env, CTBZ_HOME: fx.home, CTBZ_PROVIDER_CONFIG: fx.hostFile, CTBZ_HEALTH_FILE: fx.healthFile },
  });
  return r;
}
const runJson = (fx, args = []) => {
  const r = run(fx, ['--json', '--no-probe', ...args]);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};

test('名单差集：世代有而宿主没有的模型列为幽灵，且发现幽灵不改变退出码', () => {
  const fx = fixture({
    team: teamOf({
      planner: ['custom:wb:glm-5.3', 'custom:wb:glm-5.2'],
      reviewer: ['custom:wb:glm-5.3', 'custom:wb:minimax-m3'],
      implementer: ['custom:wb:glm-5.3', 'custom:wb:kimi-k2.7'],
    }),
  });
  const r = run(fx, ['--json', '--no-probe']);
  assert.equal(r.status, 0, r.stderr); // 幽灵是错位证据，不是命令失败
  const rep = JSON.parse(r.stdout);
  assert.deepEqual(rep.名单.幽灵, ['glm-5.2', 'kimi-k2.7', 'minimax-m3']);
  assert.equal(rep.名单.世代, 6);
  assert.equal(rep.名单.世代模型, 4);
  assert.equal(rep.名单.宿主认档, 3); // 只有 3 个档的模型在宿主表里
  const human = run(fx, ['--no-probe']);
  assert.equal(human.status, 0);
  assert.match(human.stdout, /世代 6/);
  assert.match(human.stdout, /宿主认 3 档（1\/4 模型）/);
  assert.match(human.stdout, /幽灵 3（glm-5.2,kimi-k2.7,minimax-m3）/);
});

test('宿主全认：差集为空、幽灵 0；宿主表读不到时标未知不编数', () => {
  const team = teamOf({ planner: ['custom:wb:glm-5.3'], reviewer: ['custom:wb:hy3'] });
  const fx = fixture({ team, hostIds: ['glm-5.3', 'hy3'] });
  assert.deepEqual(runJson(fx).名单.幽灵, []);
  assert.equal(runJson(fx).名单.宿主认档, 2);
  assert.match(run(fx, ['--no-probe']).stdout, /幽灵 0(?!\d)/);

  const blind = fixture({ team, host: false });
  const rep = runJson(blind);
  assert.equal(rep.名单.幽灵, null);
  assert.equal(rep.名单.宿主认档, null);
  assert.match(run(blind, ['--no-probe']).stdout, /幽灵 未知/);
});

test('世代定位：teamPath 失效时扫 generations 取最新；均无则名单全未知', () => {
  const fx = fixture({});
  const gens = join(fx.home, 'generations');
  writeJson(join(gens, 'gen-old', 'team.json'), teamOf({ planner: ['custom:wb:hy3'] }));
  writeJson(join(gens, 'gen-new', 'team.json'), teamOf({ planner: ['custom:wb:glm-5.3', 'custom:wb:glm-5.2'] }));
  const oldMs = Date.now() / 1000 - 600;
  utimesSync(join(gens, 'gen-old', 'team.json'), oldMs, oldMs); // 显式拉开 mtime，不赌写入速度
  const rep = runJson(fx);
  assert.equal(rep.team文件, join(gens, 'gen-new', 'team.json'));
  assert.equal(rep.名单.世代, 2);

  const bare = fixture({ team: null });
  const b = runJson(bare);
  assert.equal(b.名单.世代, null);
  assert.equal(b.名单.幽灵, null);
  assert.match(run(bare, ['--no-probe']).stdout, /世代 未知/);
});

test('账本统计：冷却中与已过期按当前时间分列，坏账本按空账', () => {
  const fx = fixture({ team: teamOf({ planner: ['custom:wb:glm-5.3'] }), ledger: {
    'wb/glm-5.3': { cooldown_until: '2030-01-01T00:00:00.000Z' },
    'wb/hy3': { cooldown_until: '2020-01-01T00:00:00.000Z' },
    'custom:wb:glm-5.3-flash': { cooldown_until: '2030-01-01T00:00:00.000Z' },
  } });
  const rep = runJson(fx);
  assert.deepEqual({ 冷却: rep.账本.冷却, 过期: rep.账本.过期 }, { 冷却: 2, 过期: 1 });
  assert.match(run(fx, ['--no-probe']).stdout, /账本  冷却 2 \/ 过期 1/);

  const broken = fixture({ ledger: '{ 坏账本' });
  assert.deepEqual(runJson(broken).账本, { 冷却: 0, 过期: 0 });
});

test('待办：pending.json 无文件计 0，有条目按条数；决策清单缺失标未知', () => {
  const none = fixture({});
  const rep = runJson(none);
  assert.equal(rep.待办.内审, 0);
  assert.equal(rep.待办.决策清单, null);
  assert.match(run(none, ['--no-probe']).stdout, /待办  内审 0 \/ 决策清单 未知/);

  const fx = fixture({ pending: { pending: [{ id: 'a', checked: true }, { id: 'b', checked: false }] } });
  assert.equal(runJson(fx).待办.内审, 2);
});

test('--json 输出可解析且字段齐；--no-probe 时无探活键/行', () => {
  const fx = fixture({ team: teamOf({ planner: ['custom:wb:glm-5.3'] }) });
  const rep = runJson(fx);
  for (const k of ['工作区', '版本', '名单', '账本', '待办', '编制检查']) assert.ok(k in rep, `缺字段 ${k}`);
  assert.ok(!('探活' in rep));
  assert.deepEqual(Object.keys(rep.版本).sort(), ['tag', '远端', '部署', '本地领先'].sort());
  const human = run(fx, ['--no-probe']);
  assert.ok(!human.stdout.includes('探活'), human.stdout);
  assert.match(human.stdout, /^版本 /m);
  assert.match(human.stdout, /^名单 /m);
  assert.match(human.stdout, /^账本 /m);
  assert.match(human.stdout, /^待办 /m);
});

test('探活解析：preflight --json 的 ok/fail 汇总为「N/M 可用（失败名单）」，坏 JSON 标未知', () => {
  const j = parseProbeStdout(JSON.stringify({
    ok: 2, calls_made: 5,
    rows: [
      { code: 'M1', model: 'deepseek-flash', status: 'ok' },
      { code: 'M2', model: 'glm-5.3-flash', status: 'ok' },
      { code: 'M3', model: 'hy4-preview-f', status: 'fail', detail: '限额/欠费类错误: 1310' },
      { code: 'M4', model: 'hy3', status: 'fail', detail: '错误: model-not-found' },
      { code: 'M5', model: 'kimi-k2.8-preview', status: 'timeout', detail: 'timeout after 60000ms' },
    ],
  }));
  const s = summarizeProbe(j);
  assert.equal(s.可用, 2);
  assert.equal(s.总数, 5);
  assert.deepEqual(s.失败, ['M3 欠费', 'M4 失败', 'M5 超时']);
  assert.equal(parseProbeStdout('不是 JSON'), null);
  assert.equal(parseProbeStdout('{"ok":1}'), null);
});

test('编制检查：关键角色渠道 <2 告警，多渠道角色不告警', () => {
  const fx = fixture({ team: teamOf({
    planner: ['custom:wb:glm-5.3', 'custom:other:hy3'],
    reviewer: ['custom:wb:glm-5.3'],
    implementer: ['custom:wb:glm-5.3'],
    tester: ['custom:wb:glm-5.3'],
    reporter: ['custom:wb:glm-5.3'], // 非关键角色，不参与告警
  }) });
  const rep = runJson(fx);
  assert.deepEqual(rep.编制检查.关键角色渠道, { planner: 2, reviewer: 1, implementer: 1, tester: 1 });
  assert.deepEqual(rep.编制检查.单渠道, ['reviewer', 'implementer', 'tester']);
  assert.match(run(fx, ['--no-probe']).stdout, /编制告警 单渠道: reviewer,implementer,tester/);
});

test('探活接线：默认走 preflight 并汇总为「N/M 可用（失败名单）」（桩替身，零计费）', () => {
  const fx = fixture({ team: teamOf({ planner: ['custom:wb:glm-5.3'] }) });
  const stub = join(fx.dir, 'preflight-stub.mjs');
  writeFileSync(stub, 'console.log(JSON.stringify({ ok: 1, calls_made: 2, rows: ['
    + '{code:"M1",model:"deepseek-flash",status:"ok"},'
    + '{code:"M4",model:"hy3",status:"fail",detail:"限额/欠费类错误: 1310"}] }));');
  const r = spawnSync(process.execPath, [SCRIPT, '--workspace', fx.ws, '--json'], {
    encoding: 'utf8',
    env: { ...process.env, CTBZ_HOME: fx.home, CTBZ_PROVIDER_CONFIG: fx.hostFile, CTBZ_HEALTH_FILE: fx.healthFile, CTBZ_PREFLIGHT: stub },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).探活, { 可用: 1, 总数: 2, 失败: ['M4 欠费'] });
  const human = spawnSync(process.execPath, [SCRIPT, '--workspace', fx.ws], {
    encoding: 'utf8',
    env: { ...process.env, CTBZ_HOME: fx.home, CTBZ_PROVIDER_CONFIG: fx.hostFile, CTBZ_HEALTH_FILE: fx.healthFile, CTBZ_PREFLIGHT: stub },
  });
  assert.match(human.stdout, /探活  1\/2 可用（M4 欠费）/);
});

test('用法：未知参数/缺参 exit 2 并打用法，--help exit 0', () => {
  const fx = fixture({});
  for (const args of [['--bogus'], ['--workspace']]) {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 2, `${args} 应 exit 2`);
    assert.match(r.stderr, /用法: node 体检\.mjs/);
  }
  const help = spawnSync(process.execPath, [SCRIPT, '--help'], { encoding: 'utf8', env: { ...process.env, CTBZ_HOME: fx.home } });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--no-probe/);
});
