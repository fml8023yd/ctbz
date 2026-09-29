import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const SCRIPT = fileURLToPath(new URL('../skills/ctbz/scripts/内审.mjs', import.meta.url));
const PROTOCOL = fileURLToPath(new URL('../skills/ctbz/references/内审协议.md', import.meta.url));

const SUBJECT = '跳过反审';
const DATE = '2026-09-22';
const ID = DATE + '-' + SUBJECT;
const PREV_DATE = '2026-09-21';
const PREV_ID = PREV_DATE + '-' + SUBJECT;
const ITEM = '改 skills/ctbz/scripts/派发闸.mjs 加缺回执拦截；验收：无回执时退出码 1';

function fixture() {
  const ws = mkdtempSync(join(tmpdir(), 'ctbz-内审-'));
  const dir = join(ws, 'docs', '内审');
  mkdirSync(dir, {recursive: true});
  return {ws, dir};
}

function run(args, opts = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {encoding: 'utf8', ...opts});
}

function auditText({id = ID, cause = 'L2 无必填字段', item = ITEM, status = '未实现'} = {}) {
  return [
    '# 内审 ' + id,
    '',
    '现象: 派发前未跑反审闸，任务直接下发',
    '证据: docs/内审/' + id + '.md:3',
    '根因: ' + cause,
    '修改项: ' + item,
    '同类史: 首次',
    '可执行性声明: 命令可重跑，退出码可判',
    '实现状态: ' + status,
    '',
  ].join('\n');
}

function initAudit(ws, {date = DATE, subject = SUBJECT, extra = []} = {}) {
  return run(['init', '--subject', subject, '--workspace', ws, '--date', date, ...extra], {cwd: ws});
}

function pendingOf(ws) {
  return JSON.parse(readFileSync(join(ws, '.ctbz-record', '内审', 'pending.json'), 'utf8'));
}

function twoAudits() {
  const fix = fixture();
  assert.equal(initAudit(fix.ws, {date: PREV_DATE}).status, 0);
  assert.equal(initAudit(fix.ws, {date: DATE, extra: ['--prev', PREV_ID]}).status, 0);
  fix.current = join(fix.dir, ID + '.md');
  fix.prev = join(fix.dir, PREV_ID + '.md');
  return fix;
}

test('V9 触发节可自查的 - 列表项不少于 5 条', () => {
  const text = readFileSync(PROTOCOL, 'utf8');
  const from = text.indexOf('## 触发');
  const to = text.indexOf('## 三步');
  assert.ok(from >= 0 && to > from, '内审协议.md 缺少「触发」或「三步」节');
  const items = text.slice(from, to).split('\n').filter((line) => line.startsWith('- '));
  assert.ok(items.length >= 5, '触发节 - 列表项 = ' + items.length);
});

test('init 使编号 / 文件名 / pending.id / pending.file / 首行逐字相等', () => {
  const {ws, dir} = fixture();
  const r = initAudit(ws);
  assert.equal(r.status, 0, r.stderr);

  const file = join(dir, ID + '.md');
  const text = readFileSync(file, 'utf8');
  assert.equal(text.split('\n')[0], '# 内审 ' + ID);
  assert.match(text, /^现象: $/m);
  assert.match(text, /^根因: $/m);
  assert.match(text, /^同类史: 首次$/m);
  assert.match(text, /^实现状态: 未实现$/m);

  const pending = pendingOf(ws).pending;
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, ID);
  assert.equal(pending[0].file, resolve(file));
  assert.equal(pending[0].subject, SUBJECT);
  assert.equal(pending[0].checked, false);
});

test('init 缺省取 git 顶层为工作区、<ws>/docs/内审 为落点', (t) => {
  if (spawnSync('git', ['--version'], {encoding: 'utf8'}).status !== 0) return t.skip('无 git');
  const {ws} = fixture();
  assert.equal(spawnSync('git', ['init', '-q'], {cwd: ws}).status, 0);
  const nested = join(ws, 'sub', 'deep');
  mkdirSync(nested, {recursive: true});

  const r = run(['init', '--subject', SUBJECT, '--date', DATE], {cwd: nested});
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(ws, 'docs', '内审', ID + '.md')));
  assert.ok(existsSync(join(ws, '.ctbz-record', '内审', 'pending.json')));
});

