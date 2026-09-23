import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

// 硬约束：node 用 /usr/local/bin/node（缺失时退回当前进程）。
const NODE = fs.existsSync('/usr/local/bin/node') ? '/usr/local/bin/node' : process.execPath;
const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const scripts = path.join(repoRoot, 'skills', 'ctbz', 'scripts');
const GATE = path.join(scripts, '派发闸.mjs');

const SIX_VIEWS = ['需求一致性', '架构合理性', '测试完整性', '边界条件', '性能安全', '用户体验'];
const CHECK_IDS = ['集成一致性', '调用名统一', 'main未污染', '安装副本分支标识'];
// §4.3 席位表：每 camp 首个允许组合（§9.12）
const CAMPS = [
  {camp: 'deepseek', label: 'DeepSeek', provider: 'deepseek-official', model: 'deepseek-flash'},
  {camp: 'zhipu', label: '智谱', provider: 'workbuddy', model: 'glm-5.3-flash'},
  {camp: 'tencent', label: '腾讯', provider: 'workbuddy', model: 'hy4-preview-f'},
  {camp: 'moonshot', label: '月之暗面', provider: 'workbuddy', model: 'kimi-k2.8-preview'},
];

function runGate(args, opts = {}) {
  const script = opts.script || GATE;
  const r = spawnSync(NODE, [script, ...args], {encoding: 'utf8', ...opts.spawn});
  return {status: r.status, stdout: r.stdout, stderr: r.stderr, out: r.stdout + r.stderr};
}

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const l1Dir = (ws, slug = 'plan') => path.join(ws, '.ctbz-record', '反审', slug);
const l2Dir = (ws, task) => path.join(ws, '.ctbz-record', '反审', '任务级', task);
const l3Dir = (ws, slug = 'plan') => path.join(ws, '.ctbz-record', '反审', '项目级', slug);

// 夹具项目：mkdtemp 内 docs/plan.md（含 review_scale）
function makeWs(scale = '中') {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-gate-'));
  fs.mkdirSync(path.join(ws, 'docs'), {recursive: true});
  const plan = path.join(ws, 'docs', 'plan.md');
  fs.writeFileSync(plan, `# 夹具计划\n\nreview_scale: ${scale}\n`);
  return {ws, plan};
}

function receipt(plan, camp, round = '1', patch = {}) {
  return {
    camp: camp.camp,
    camp_label: camp.label,
    provider: camp.provider,
    model: camp.model,
    round,
    plan: path.resolve(plan),
    plan_sha256: sha256(plan),
    generated_at: new Date().toISOString(),
    verdict: null,
    fresh_agent_test: {conclusion: '通过', blockers: []},
    verdicts: SIX_VIEWS.map((v) => ({view: v, category: '可接受', evidence: 'fixture', conclusion: '接受', disposition: 'fixture'})),
    summary: 'fixture',
    ...patch,
  };
}

function writeReceipts(dir, plan, {camps = CAMPS, rounds = ['1'], patch} = {}) {
  fs.mkdirSync(dir, {recursive: true});
  const files = [];
  for (const c of camps) {
    for (const r of rounds) {
      const p = path.join(dir, r === '1' ? `${c.camp}.json` : `${c.camp}-r${r}.json`);
      fs.writeFileSync(p, JSON.stringify(receipt(plan, c, r, typeof patch === 'function' ? patch(c, r) : patch), null, 2));
      files.push(p);
    }
  }
  return files;
}

const cmdLines = (text) => text.split('\n').filter((l) => l.startsWith('node '));

function snapTree(root) {
  const out = [];
  const walk = (dir, rel) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      const st = fs.lstatSync(p);
      const r = rel ? `${rel}/${name}` : name;
      if (st.isDirectory()) { out.push(`D ${r}`); walk(p, r); }
      else out.push(`F ${r} ${st.size} ${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`);
    }
  };
  walk(root, '');
  return out.join('\n');
}

// audit 夹具：把 派发闸.mjs 与 stub 内审.mjs 复制进夹具同目录（验证「同目录解析」）
function copyGateInto(ws) {
  const bin = path.join(ws, 'bin');
  fs.mkdirSync(bin, {recursive: true});
  fs.copyFileSync(GATE, path.join(bin, '派发闸.mjs'));
  return bin;
}

