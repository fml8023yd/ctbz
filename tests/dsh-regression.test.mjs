import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

// 硬约束：node 用 /usr/local/bin/node。
const NODE = '/usr/local/bin/node';
const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const scripts = path.join(repoRoot, 'skills', 'ctbz', 'scripts');

function runNode(script, args, opts = {}) {
  const r = spawnSync(NODE, [script, ...args], {encoding: 'utf8', ...opts});
  return {status: r.status, stdout: r.stdout, stderr: r.stderr};
}

// ---------- T3 选型器 ----------

test('T3 选型器：讨论类覆盖 4 阵营，开发类不含 M5', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-pick-'));
  const ledger = path.join(dir, 'ledger.json');
  fs.writeFileSync(ledger, '{}\n');

  const disc = runNode(path.join(scripts, 'pick-profile'),
    ['--kind', 'discussion', '--ledger', ledger, '--now', '2026-09-21T00:00:00Z']);
  assert.equal(disc.status, 0, disc.stderr);
  const d = JSON.parse(disc.stdout);
  const chosenVendors = new Set(d.decision_table.filter((t) => t.状态.includes('入选')).map((t) => t.阵营));
  assert.equal(chosenVendors.size, 4, `讨论类应覆盖 4 阵营，实际 ${[...chosenVendors].join(',')}`);
  for (const v of ['DeepSeek', '智谱', '腾讯', '月之暗面']) {
    assert.ok(chosenVendors.has(v), `讨论类缺阵营 ${v}`);
  }
  for (const s of d.slots) {
    assert.ok(s.provider, 'slot 缺 provider');
    assert.ok(s.model, 'slot 缺 model');
  }

  const dev = runNode(path.join(scripts, 'pick-profile'),
    ['--kind', 'dev', '--ledger', ledger, '--now', '2026-09-21T00:00:00Z']);
  assert.equal(dev.status, 0, dev.stderr);
  const v = JSON.parse(dev.stdout);
  assert.ok(v.decision_table.every((t) => t.代号 !== 'M5'), '开发类 decision_table 不得含 M5');
  assert.ok(v.slots.every((s) => s.code !== 'M5'), '开发类 slots 不得含 M5');
  assert.ok(!v.decision_table.some((t) => t.阵营 === '月之暗面'), '开发类排除 M5 后月之暗面阵营应缺席');
});

test('T3 选型器：反审席位 DeepSeek 换 deepseek-v4-pro', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-pick-'));
  const ledger = path.join(dir, 'ledger.json');
  fs.writeFileSync(ledger, '{}\n');
  const r = runNode(path.join(scripts, 'pick-profile'),
    ['--kind', 'discussion', '--role', 'reviewer', '--ledger', ledger, '--now', '2026-09-21T00:00:00Z']);
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  const m1 = j.slots.find((s) => s.code === 'M1');
  assert.equal(m1.model, 'deepseek-v4-pro');
  assert.match(m1.note, /deepseek-v4-pro/);
});

// ---------- T5 账本解析（不发网络请求） ----------

test('T5 账本解析：样例限额错误文本解析出冷却截止，账本 0600，check 冷却中 exit 1', () => {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-ledger-')));
  const env = {...process.env, HOME: home};

  const report = runNode(path.join(scripts, '模型健康.js'),
    ['report', 'workbuddy/hy3', '[1310][您已达到每周/每月使用上限，您的限额将在 2026-09-25 18:00:00 重置。]'], {env});
  assert.equal(report.status, 0, report.stderr);
  assert.equal(JSON.parse(report.stdout).cooldown_until, '2026-09-25T10:00:00.000Z', '北京时间 18:00 应折为 UTC 10:00');

  const report2 = runNode(path.join(scripts, '模型健康.js'),
    ['report', 'workbuddy/glm-5.3-flash', '[429][rate limit exceeded, retry after 3600s]'], {env});
  assert.equal(report2.status, 0, report2.stderr);
  const until = JSON.parse(report2.stdout).cooldown_until;
  assert.ok(Number.isFinite(Date.parse(until)) && Date.parse(until) > Date.now(), 'retry-after 应解析为未来时刻');

  const ledgerFile = path.join(home, 'Documents', '.ctbz', '模型健康.json');
  assert.ok(fs.existsSync(ledgerFile), '账本文件应已落盘');
  assert.equal(fs.statSync(ledgerFile).mode & 0o777, 0o600, '账本文件须 0600');
  const data = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
  assert.equal(data['workbuddy/hy3'].cooldown_until, '2026-09-25T10:00:00.000Z');
  assert.ok(data['workbuddy/hy3'].source.includes('限额'), 'source 应保留报错原文');

  const check = runNode(path.join(scripts, '模型健康.js'),
    ['check', 'workbuddy/hy3', 'workbuddy/glm-5.3-flash'], {env});
  assert.equal(check.status, 1, '存在冷却中模型时 check 应 exit 1');
  assert.match(check.stdout, /冷却中/);
});