test('V10 根因 L1 忘了 → 不合格并提示继续下探', () => {
  const {ws, dir} = fixture();
  assert.equal(initAudit(ws).status, 0);
  const file = join(dir, ID + '.md');
  writeFileSync(file, auditText({cause: 'L1 忘了'}), 'utf8');

  const r = run(['check', file], {cwd: ws});
  assert.equal(r.status, 1);
  assert.match(r.stdout, /不合格/);
  assert.match(r.stdout, /继续下探/);
});

test('V10 根因 L2 无必填字段 → 合格（--json 单行）', () => {
  const {ws, dir} = fixture();
  assert.equal(initAudit(ws).status, 0);
  const file = join(dir, ID + '.md');
  writeFileSync(file, auditText({cause: 'L2 无必填字段'}), 'utf8');

  const r = run(['check', file, '--json'], {cwd: ws});
  assert.equal(r.status, 0, r.stdout);
  assert.equal(r.stdout.trim().split('\n').length, 1);
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, true);
  assert.equal(out.level, 'L2');
  assert.equal(out.excellent, false);
  assert.equal(out.id, ID);
  assert.equal(out.file, resolve(file));
});

test('V10 根因 L2 无闸门 → 合格且不得判优秀', () => {
  const {ws, dir} = fixture();
  assert.equal(initAudit(ws).status, 0);
  const file = join(dir, ID + '.md');
  writeFileSync(file, auditText({cause: 'L2 无闸门'}), 'utf8');

  const r = run(['check', file], {cwd: ws});
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /合格/);
  assert.doesNotMatch(r.stdout, /优秀/);
});

test('V10 根因 L3 默认路径更省力 → 优秀', () => {
  const {ws, dir} = fixture();
  assert.equal(initAudit(ws).status, 0);
  const file = join(dir, ID + '.md');
  writeFileSync(file, auditText({cause: 'L3 默认路径更省力'}), 'utf8');

  const json = run(['check', file, '--json'], {cwd: ws});
  assert.equal(json.status, 0, json.stdout);
  const out = JSON.parse(json.stdout);
  assert.equal(out.level, 'L3');
  assert.equal(out.excellent, true);

  const human = run(['check', file], {cwd: ws});
  assert.equal(human.status, 0, human.stdout);
  assert.match(human.stdout, /优秀/);
});

test('V11 修改项写「加强意识」→ exit 1', () => {
  const {ws, dir} = fixture();
  assert.equal(initAudit(ws).status, 0);
  const file = join(dir, ID + '.md');
  const item = '改 skills/ctbz/scripts/内审.mjs 加禁词校验，加强意识；验收：退出码 1';
  writeFileSync(file, auditText({cause: 'L3 默认路径更省力', item}), 'utf8');

  const r = run(['check', file], {cwd: ws});
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /禁词/);
});

test('check 拦无文件落点与无验收标准的修改项', () => {
  const noPath = fixture();
  assert.equal(initAudit(noPath.ws).status, 0);
  const fileA = join(noPath.dir, ID + '.md');
  writeFileSync(fileA, auditText({item: '改脚本加校验；验收：退出码 1'}), 'utf8');
  const a = run(['check', fileA], {cwd: noPath.ws});
  assert.equal(a.status, 1, a.stdout);
  assert.match(a.stdout, /文件落点/);

  const noAccept = fixture();
  assert.equal(initAudit(noAccept.ws).status, 0);
  const fileB = join(noAccept.dir, ID + '.md');
  writeFileSync(fileB, auditText({item: '改 skills/ctbz/scripts/内审.mjs 加校验'}), 'utf8');
  const b = run(['check', fileB], {cwd: noAccept.ws});
  assert.equal(b.status, 1, b.stdout);
  assert.match(b.stdout, /验收标准/);
});