function writeInnerStub(bin, code) {
  const p = path.join(bin, '内审.mjs');
  const body = code === 0
    ? '#!/usr/bin/env node\nif (process.argv[2] !== "check" || !process.argv[3] || !process.argv.includes("--json")) process.exit(9);\nprocess.exit(0);\n'
    : '#!/usr/bin/env node\nprocess.exit(1);\n';
  fs.writeFileSync(p, body, {mode: 0o755});
  return p;
}

function writePending(ws, entries) {
  const dir = path.join(ws, '.ctbz-record', '内审');
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, 'pending.json'), JSON.stringify({pending: entries}, null, 2));
}

// ---------- 用法 / 退出码 2 ----------

test('无参数：exit 2 且打印用法', () => {
  const r = runGate([]);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /用法：/);
  assert.match(r.out, /--workspace/);
  assert.match(r.out, /退出码：0 通过 \/ 1 校验不通过 \/ 2 用法或环境错误/);
});

test('用法错误：缺 --task / 非法 --level / --plan 不存在 → exit 2', () => {
  const {ws, plan} = makeWs();
  assert.equal(runGate(['--plan', plan, '--workspace', ws, '--level', 'l2']).status, 2, 'l2 缺 --task');
  assert.equal(runGate(['--plan', plan, '--workspace', ws, '--level', 'l9']).status, 2, '非法 level');
  assert.equal(runGate(['--plan', path.join(ws, 'nope.md'), '--workspace', ws]).status, 2, 'plan 不存在');
  assert.equal(runGate(['--plan', plan, '--workspace', ws, '--level', 'l2', '--task', '../x']).status, 2, 'task 越界');
});

test('-h/--help 优先于 --json：用法打到 stdout、exit 0、不输出 JSON', () => {
  for (const args of [['-h'], ['--help'], ['--json', '-h'], ['-h', '--json'], ['--json', '--help']]) {
    const r = runGate(args);
    const tag = args.join(' ');
    assert.equal(r.status, 0, `${tag} → ${r.out}`);
    assert.equal(r.stderr, '', `${tag} 用法应只进 stdout`);
    assert.match(r.stdout.split('\n')[0], /^ctbz 派发闸/, `${tag} stdout 首行应为用法标题`);
    assert.match(r.stdout, /用法：/, `${tag} 应含用法正文`);
    assert.match(r.stdout, /--workspace/, tag);
    assert.notEqual(r.stdout.trim().split('\n').length, 1, `${tag} 不得是单行输出`);
    assert.throws(() => JSON.parse(r.stdout.trim()), `${tag} 不得输出 JSON`);
  }
});

// ---------- V2 ----------

test('V2 无回执 → exit 1 且输出含可直接执行的补齐命令；补 4 份合格 → exit 0', () => {
  const {ws, plan} = makeWs('中');
  const empty = runGate(['--plan', plan, '--workspace', ws]);
  assert.equal(empty.status, 1, empty.out);
  assert.match(empty.out, /✗/);
  const cmds = cmdLines(empty.out);
  assert.ok(cmds.length >= 2, `补齐命令应 ≥2 行，实际 ${cmds.length}`);
  assert.ok(cmds.some((l) => l.includes('反审.mjs')), '应有生成骨架的补齐命令');
  assert.ok(cmds.some((l) => l.includes('派发闸.mjs') && l.includes('--level l1')), '应有复跑闸门命令');
  for (const c of cmds) {
    assert.ok(c.includes(plan) && c.includes(ws), `占位符未替换为绝对路径：${c}`);
  }
  assert.doesNotMatch(empty.out, /--plan\s*</);
  assert.doesNotMatch(empty.out, /--workspace\s*</);

  writeReceipts(l1Dir(ws), plan);
  const okRun = runGate(['--plan', plan, '--workspace', ws]);
  assert.equal(okRun.status, 0, okRun.out);
  const block = JSON.parse(okRun.stdout);
  assert.equal(block.ok, true);
  assert.equal(block.review_scale, '中');
  assert.equal(block.review_level, 'l1');
  assert.equal(block.review_receipt, path.join(ws, '.ctbz-record', '反审', 'plan') + '/');
  assert.deepEqual(block.review_camps, ['deepseek', 'zhipu', 'tencent', 'moonshot']);
  assert.equal(block.plan_sha256, sha256(plan));
  assert.equal(block.seats, 4);
});