// ---------- T7 骨架生成器 ----------

test('T7 骨架生成器：--dry-run 输出可被 JS 解析的 workflow 脚本体', () => {
  const plan = path.join(repoRoot, 'docs', 'ctbz-dsh-实施计划-20260921.md');
  assert.ok(fs.existsSync(plan), '计划文件应存在');
  const r = runNode(path.join(scripts, '反审.mjs'), ['--plan', plan, '--dry-run']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /语法校验通过/);
  assert.match(r.stdout, /四路反审骨架（start）/);
  assert.match(r.stdout, /return results;/);

  const start = '// ===== ctbz 四路反审骨架（start）=====';
  const end = '// ===== ctbz 四路反审骨架（end）=====';
  const body = r.stdout.split(start)[1].split(end)[0].trim();
  assert.ok(body.length > 0, '应提取到骨架体');
  // workflow 脚本体允许顶层 await/return；用 async IIFE 包裹后由 new Function 解析。
  assert.doesNotThrow(() => new Function('agent', `return (async () => {\n${body}\n})();`));
  assert.match(body, /provider: c\.provider, model: c\.model/);
  assert.ok(body.includes('deepseek-v4-pro'), '反审席位 DeepSeek 应 baked-in deepseek-v4-pro');
  assert.ok(body.includes('kimi-k2.8-preview'), '应含月之暗面阵营模型');
  assert.match(body, /RECORD_DIR/, '骨架应含每路裁决独立落盘的 RECORD_DIR');
});

// ---------- T2 反审骨架增强（M2）：--workspace / 空模板 / --round / --gate ----------

const SKELETON_START = '// ===== ctbz 四路反审骨架（start）=====';
const SKELETON_END = '// ===== ctbz 四路反审骨架（end）=====';
const CAMP_KEYS = ['deepseek', 'zhipu', 'tencent', 'moonshot'];
const AUDIT = path.join(scripts, '反审.mjs');
const GATE = path.join(scripts, '派发闸.mjs');

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writePlan(dir, name = 'plan.md', body = '# 计划\n\nreview_scale: 中\n') {
  const plan = path.join(dir, name);
  fs.writeFileSync(plan, body, 'utf8');
  return plan;
}