test('check 通过时置 pending.checked，不改文件里的实现状态', () => {
  const {ws, dir} = fixture();
  assert.equal(initAudit(ws).status, 0);
  const file = join(dir, ID + '.md');
  writeFileSync(file, auditText(), 'utf8');

  assert.equal(run(['check', file], {cwd: ws}).status, 0);
  const pending = pendingOf(ws).pending;
  assert.equal(pending.length, 1);
  assert.equal(pending[0].checked, true);
  assert.match(readFileSync(file, 'utf8'), /^实现状态: 未实现$/m);

  assert.equal(run(['check', file], {cwd: ws}).status, 0);
  assert.equal(pendingOf(ws).pending[0].checked, true);
});

test('F4 子目录同名文件 check 不得误标父目录 pending 条目', () => {
  const ws = mkdtempSync(join(tmpdir(), 'ctbz-内审-cross-'));
  const id = DATE + '-跨目录误标';
  const registered = join(ws, 'docs', '内审', id + '.md');
  const stray = join(ws, 'sub', 'docs', '内审', id + '.md');
  mkdirSync(dirname(registered), {recursive: true});
  mkdirSync(dirname(stray), {recursive: true});
  writeFileSync(registered, auditText({id}), 'utf8');
  writeFileSync(stray, auditText({id}), 'utf8');
  mkdirSync(join(ws, '.ctbz-record', '内审'), {recursive: true});
  writeFileSync(
    join(ws, '.ctbz-record', '内审', 'pending.json'),
    JSON.stringify({pending: [{id, file: registered, subject: '跨目录误标', checked: false}]}, null, 2) + '\n',
    'utf8'
  );

  const strayRun = run(['check', stray], {cwd: ws});
  assert.equal(strayRun.status, 0, strayRun.stdout + strayRun.stderr);
  assert.equal(pendingOf(ws).pending[0].checked, false, '子目录未登记文件不得改写父目录条目的 checked');

  const ownRun = run(['check', registered], {cwd: ws});
  assert.equal(ownRun.status, 0, ownRun.stdout + ownRun.stderr);
  assert.equal(pendingOf(ws).pending[0].checked, true, '登记文件本身仍须置 checked');
});

test('V12 同类主题第二次未带 --prev → 拒绝，带 --prev → 放行', () => {
  const {ws} = fixture();
  assert.equal(initAudit(ws, {date: PREV_DATE}).status, 0);

  const refused = initAudit(ws);
  assert.equal(refused.status, 1);
  assert.match(refused.stdout, /必须 --prev /);
  assert.match(refused.stdout, new RegExp(PREV_ID));

  const allowed = initAudit(ws, {extra: ['--prev', PREV_ID]});
  assert.equal(allowed.status, 0, allowed.stdout);
  assert.equal(pendingOf(ws).pending.length, 2);
});

test('V12 前条实现状态: 未实现 → link 改写同类史', () => {
  const fix = twoAudits();
  const r = run(['link', '--prev', PREV_ID, '--file', fix.current, '--workspace', fix.ws], {cwd: fix.ws});
  assert.equal(r.status, 0, r.stdout);
  assert.match(readFileSync(fix.current, 'utf8'), new RegExp('^同类史: ' + PREV_ID + '$', 'm'));
});

test('V12 前条实现状态: 已实现 → 报缺陷失效并要求升级 L3', () => {
  const fix = twoAudits();
  writeFileSync(fix.prev, auditText({id: PREV_ID, status: '已实现'}), 'utf8');

  const r = run(['link', '--prev', PREV_ID, '--file', fix.current, '--workspace', fix.ws], {cwd: fix.ws});
  assert.equal(r.status, 1);
  assert.match(r.stdout, /缺陷失效/);
  assert.match(r.stdout, /L3/);
  assert.match(readFileSync(fix.current, 'utf8'), /^同类史: 首次$/m);
});

test('link 前条实现状态缺失或非枚举 → 前条不可判定', () => {
  const fix = twoAudits();
  writeFileSync(fix.prev, auditText({id: PREV_ID, status: '进行中'}), 'utf8');

  const r = run(['link', '--prev', PREV_ID, '--file', fix.current, '--workspace', fix.ws], {cwd: fix.ws});
  assert.equal(r.status, 1);
  assert.match(r.stdout, /前条不可判定/);
  assert.match(readFileSync(fix.current, 'utf8'), /^同类史: 首次$/m);
});