test('空模板（verdict:null + verdicts:[]）＝没审，单独计数并与没写同判', () => {
  const {ws, plan} = makeWs('中');
  writeReceipts(l1Dir(ws), plan, {patch: {verdicts: []}});
  const r = runGate(['--plan', plan, '--workspace', ws]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /空模板 4 份（= 没审，与没写同判）/);
  assert.match(r.out, /verdict:null 且 verdicts:\[\]/);
});

test('免审级：缺 免审依据 行 → exit 1；补上 → exit 0（seats 0）', () => {
  const {ws, plan} = makeWs('免审');
  assert.equal(runGate(['--plan', plan, '--workspace', ws]).status, 1);
  fs.appendFileSync(plan, '\n免审依据: 只读诊断，不写仓库\n');
  const r = runGate(['--plan', plan, '--workspace', ws]);
  assert.equal(r.status, 0, r.out);
  assert.equal(JSON.parse(r.stdout).seats, 0);
  assert.deepEqual(JSON.parse(r.stdout).review_camps, []);
});

// ---------- V3 ----------

test('V3 同源豁免：deepseek 席放行、其余三席同源仍拒、--host-model 取非豁免席位模型 exit 2', () => {
  const {ws, plan} = makeWs('中');

  // ① deepseek 席 model=deepseek-flash（同源豁免）→ exit 0
  writeReceipts(l1Dir(ws), plan, {patch: (c) => (c.camp === 'deepseek' ? {model: 'deepseek-flash'} : {})});
  assert.equal(runGate(['--plan', plan, '--workspace', ws]).status, 0);

  // ② deepseek 席 model=deepseek-v4-pro（历史兼容值）→ exit 0
  fs.rmSync(l1Dir(ws), {recursive: true, force: true});
  writeReceipts(l1Dir(ws), plan, {patch: (c) => (c.camp === 'deepseek' ? {model: 'deepseek-v4-pro'} : {})});
  assert.equal(runGate(['--plan', plan, '--workspace', ws]).status, 0);

  // ③ zhipu 席 model=deepseek-flash（camp≠deepseek 但同源模型）→ exit 1
  fs.rmSync(l1Dir(ws), {recursive: true, force: true});
  writeReceipts(l1Dir(ws), plan, {patch: (c) => (c.camp === 'zhipu' ? {model: 'deepseek-flash'} : {})});
  const bad = runGate(['--plan', plan, '--workspace', ws]);
  assert.equal(bad.status, 1, bad.out);
  assert.match(bad.out, /同模型自审：model 与 --host-model 逐字相等/);

  // ④ 恢复席位表内组合，再验 --host-model 取值语义
  fs.rmSync(l1Dir(ws), {recursive: true, force: true});
  writeReceipts(l1Dir(ws), plan);
  for (const m of ['glm-5.3-flash', 'hy4-preview-f', 'hy3', 'kimi-k2.8-preview']) {
    const r = runGate(['--plan', plan, '--workspace', ws, '--host-model', m]);
    assert.equal(r.status, 2, `--host-model ${m} 应 exit 2`);
  }
  assert.equal(runGate(['--plan', plan, '--workspace', ws, '--host-model', 'deepseek-chat']).status, 0);
});

// ---------- V4 ----------

test('V4 旧计划不可复用：改计划后仅最高轮回执被判 sha 不符', () => {
  const {ws, plan} = makeWs('重');
  writeReceipts(l1Dir(ws), plan, {rounds: ['1', '2']});
  assert.equal(runGate(['--plan', plan, '--workspace', ws]).status, 0);

  fs.appendFileSync(plan, '\n<!-- 回修：字节改变 -->\n');
  const stale = runGate(['--plan', plan, '--workspace', ws]);
  assert.equal(stale.status, 1, stale.out);
  assert.match(stale.out, /plan_sha256 与当前计划不符/);
  const dir = l1Dir(ws);
  assert.ok(stale.out.includes(path.join(dir, 'deepseek-r2.json')), '最高轮 r2 应被报');
  for (const f of ['deepseek.json', 'zhipu.json', 'tencent.json', 'moonshot.json']) {
    assert.ok(!stale.out.includes(path.join(dir, f) + ':'), `低轮回执 ${f} 不应被 sha 判（仅格式校验）`);
  }
});