function recordDir(ws, plan) {
  return path.join(ws, '.ctbz-record', '反审', path.basename(plan).replace(/\.md$/i, ''));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('T2 反审：非 --dry-run 落 4 份空回执模板（字段齐全 / verdict=null / verdicts=[]）', () => {
  const ws = mkTmp('ctbz-audit-ws-');
  const plan = writePlan(ws);
  const r = runNode(AUDIT, ['--plan', plan, '--workspace', ws]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /四路反审骨架（start）/);
  assert.match(r.stderr, /语法校验通过/);

  const dir = recordDir(ws, plan);
  assert.deepEqual(fs.readdirSync(dir).sort(), CAMP_KEYS.map((k) => `${k}.json`).sort());
  const sha = createHash('sha256').update(fs.readFileSync(plan)).digest('hex');
  for (const k of CAMP_KEYS) {
    const j = readJson(path.join(dir, `${k}.json`));
    assert.equal(j.camp, k);
    assert.ok(j.camp_label, `${k} 缺 camp_label`);
    assert.ok(j.provider && j.model, `${k} 缺 provider/model`);
    assert.equal(j.round, '1');
    assert.equal(j.plan, plan, 'plan 应与 --plan 逐字相同');
    assert.equal(j.plan_sha256, sha, 'plan_sha256 应为计划字节 sha256');
    assert.ok(j.generated_at, `${k} 缺 generated_at`);
    assert.equal(j.verdict, null, `${k} verdict 应为 null`);
    assert.deepEqual(j.fresh_agent_test, {conclusion: '', blockers: []});
    assert.deepEqual(j.verdicts, [], `${k} verdicts 应为空数组`);
    assert.equal(typeof j.summary, 'string');
  }
});

test('T2 反审：--round 2 落 <camp>-r2.json，--camps 少于 4 路也照落 4 份', () => {
  const ws = mkTmp('ctbz-audit-ws-');
  const plan = writePlan(ws);
  const r = runNode(AUDIT, ['--plan', plan, '--workspace', ws, '--round', '2', '--camps', 'deepseek']);
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(r.stdout.trim(), '', '未给 --out 时应打印骨架');
  const dir = recordDir(ws, plan);
  assert.deepEqual(fs.readdirSync(dir).sort(),
    ['deepseek-r2.json', 'moonshot-r2.json', 'tencent-r2.json', 'zhipu-r2.json']);
  for (const f of fs.readdirSync(dir)) assert.equal(readJson(path.join(dir, f)).round, '2', `${f} round 应为 "2"`);
});

test('T2 反审：--dry-run 注入 --workspace 绝对路径、零写盘、不跑 gate', () => {
  const ws = mkTmp('ctbz-audit-ws-');
  const plan = writePlan(ws);
  const r = runNode(AUDIT, ['--plan', plan, '--workspace', ws, '--dry-run', '--gate']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(path.join(ws, '.ctbz-record')), '--dry-run 不得写盘');

  const dir = recordDir(ws, plan);
  assert.ok(r.stdout.includes(`const RECORD_DIR = ${JSON.stringify(dir)};`),
    'RECORD_DIR 应为 <ws> 下 <slug> 的绝对路径字面量');
  assert.ok(r.stdout.includes(`// 回执落盘：${dir}/<camp>.json`));
  assert.match(r.stdout, /\/\/ 校验命令：node .*派发闸\.mjs --plan .+ --workspace .+ --level l1/);
  assert.match(r.stdout, /\/\/ schema：camp\/camp_label\/provider\/model\/round\/plan\/plan_sha256\/generated_at\/verdict\/fresh_agent_test\/verdicts\/summary/);
  assert.match(r.stdout, /新鲜 Agent 测试/);

  const body = r.stdout.split(SKELETON_START)[1].split(SKELETON_END)[0].trim();
  assert.doesNotThrow(() => new Function('agent', `return (async () => {\n${body}\n})();`));
});

test('T2 反审：非 --dry-run 未给 --workspace → exit 2 且不写任何路径', () => {
  const cwd = mkTmp('ctbz-audit-cwd-');
  const plan = writePlan(cwd);
  const r = runNode(AUDIT, ['--plan', plan], {cwd});
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /--workspace/);
  assert.deepEqual(fs.readdirSync(cwd), ['plan.md'], '不得在 cwd 落任何东西');
});

test('T2 反审：--camps 过滤后为空 → exit 2，不落模板不跑 gate', () => {
  for (const bad of ['', ',,', ' , ']) {
    const ws = mkTmp('ctbz-audit-ws-');
    const plan = writePlan(ws);
    const r = runNode(AUDIT, ['--plan', plan, '--workspace', ws, '--camps', bad, '--gate']);
    assert.equal(r.status, 2, `--camps ${JSON.stringify(bad)} 应 exit 2：${r.stderr}`);
    assert.ok(!fs.existsSync(path.join(ws, '.ctbz-record')), '不得落模板');
  }
});