test('init 已存在 → 不得覆盖；已审结 → 已审结不得覆盖', () => {
  const plain = fixture();
  assert.equal(initAudit(plain.ws).status, 0);
  const again = initAudit(plain.ws);
  assert.equal(again.status, 1);
  assert.match(again.stdout, /已存在，不得覆盖/);

  const audited = fixture();
  assert.equal(initAudit(audited.ws).status, 0);
  const file = join(audited.dir, ID + '.md');
  writeFileSync(file, auditText(), 'utf8');
  assert.equal(run(['check', file], {cwd: audited.ws}).status, 0);
  const blocked = initAudit(audited.ws);
  assert.equal(blocked.status, 1);
  assert.match(blocked.stdout, /已审结，不得覆盖/);
});

test('用法与环境错误 exit 2', () => {
  const {ws} = fixture();
  assert.equal(run(['init'], {cwd: ws}).status, 2);
  assert.equal(run(['check'], {cwd: ws}).status, 2);
  assert.equal(run(['check', join(ws, '不存在.md')], {cwd: ws}).status, 2);
  assert.equal(run(['link', '--prev', PREV_ID], {cwd: ws}).status, 2);
  assert.equal(run(['link', '--prev', PREV_ID, '--file', join(ws, '缺.md'), '--workspace', ws], {cwd: ws}).status, 2);
  assert.equal(run(['bogus'], {cwd: ws}).status, 2);
});

test('V5 触发节 - 列表项 ≥10 且含 2.0.7 新增两条', () => {
  const text = readFileSync(PROTOCOL, 'utf8');
  const from = text.indexOf('## 触发');
  const to = text.indexOf('## 三步');
  assert.ok(from >= 0 && to > from, '内审协议.md 缺少「触发」或「三步」节');
  const items = text.slice(from, to).split('\n').filter((line) => line.startsWith('- '));
  assert.ok(items.length >= 10, '触发节 - 列表项 = ' + items.length);
  for (const s of ['有明确下一步却停下复命', '把自己发现的可修缺陷转成「待裁决 / 建议」，只报不改']) {
    assert.ok(items.some((line) => line.includes(s)), '触发节缺 2.0.7 新增项：' + s);
  }
});

// 2.0.7 §2.3 复命闸：夹具全走 mkdtemp，只读不写盘。
function fumingFixture(text) {
  const ws = mkdtempSync(join(tmpdir(), 'ctbz-复命-'));
  const file = join(ws, '复命.md');
  writeFileSync(file, text, 'utf8');
  return file;
}

// 2.0.8 §2.7①：自疑条目逐字三条——满足 G8 三判据、G8b 两两不等、G9 首个箭头前不含特征串。
const DOUBT = [
  '- 断言可能被插入位移击穿 → 证伪实验: node --test tests/主文锚点.test.mjs → 结果: 10 pass / 0 fail',
  "- 夹具段数可能漏改 → 证伪实验: grep -c '自疑:' tests/内审.test.mjs → 结果: exit 0",
  '- 闸门口径可能与计划不符 → 证伪实验: node scripts/内审.mjs 复命 --file /tmp/f.md → 结果: exit 0',
];

function fumingText({extend = ['- 补跑了探活 → docs/探活.md'], fix = ['- 修了部署.js 的 PATH 缺陷 → skills/ctbz/scripts/部署.js'], pending = ['- 删远端数据 | 准入: 不可逆'], doubt = DOUBT, ledger = ['无']} = {}) {
  const list = (items) => (items.length ? items : ['无']);
  return [
    '# 复命 ctbz-2.0.7',
    '',
    '自主延伸:',
    ...list(extend),
    '',
    '自主修复:',
    ...list(fix),
    '',
    '待裁决:',
    ...list(pending),
    '',
    '自疑:',
    ...list(doubt),
    '',
    '行动账增量:',
    ...list(ledger),
    '',
  ].join('\n');
}

function runFuming(file, extra = []) {
  return run(['复命', '--file', file, ...extra]);
}