// ---------- V5 ----------

test('V5 L2 隔离可判：implementer_camp == reviewer_camp 拒；不同阵营过', () => {
  const {ws, plan} = makeWs('中');
  const dir = l2Dir(ws, 'T1');
  writeReceipts(dir, plan, {camps: [CAMPS[0]], patch: {implementer_camp: 'deepseek', reviewer_camp: 'deepseek'}});
  const bad = runGate(['--plan', plan, '--workspace', ws, '--level', 'l2', '--task', 'T1']);
  assert.equal(bad.status, 1, bad.out);
  assert.match(bad.out, /实施\/复核同阵营/);

  fs.rmSync(dir, {recursive: true, force: true});
  writeReceipts(dir, plan, {camps: [CAMPS[0]], patch: {implementer_camp: 'zhipu', reviewer_camp: 'deepseek'}});
  const ok = runGate(['--plan', plan, '--workspace', ws, '--level', 'l2', '--task', 'T1']);
  assert.equal(ok.status, 0, ok.out);
  const block = JSON.parse(ok.stdout);
  assert.equal(block.review_level, 'l2');
  assert.equal(block.review_receipt, dir + '/');

  fs.rmSync(dir, {recursive: true, force: true});
  writeReceipts(dir, plan, {camps: [CAMPS[0]], patch: {camp: 'zhipu', implementer_camp: 'zhipu', reviewer_camp: 'deepseek'}});
  const mismatch = runGate(['--plan', plan, '--workspace', ws, '--level', 'l2', '--task', 'T1']);
  assert.equal(mismatch.status, 1, 'camp != reviewer_camp 应拒');
  assert.match(mismatch.out, /camp 与 reviewer_camp 不一致/);
});

// ---------- V15 ----------

test('V15 L3 三分支：缺阵营 → 1；checks 缺项 → 1；四阵营 + 四项齐全 → 0', () => {
  const {ws, plan} = makeWs('中');
  const dir = l3Dir(ws);
  const checks = CHECK_IDS.map((id) => ({id, conclusion: '通过', evidence: 'fixture'}));

  writeReceipts(dir, plan, {camps: CAMPS.slice(0, 3), patch: {checks}});
  const missCamp = runGate(['--plan', plan, '--workspace', ws, '--level', 'l3']);
  assert.equal(missCamp.status, 1, missCamp.out);
  assert.match(missCamp.out, /项目级缺 moonshot 阵营回执/);

  fs.rmSync(dir, {recursive: true, force: true});
  writeReceipts(dir, plan, {patch: {checks: checks.filter((c) => c.id !== '集成一致性')}});
  const missCheck = runGate(['--plan', plan, '--workspace', ws, '--level', 'l3']);
  assert.equal(missCheck.status, 1, missCheck.out);
  assert.match(missCheck.out, /checks 缺项：集成一致性/);

  fs.rmSync(dir, {recursive: true, force: true});
  writeReceipts(dir, plan, {patch: {checks}});
  const ok = runGate(['--plan', plan, '--workspace', ws, '--level', 'l3']);
  assert.equal(ok.status, 0, ok.out);
  const block = JSON.parse(ok.stdout);
  assert.equal(block.review_level, 'l3');
  assert.equal(block.review_receipt, dir + '/');
  assert.equal(block.review_camps.length, 4);
});

// ---------- 重级 / round 一致性 ----------

test('重级：需 8 份且每阵营含 round=2；缺 -r2 → exit 1', () => {
  const {ws, plan} = makeWs('重');
  const dir = l1Dir(ws);
  writeReceipts(dir, plan, {rounds: ['1']});
  const thin = runGate(['--plan', plan, '--workspace', ws]);
  assert.equal(thin.status, 1, thin.out);
  assert.match(thin.out, /重级需 8 份/);
  assert.match(thin.out, /deepseek-r2\.json: 重级需每阵营 1 份 round=2 回执/);

  writeReceipts(dir, plan, {rounds: ['2']});
  const ok = runGate(['--plan', plan, '--workspace', ws]);
  assert.equal(ok.status, 0, ok.out);
  const block = JSON.parse(ok.stdout);
  assert.equal(block.review_scale, '重');
  assert.equal(block.seats, 8);
});