test('T2 反审：--out 路径同样落 4 份模板；--dry-run 忽略 --out', () => {
  const ws = mkTmp('ctbz-audit-ws-');
  const plan = writePlan(ws);
  const out = path.join(ws, 'skeleton.js');
  const r = runNode(AUDIT, ['--plan', plan, '--workspace', ws, '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '', '--out 不打印骨架');
  assert.match(r.stderr, /骨架已写入/);
  assert.ok(fs.statSync(out).size > 0, '骨架文件应已写入');
  assert.equal(fs.readdirSync(recordDir(ws, plan)).length, 4, '--out 路径也应落 4 份模板');

  const noOut = path.join(ws, 'nope.js');
  const r2 = runNode(AUDIT, ['--plan', plan, '--workspace', ws, '--out', noOut, '--dry-run']);
  assert.equal(r2.status, 0, r2.stderr);
  assert.ok(!fs.existsSync(noOut), '--dry-run 优先：不写 --out');
  assert.match(r2.stdout, /四路反审骨架（start）/);
});

test('T2 反审：已填回执不被空模板覆盖', () => {
  const ws = mkTmp('ctbz-audit-ws-');
  const plan = writePlan(ws);
  assert.equal(runNode(AUDIT, ['--plan', plan, '--workspace', ws]).status, 0);
  const file = path.join(recordDir(ws, plan), 'deepseek.json');
  const filled = readJson(file);
  filled.verdict = '通过';
  filled.verdicts = [{view: '需求一致性', category: '可接受', evidence: 'fixture', conclusion: '接受', disposition: 'fixture'}];
  fs.writeFileSync(file, JSON.stringify(filled), 'utf8');

  const r = runNode(AUDIT, ['--plan', plan, '--workspace', ws]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /保留不覆盖/);
  assert.equal(readJson(file).verdict, '通过', '已填回执不得被覆盖');
});

test('T2 反审：--gate 但闸门脚本缺失 → exit 2 且不崩栈', () => {
  const dir = mkTmp('ctbz-audit-nogate-');
  fs.copyFileSync(AUDIT, path.join(dir, '反审.mjs'));
  const ws = mkTmp('ctbz-audit-ws-');
  const plan = writePlan(ws);
  const r = runNode(path.join(dir, '反审.mjs'), ['--plan', plan, '--workspace', ws, '--gate']);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /闸门脚本不存在/);
  assert.doesNotMatch(r.stderr, /\n\s+at /, '不得输出调用栈');
  assert.equal(fs.readdirSync(recordDir(ws, plan)).length, 4, 'gate 前应已落模板');
});

test('T2 反审：--gate 退出码 = 派发闸退出码', {
  skip: fs.existsSync(GATE) ? false : '依赖 T1：skills/ctbz/scripts/派发闸.mjs 尚未交付'
}, () => {
  const ws = mkTmp('ctbz-audit-ws-');
  const plan = writePlan(ws, 'plan.md', '# 计划\n\nreview_scale: 重\n');
  const viaAudit = runNode(AUDIT, ['--plan', plan, '--workspace', ws, '--gate']);
  const direct = runNode(GATE, ['--plan', plan, '--workspace', ws, '--level', 'l1']);
  assert.equal(fs.readdirSync(recordDir(ws, plan)).length, 4, 'gate 前应已落模板');
  assert.equal(viaAudit.status, direct.status,
    `反审 --gate=${viaAudit.status}，直跑闸门=${direct.status}\n${viaAudit.stderr}`);
});

// ---------- T2 反修（L2 裁决 5 处缺陷） ----------

const SIX_VIEWS = ['需求一致性', '架构合理性', '测试完整性', '边界条件', '性能安全', '用户体验'];

// 把 4 份空模板填成闸门可通过的合格回执（轻级只需 ≥3 份、≥3 阵营）
function fillReceipts(ws, plan) {
  const dir = recordDir(ws, plan);
  const sha = createHash('sha256').update(fs.readFileSync(plan)).digest('hex');
  for (const k of CAMP_KEYS) {
    const file = path.join(dir, `${k}.json`);
    const j = readJson(file);
    j.verdict = '通过';
    j.summary = 'fixture 摘要';
    j.plan_sha256 = sha;
    j.fresh_agent_test = {conclusion: 'fixture：可用', blockers: []};
    j.verdicts = SIX_VIEWS.map((view) => ({
      view, category: '可接受', evidence: 'fixture', conclusion: '接受', disposition: 'fixture'
    }));
    fs.writeFileSync(file, JSON.stringify(j), 'utf8');
  }
}

test('T2 反修：--gate 且闸门 exit 0 时 stdout 在 end 定界符后不得再有内容', {
  skip: fs.existsSync(GATE) ? false : '依赖 T1：skills/ctbz/scripts/派发闸.mjs 尚未交付'
}, () => {
  const ws = mkTmp('ctbz-audit-ws-');
  const plan = writePlan(ws, 'plan.md', '# 计划\n\nreview_scale: 轻\n');
  assert.equal(runNode(AUDIT, ['--plan', plan, '--workspace', ws]).status, 0);
  fillReceipts(ws, plan);

  const r = runNode(AUDIT, ['--plan', plan, '--workspace', ws, '--gate']);
  assert.equal(r.status, 0, `闸门应通过：${r.stderr}`);
  assert.ok(r.stdout.trimEnd().endsWith(SKELETON_END),
    'stdout 在 end 定界符之后不得再有内容，尾部：' + JSON.stringify(r.stdout.slice(-200)));
  assert.match(r.stderr, /"ok":true/, '闸门 review 块应落到 stderr（证明闸门确实跑了）');

  const out = path.join(ws, 'skeleton.js');
  const r2 = runNode(AUDIT, ['--plan', plan, '--workspace', ws, '--out', out, '--gate']);
  assert.equal(r2.status, 0, r2.stderr);
  assert.equal(r2.stdout, '', '--out + --gate 时 stdout 必须为空');
  assert.ok(fs.statSync(out).size > 0, '骨架文件应已写入');
});

test('T2 反修：--round 非正整数或无值 → exit 2，不落脏文件名', () => {
  for (const args of [['--round', 'abc'], ['--round'], ['--round', '0'], ['--round', '1.5'], ['--round', '-1']]) {
    const ws = mkTmp('ctbz-audit-ws-');
    const plan = writePlan(ws);
    const r = runNode(AUDIT, ['--plan', plan, '--workspace', ws, ...args]);
    assert.equal(r.status, 2, `--round ${JSON.stringify(args[1])} 应 exit 2：${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /--round 须为正整数/);
    assert.ok(!fs.existsSync(path.join(ws, '.ctbz-record')), '不得落任何回执');
  }
});

test('T2 反修：--out 写出失败 → exit 2 不崩栈，4 份模板照落', () => {
  const ws = mkTmp('ctbz-audit-ws-');
  const plan = writePlan(ws);
  const r = runNode(AUDIT, ['--plan', plan, '--workspace', ws, '--out', ws]);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /骨架写出失败/);
  assert.doesNotMatch(r.stderr, /\n\s+at /, '不得输出调用栈');
  assert.equal(fs.readdirSync(recordDir(ws, plan)).length, 4, '--out 失败不得牵连模板');
});

test('T2 反修：损坏回执视为已占用，跳过覆盖且内容逐字不变', () => {
  const ws = mkTmp('ctbz-audit-ws-');
  const plan = writePlan(ws);
  assert.equal(runNode(AUDIT, ['--plan', plan, '--workspace', ws]).status, 0);

  const file = path.join(recordDir(ws, plan), 'deepseek.json');
  const broken = '{"camp":"deepseek","verdicts":[{"view":"需求一致';
  fs.writeFileSync(file, broken, 'utf8');

  const r = runNode(AUDIT, ['--plan', plan, '--workspace', ws]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /回执损坏，已跳过覆盖，请人工处理/);
  assert.equal(fs.readFileSync(file, 'utf8'), broken, '损坏回执内容须逐字未变');
  assert.equal(fs.readdirSync(recordDir(ws, plan)).length, 4, '其余 3 份模板照常落盘');
});