test('V3 复命闸放行：三段齐全 + 三条准入取值合法 → exit 0，且不改动夹具', () => {
  const file = fumingFixture(
    fumingText({
      pending: ['- 删远端数据 | 准入: 不可逆', '- 改远端数据 | 准入: 四扇门', '- 选 A 还是 B | 准入: 用户要求二选一'],
    })
  );
  const before = readFileSync(file, 'utf8');
  const r = runFuming(file);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /✓ 复命闸通过/);
  assert.equal(readFileSync(file, 'utf8'), before, '复命闸不得写盘');

  const json = runFuming(file, ['--json']);
  assert.equal(json.status, 0, json.stdout);
  assert.equal(json.stdout.trim().split('\n').length, 1);
  assert.deepEqual(JSON.parse(json.stdout), {ok: true, mode: '复命'});
});

test('V3 待裁决: 无 → exit 0（自主延伸 / 自主修复 亦可为 无）', () => {
  const file = fumingFixture(fumingText({extend: [], fix: [], pending: []}));
  const r = runFuming(file);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /✓ 复命闸通过/);
});

test('V3 段缺失 → exit 1', () => {
  const noPending = fumingFixture(['# 复命 x', '', '自主延伸:', '无', '', '自主修复:', '无', '', '自疑:', ...DOUBT, '', '行动账增量:', '无', ''].join('\n'));
  const a = runFuming(noPending);
  assert.equal(a.status, 1, a.stdout);
  assert.match(a.stdout, /缺段标题/);
  assert.match(a.stdout, /待裁决/);

  const noExtend = fumingFixture(['# 复命 x', '', '自主修复:', '无', '', '待裁决:', '无', '', '自疑:', ...DOUBT, '', '行动账增量:', '无', ''].join('\n'));
  const b = runFuming(noExtend);
  assert.equal(b.status, 1, b.stdout);
  assert.match(b.stdout, /缺段标题/);
  assert.match(b.stdout, /自主延伸/);
});

test('V3 准入取值非法 → exit 1；缺 准入: → exit 1', () => {
  const illegal = fumingFixture(fumingText({pending: ['- 事项 | 准入: 两选一']}));
  const a = runFuming(illegal);
  assert.equal(a.status, 1, a.stdout);
  assert.match(a.stdout, /准入取值非枚举/);

  const missing = fumingFixture(fumingText({pending: ['- 事项']}));
  const b = runFuming(missing);
  assert.equal(b.status, 1, b.stdout);
  assert.match(b.stdout, /缺 准入:/);
});

// 2.0.8 §2.7③ / §6 V3–V5、V7：自疑段（G7/G8/G8b/G9）用例，夹具一律复用 fumingText / fumingFixture。
test('V3 G7 自疑条数：2 条 → exit 1；3 条 → exit 0；写 无 → exit 1', () => {
  const two = fumingFixture(fumingText({doubt: DOUBT.slice(0, 2)}));
  const a = runFuming(two);
  assert.equal(a.status, 1, a.stdout);
  assert.match(a.stdout, /自疑条数不足：需 ≥3/);

  const three = fumingFixture(fumingText());
  assert.equal(runFuming(three).status, 0);

  const none = fumingFixture(fumingText({doubt: []}));
  const b = runFuming(none);
  assert.equal(b.status, 1, b.stdout);
  assert.match(b.stdout, /自疑 段不得写 无/);
});

test('V4 G8 三判据：推理词/自然语言结果 → exit 1；命令回显 → exit 0', () => {
  const fake = fumingFixture(fumingText({doubt: ['- X → 证伪实验: 想了一下 → 结果: 应该没问题', DOUBT[1], DOUBT[2]]}));
  const a = runFuming(fake);
  assert.equal(a.status, 1, a.stdout);
  assert.match(a.stdout, /自疑条目缺证伪实验或可核结果/);

  // 只坏 8.2：结果形态合法，但实验本身是推理 → 仍须红（否则 8.3 会替 8.2 兜底）。
  const fakeOnly = fumingFixture(
    fumingText({doubt: ['- 证伪实验本身没跑 → 证伪实验: 想了一下 → 结果: exit 0', DOUBT[1], DOUBT[2]]})
  );
  assert.equal(runFuming(fakeOnly).status, 1, 'G8.2 须独立成立：结果合法也救不了推理型实验');

  const real = fumingFixture(
    fumingText({doubt: ['- X → 证伪实验: node --test tests/内审.test.mjs → 结果: 18 pass / 0 fail', DOUBT[1], DOUBT[2]]})
  );
  assert.equal(runFuming(real).status, 0);
});