test('round 与文件名后缀不一致 → 不合格', () => {
  const {ws, plan} = makeWs('中');
  const dir = l1Dir(ws);
  writeReceipts(dir, plan, {patch: (c) => (c.camp === 'deepseek' ? {round: '2'} : {})});
  const a = runGate(['--plan', plan, '--workspace', ws]);
  assert.equal(a.status, 1, a.out);
  assert.match(a.out, /round 与文件名后缀不一致：文件名要求 "1"，字段为 "2"/);

  fs.rmSync(dir, {recursive: true, force: true});
  writeReceipts(dir, plan, {rounds: ['2'], patch: (c) => (c.camp === 'tencent' ? {round: '1'} : {})});
  const b = runGate(['--plan', plan, '--workspace', ws]);
  assert.equal(b.status, 1, b.out);
  assert.match(b.out, /round 与文件名后缀不一致：文件名要求 "2"，字段为 "1"/);
});

test('schema 破口逐项被拦：删 fresh_agent_test / 破席位表 / 少视角', () => {
  const {ws, plan} = makeWs('中');
  const dir = l1Dir(ws);
  writeReceipts(dir, plan, {patch: (c) => (c.camp === 'zhipu' ? {fresh_agent_test: undefined} : {})});
  const a = runGate(['--plan', plan, '--workspace', ws]);
  assert.equal(a.status, 1, a.out);
  assert.match(a.out, /fresh_agent_test 缺失或非对象/);

  fs.rmSync(dir, {recursive: true, force: true});
  writeReceipts(dir, plan, {patch: (c) => (c.camp === 'tencent' ? {model: 'gpt-9'} : {})});
  const b = runGate(['--plan', plan, '--workspace', ws]);
  assert.equal(b.status, 1, b.out);
  assert.match(b.out, /model 未落席位表/);

  fs.rmSync(dir, {recursive: true, force: true});
  writeReceipts(dir, plan, {patch: (c) => (c.camp === 'moonshot' ? {verdicts: receipt(plan, c).verdicts.slice(0, 4)} : {})});
  const c = runGate(['--plan', plan, '--workspace', ws]);
  assert.equal(c.status, 1, c.out);
  assert.match(c.out, /verdicts 长度 4 < 6/);
});

test('回执 plan 字段 ≠ --plan → 不合格（每例只破一处）', () => {
  const {ws, plan} = makeWs('中');
  const dir = l2Dir(ws, 'T1');
  const other = path.join(ws, 'docs', 'plan-旧.md');
  fs.writeFileSync(other, '# 另一份计划\n\nreview_scale: 中\n');
  const args = ['--plan', plan, '--workspace', ws, '--level', 'l2', '--task', 'T1'];
  const base = {implementer_camp: 'zhipu', reviewer_camp: 'deepseek'};

  writeReceipts(dir, plan, {camps: [CAMPS[0]], patch: base});
  const ok = runGate(args);
  assert.equal(ok.status, 0, '合格基线须 exit 0（防用例恒红）：' + ok.out);

  fs.rmSync(dir, {recursive: true, force: true});
  // 唯一破口：plan 指向另一份计划；plan_sha256 仍取当前 --plan 的 sha（最高轮 sha 校验不参与本破口）
  writeReceipts(dir, plan, {camps: [CAMPS[0]], patch: {...base, plan: other}});
  const bad = runGate(args);
  assert.equal(bad.status, 1, bad.out);
  assert.match(bad.out, /plan 与 --plan 不一致/);

  const badJson = runGate([...args, '--json']);
  assert.equal(badJson.status, 1, badJson.out);
  assert.equal(badJson.stdout.trim().split('\n').length, 1, '--json 下 exit 1 仍须单行 JSON');
  const payload = JSON.parse(badJson.stdout);
  assert.equal(payload.ok, false);
  assert.ok(payload.missing.some((m) => m.includes('plan 与 --plan 不一致')), badJson.stdout);
});

test('回执 camp 非法（"openai"）→ 不合格（每例只破一处）', () => {
  const {ws, plan} = makeWs('中');
  const dir = l2Dir(ws, 'T1');
  const args = ['--plan', plan, '--workspace', ws, '--level', 'l2', '--task', 'T1'];
  const base = {implementer_camp: 'zhipu', reviewer_camp: 'deepseek'};

  writeReceipts(dir, plan, {camps: [CAMPS[0]], patch: base});
  assert.equal(runGate(args).status, 0, '合格基线须 exit 0（防用例恒红）');

  fs.rmSync(dir, {recursive: true, force: true});
  // 唯一破口：camp 置席位表外值；随之必然并发的 camp≠reviewer_camp 是同一次破口的机械后果
  writeReceipts(dir, plan, {camps: [CAMPS[0]], patch: {...base, camp: 'openai'}});
  const bad = runGate(args);
  assert.equal(bad.status, 1, bad.out);
  assert.match(bad.out, /camp 非法："openai"/);

  const badJson = runGate([...args, '--json']);
  assert.equal(badJson.status, 1, badJson.out);
  assert.equal(badJson.stdout.trim().split('\n').length, 1, '--json 下 exit 1 仍须单行 JSON');
  const payload = JSON.parse(badJson.stdout);
  assert.equal(payload.ok, false);
  assert.ok(payload.missing.some((m) => m.includes('camp 非法："openai"')), badJson.stdout);
});

// ---------- audit（M11） ----------

test('audit：pending 缺失或为空 → exit 0（单行 JSON）', () => {
  const {ws} = makeWs('中');
  const bin = copyGateInto(ws);
  const gate = path.join(bin, '派发闸.mjs');

  const none = runGate(['--workspace', ws, '--level', 'audit'], {script: gate});
  assert.equal(none.status, 0, none.out);
  assert.equal(none.stdout.trim().split('\n').length, 1, 'stdout 须单行 JSON');
  assert.deepEqual(JSON.parse(none.stdout), {ok: true, review_level: 'audit', pending: 0});

  writePending(ws, []);
  const empty = runGate(['--workspace', ws, '--level', 'audit'], {script: gate});
  assert.equal(empty.status, 0, empty.out);
  assert.equal(JSON.parse(empty.stdout).pending, 0);
});

test('audit：同目录 stub 内审.mjs —— check 过 → 0；不过 → 1（fix 指向同目录脚本）', () => {
  const {ws} = makeWs('中');
  const bin = copyGateInto(ws);
  const gate = path.join(bin, '派发闸.mjs');
  const file = path.join(ws, 'docs', '内审', '2026-09-22-主题.md');
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, '# 内审 2026-09-22-主题\n');
  writePending(ws, [{id: '2026-09-22-主题', file, subject: '主题', checked: false}]);

  const stubOk = writeInnerStub(bin, 0);
  const ok = runGate(['--workspace', ws, '--level', 'audit'], {script: gate});
  assert.equal(ok.status, 0, ok.out);
  assert.deepEqual(JSON.parse(ok.stdout), {ok: true, review_level: 'audit', pending: 1});

  writeInnerStub(bin, 1);
  const bad = runGate(['--workspace', ws, '--level', 'audit'], {script: gate});
  assert.equal(bad.status, 1, bad.out);
  assert.ok(bad.out.includes(`✗ ${file}:`), '应逐条列未通过项');
  const cmds = cmdLines(bad.out);
  assert.ok(cmds.some((c) => c.includes(stubOk) && c.includes('check') && c.includes(file)), `fix 应指向同目录 内审.mjs：${cmds.join(' | ')}`);

  const badJson = runGate(['--workspace', ws, '--level', 'audit', '--json'], {script: gate});
  assert.equal(badJson.status, 1, badJson.out);
  assert.equal(badJson.stdout.trim().split('\n').length, 1);
  const payload = JSON.parse(badJson.stdout);
  assert.equal(payload.ok, false);
  assert.ok(payload.missing[0].startsWith('✗ '));
  assert.ok(payload.fix.every((f) => f.startsWith('node ')));
});