test('V4 G8.1/G8.3：半角箭头等价、箭头不足与纯自然语言结果 → exit 1', () => {
  const half = fumingFixture(fumingText({doubt: [DOUBT[2].replace(/→/g, '->'), DOUBT[0], DOUBT[1]]}));
  assert.equal(runFuming(half).status, 0, '半角 -> 与 → 等价（在原始行上计数）');

  const oneArrow = fumingFixture(
    fumingText({doubt: ['- 只有一个箭头 → 证伪实验: node x.mjs 结果: exit 0', DOUBT[0], DOUBT[1]]})
  );
  assert.equal(runFuming(oneArrow).status, 1);

  const pathLine = fumingFixture(
    fumingText({doubt: ['- 证据落在文件行号 → 证伪实验: grep -n SKILL_MARK_RE skills/ctbz/scripts/内审.mjs → 结果: skills/ctbz/scripts/内审.mjs:71', DOUBT[0], DOUBT[1]]})
  );
  assert.equal(runFuming(pathLine).status, 0, 'G9 不扫证据字段：结果里的 skill 路径不得误杀');

  const colonDigit = fumingFixture(
    fumingText({doubt: ['- 白话结果加冒号数字 → 证伪实验: node x.mjs → 结果: 应该没问题 :1', DOUBT[0], DOUBT[1]]})
  );
  assert.equal(runFuming(colonDigit).status, 1, '8.3 只认 `文件:行号` 形态，裸 `:数字` 不得过闸（S16 收窄）');
});

test('V5 G8b 三条重复 → exit 1；G9 指向本 skill / 只报不改 → exit 1', () => {
  const dup = fumingFixture(fumingText({doubt: [DOUBT[0], DOUBT[0], DOUBT[0]]}));
  const a = runFuming(dup);
  assert.equal(a.status, 1, a.stdout);
  assert.match(a.stdout, /自疑条目重复/);

  for (const bad of [
    '- 见发布链 → 证伪实验: node x.mjs → 结果: exit 0',
    '- 建议下次再跑 → 证伪实验: node x.mjs → 结果: exit 0',
  ]) {
    const file = fumingFixture(fumingText({doubt: [bad, DOUBT[1], DOUBT[2]]}));
    const r = runFuming(file);
    assert.equal(r.status, 1, bad + ' → ' + r.stdout);
    assert.match(r.stdout, /自疑条目指向本 skill \/ 只报不改/);
  }
});

// V7：夹具迁五段是既有用例全绿的唯一达成方式——旧四段形态必须在 G7 下红。
test('V7 夹具已迁五段：五段齐全且放行，旧四段形态仍被 G7 拦住', () => {
  const four = fumingText();
  for (const s of ['自主延伸:', '自主修复:', '待裁决:', '自疑:', '行动账增量:']) {
    assert.ok(four.includes(s), '夹具缺段：' + s);
  }
  assert.equal(runFuming(fumingFixture(four)).status, 0);

  const legacy = runFuming(fumingFixture(four.split('自疑:')[0] + '行动账增量:\n无\n'));
  assert.equal(legacy.status, 1, '旧四段夹具在 G7 下必须红');
  assert.match(legacy.stdout, /自疑条数不足/);
});