test('audit：路径越界 → exit 2；pending 过载 → exit 2；内审.mjs 缺失 → exit 2', () => {
  const {ws} = makeWs('中');
  const bin = copyGateInto(ws);
  const gate = path.join(bin, '派发闸.mjs');
  writeInnerStub(bin, 0);

  writePending(ws, [{id: 'x', file: path.join(ws, 'docs', 'x.md'), subject: 'x', checked: false}]);
  const esc = runGate(['--workspace', ws, '--level', 'audit', '--json'], {script: gate});
  assert.equal(esc.status, 2, esc.out);
  assert.equal(JSON.parse(esc.stdout).ok, false);
  assert.match(JSON.parse(esc.stdout).error, /路径越界/);

  writePending(ws, [{id: 'x', file: path.join(ws, 'docs', '内审', '..', '..', 'etc', 'passwd'), subject: 'x'}]);
  assert.equal(runGate(['--workspace', ws, '--level', 'audit'], {script: gate}).status, 2, '.. 穿越应越界');

  const many = Array.from({length: 101}, (_, i) => ({id: `n${i}`, file: path.join(ws, 'docs', '内审', `n${i}.md`), subject: 'x'}));
  writePending(ws, many);
  const over = runGate(['--workspace', ws, '--level', 'audit'], {script: gate});
  assert.equal(over.status, 2, over.out);
  assert.match(over.out, /pending 过载：101 条 > 100/);

  writePending(ws, [{id: 'x', file: path.join(ws, 'docs', '内审', 'n0.md'), subject: 'x'}]);
  fs.rmSync(path.join(bin, '内审.mjs'));
  const noInner = runGate(['--workspace', ws, '--level', 'audit'], {script: gate});
  assert.equal(noInner.status, 2, noInner.out);
  assert.match(noInner.out, /内审\.mjs 缺失/);
});

// ---------- --json / V14 ----------

test('--json：成功与失败 stdout 均为单行 JSON', () => {
  const {ws, plan} = makeWs('中');
  const fail = runGate(['--plan', plan, '--workspace', ws, '--json']);
  assert.equal(fail.status, 1, fail.out);
  assert.equal(fail.stdout.trim().split('\n').length, 1, '失败也须单行 JSON');
  const fj = JSON.parse(fail.stdout);
  assert.equal(fj.ok, false);
  assert.ok(fj.missing.every((m) => m.startsWith('✗ ')));
  assert.ok(fj.fix.length >= 1);
  assert.ok(fj.fix.every((f) => f.startsWith('node ')));

  writeReceipts(l1Dir(ws), plan);
  const ok = runGate(['--plan', plan, '--workspace', ws, '--json']);
  assert.equal(ok.status, 0, ok.out);
  assert.equal(ok.stdout.trim().split('\n').length, 1);
  assert.equal(JSON.parse(ok.stdout).ok, true);

  const usage = runGate(['--plan', plan, '--workspace', ws, '--level', 'l9', '--json']);
  assert.equal(usage.status, 2);
  assert.equal(usage.stdout.trim().split('\n').length, 1);
  assert.match(JSON.parse(usage.stdout).error, /非法 --level/);
});

test('V14 闸门只读：l1 通过与 audit 两条路径均不改动夹具任何字节', () => {
  const {ws, plan} = makeWs('重');
  writeReceipts(l1Dir(ws), plan, {rounds: ['1', '2']});
  const before = snapTree(ws);
  assert.equal(runGate(['--plan', plan, '--workspace', ws]).status, 0);
  assert.equal(runGate(['--plan', plan, '--workspace', ws, '--json']).status, 0);
  assert.equal(snapTree(ws), before, 'l1 分支不得写文件');

  const empty = makeWs('中');
  const eBefore = snapTree(empty.ws);
  assert.equal(runGate(['--plan', empty.plan, '--workspace', empty.ws]).status, 1);
  assert.equal(snapTree(empty.ws), eBefore, '不通过分支同样不得写文件');

  const bin = copyGateInto(empty.ws);
  const file = path.join(empty.ws, 'docs', '内审', '2026-09-22-主题.md');
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, '# 内审 2026-09-22-主题\n');
  writePending(empty.ws, [{id: '2026-09-22-主题', file, subject: '主题', checked: false}]);
  writeInnerStub(bin, 0);
  const aBefore = snapTree(empty.ws);
  const audit = runGate(['--workspace', empty.ws, '--level', 'audit'], {script: path.join(bin, '派发闸.mjs')});
  assert.equal(audit.status, 0, audit.out);
  assert.equal(snapTree(empty.ws), aBefore, 'audit 分支不得写文件（含 pending.json）');
});