// V6（2.2.0）：复命第 5 段 `行动账增量:` + G10。
test('V6 复命五段：全齐 exit 0；缺第 5 段报缺段标题；非 无 缺字段/取舍空话 exit 1', () => {
  assert.equal(runFuming(fumingFixture(fumingText())).status, 0, '五段齐全（第 5 段为 无）须放行');

  const full = fumingFixture(fumingText({ledger: ['- A1 顺手补了夹具 | 依据: docs/plan.md:1 | 取舍: 否掉「等下一版」：本版更省 | 证伪: node --test tests/内审.test.mjs → 结果: exit 0']}));
  assert.equal(runFuming(full).status, 0, '非 无 且三字段齐全须放行');

  const legacy = fumingFixture(fumingText().replace('\n行动账增量:\n无\n', '\n'));
  const a = runFuming(legacy);
  assert.equal(a.status, 1, a.stdout);
  assert.match(a.stdout, /缺段标题/);
  assert.match(a.stdout, /行动账增量/);

  const missingField = fumingFixture(fumingText({ledger: ['- A1 顺手补了夹具 | 依据: docs/plan.md:1 | 取舍: 否掉「等下一版」：本版更省']}));
  const b = runFuming(missingField);
  assert.equal(b.status, 1, b.stdout);
  assert.match(b.stdout, /行动账增量缺 证伪/);

  const emptyTrade = fumingFixture(fumingText({ledger: ['- A1 顺手补了夹具 | 依据: docs/plan.md:1 | 取舍: 无 | 证伪: exit 0']}));
  const c = runFuming(emptyTrade);
  assert.equal(c.status, 1, c.stdout);
  assert.match(c.stdout, /取舍为空话/);
});

test('V2 出处指向本 skill 的待裁决条目 → exit 1', () => {
  const file = fumingFixture(fumingText({pending: ['- 发布链还没走到 | 出处: skills/ctbz/SKILL.md:77']}));
  const r = runFuming(file);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /指向本 skill/);

  const json = runFuming(file, ['--json']);
  assert.equal(json.status, 1, json.stdout);
  const out = JSON.parse(json.stdout);
  assert.equal(out.ok, false);
  assert.ok(out.errors.some((e) => /指向本 skill/.test(e)), json.stdout);
});

test('V8 复命闸反绕过：G4 三条口语化出处变体各 → exit 1', () => {
  for (const item of ['- 详见发布链 | 准入: 四扇门', '- 依据本 skill | 准入: 不可逆', '- SKILL.md:77 有说明 | 准入: 四扇门']) {
    const file = fumingFixture(fumingText({pending: [item]}));
    const r = runFuming(file);
    assert.equal(r.status, 1, item + ' → ' + r.stdout);
    assert.match(r.stdout, /指向本 skill/);
  }
});

test('V8 复命闸反绕过：G5 只报不改词 → exit 1', () => {
  for (const item of ['- 建议修一下部署脚本 | 准入: 四扇门', '- 已知缺陷，遗留待处理 | 准入: 不可逆']) {
    const file = fumingFixture(fumingText({pending: [item]}));
    const r = runFuming(file);
    assert.equal(r.status, 1, item + ' → ' + r.stdout);
    assert.match(r.stdout, /只报不改/);
  }
});

test('复命闸其它规则：G2 形态、G3 全角冒号、G6 缺产物路径', () => {
  const shape = fumingFixture(['# 复命 x', '', '自主延伸:', '做了点事', '', '自主修复:', '无', '', '待裁决:', '无', '', '自疑:', ...DOUBT, ''].join('\n'));
  const a = runFuming(shape);
  assert.equal(a.status, 1, a.stdout);
  assert.match(a.stdout, /不合形态/);

  const noArrow = fumingFixture(fumingText({extend: ['- 补跑了探活']}));
  const b = runFuming(noArrow);
  assert.equal(b.status, 1, b.stdout);
  assert.match(b.stdout, /缺产物路径/);

  const fullColon = fumingFixture(fumingText({pending: ['- 事项 | 准入：用户要求二选一']}));
  assert.equal(runFuming(fullColon).status, 0);
});

test('复命闸用法错误 exit 2', () => {
  const {ws} = fixture();
  assert.equal(run(['复命'], {cwd: ws}).status, 2);
  assert.equal(run(['复命', '--file', join(ws, '不存在.md')], {cwd: ws}).status, 2);
});

test('帮助与位置参数顺序', () => {
  const {ws} = fixture();
  const help = run(['-h'], {cwd: ws});
  assert.equal(help.status, 0);
  assert.match(help.stdout, /用法：/);

  assert.equal(initAudit(ws).status, 0);
  const file = join(ws, 'docs', '内审', ID + '.md');
  writeFileSync(file, auditText(), 'utf8');
  assert.equal(run(['check', '--json', file], {cwd: ws}).status, 0);
});
