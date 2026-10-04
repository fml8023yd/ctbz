// 健康账本（A3）回归：退避递进 / 成功衰减 / 过期自愈 / 键归一化互认 / 坏 JSON / 文件缺失 /
// retry-after / 显式北京时间 / CLI 向后兼容 / pick-profile 冷却过滤接线。
// 夹具经 CTBZ_HEALTH_FILE 注入临时文件；零网络、零计费。
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdtempSync, writeFileSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  loadLedger, normalizeKey, isCooling, noteFailure, noteSuccess, listLedger, BACKOFF_MS,
} from '../skills/ctbz/scripts/lib/健康账本.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const HEALTH = join(REPO, 'skills/ctbz/scripts/模型健康.js');
const PICK = join(REPO, 'skills/ctbz/scripts/pick-profile');
const HOUR = 3600e3;

// 建临时账本；content 省略=不建文件（测缺失），字符串原样写（测坏 JSON），对象按 JSON 写
function tmpLedger(content) {
  const dir = mkdtempSync(join(tmpdir(), 'ctbz-health-'));
  const file = join(dir, '模型健康.json');
  if (content !== undefined) writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  return file;
}
function useLedger(file) { process.env.CTBZ_HEALTH_FILE = file; return file; }
const entry = (ref) => loadLedger()[ref];

test('退避档递进：第1次30分、第2次1时、第3次4时、第4次起24时（注入 now 断言差值）', () => {
  useLedger(tmpLedger());
  const now = Date.parse('2026-10-05T12:00:00+08:00');
  const deltas = [];
  for (let i = 0; i < 5; i++) deltas.push(Date.parse(noteFailure('workbuddy/glm-5.3', 'boom', now).cooldown_until) - now);
  assert.deepEqual(deltas, [...BACKOFF_MS, BACKOFF_MS[3]]);
  assert.equal(entry('workbuddy/glm-5.3').fail_count, 5);
  assert.equal(entry('workbuddy/glm-5.3').recorded_at, new Date(now).toISOString());
});

test('成功衰减：连续 3 次 noteSuccess 清零（非仅递减：5 次失败后归零）', () => {
  useLedger(tmpLedger());
  const now = Date.parse('2026-10-05T12:00:00+08:00');
  for (let i = 0; i < 5; i++) noteFailure('workbuddy/hy3', 'boom', now);
  const cooled = entry('workbuddy/hy3').cooldown_until;
  assert.deepEqual(
    [noteSuccess('workbuddy/hy3'), noteSuccess('workbuddy/hy3'), noteSuccess('workbuddy/hy3')]
      .map((e) => [e.fail_count, e.success_streak]),
    [[4, 1], [3, 2], [0, 0]],
  );
  // 成功不伪造冷却状态：cooldown_until 只由时间到期自愈
  assert.equal(entry('workbuddy/hy3').cooldown_until, cooled);
});

test('过期自愈：截止已过 → isCooling false；未到 → true（可注入 now）', () => {
  useLedger(tmpLedger({'workbuddy/hy3': {cooldown_until: '2020-01-01T00:00:00.000Z'}}));
  assert.equal(isCooling('workbuddy/hy3'), false);
  assert.equal(listLedger()[0].cooling, false);
  useLedger(tmpLedger({'workbuddy/hy3': {cooldown_until: '2030-01-01T00:00:00.000Z'}}));
  assert.equal(isCooling('workbuddy/hy3'), true);
  assert.equal(isCooling('workbuddy/hy3', Date.parse('2031-01-01T00:00:00Z')), false);
  assert.equal(listLedger()[0].cooling, true);
});

test('归一化互认：custom:xxx:glm-5.3 与 glm-5.3 互相命中，异名不命中', () => {
  useLedger(tmpLedger({'custom:8d56774b-5308:glm-5.3': {cooldown_until: '2030-01-01T00:00:00.000Z'}}));
  assert.equal(isCooling('glm-5.3'), true);
  assert.equal(isCooling('custom:other-provider:glm-5.3'), true);
  assert.equal(isCooling('glm-5.2'), false);
  assert.deepEqual(normalizeKey('custom:a:b'), {model: 'b', raw: 'custom:a:b'});
  assert.deepEqual(normalizeKey('workbuddy/hy3'), {model: 'hy3', raw: 'workbuddy/hy3'});
  assert.deepEqual(normalizeKey('hy3'), {model: 'hy3', raw: 'hy3'});
});

test('坏 JSON → 空账本不抛；随后记账可覆盖修复', () => {
  useLedger(tmpLedger('{ 这不是 JSON'));
  assert.deepEqual(loadLedger(), {});
  assert.equal(isCooling('glm-5.3'), false);
  assert.equal(listLedger().length, 0);
  const e = noteFailure('glm-5.3', 'boom', Date.parse('2026-10-05T12:00:00+08:00'));
  assert.equal(e.fail_count, 1);
  assert.equal(entry('glm-5.3').fail_count, 1);
});

test('文件不存在 → 空账本；记账时自动建文件', () => {
  const file = useLedger(tmpLedger());
  assert.deepEqual(loadLedger(), {});
  assert.deepEqual(listLedger(), []);
  assert.equal(isCooling('workbuddy/hy3'), false);
  noteFailure('workbuddy/hy3', 'boom', Date.parse('2026-10-05T12:00:00+08:00'));
  assert.equal(JSON.parse(readFileSync(file, 'utf8'))['workbuddy/hy3'].fail_count, 1);
});

test('retry-after 秒数解析优先于退避档', () => {
  useLedger(tmpLedger());
  const now = Date.parse('2026-10-05T12:00:00+08:00');
  const e = noteFailure('workbuddy/glm-5.3-flash', '[429][rate limit exceeded, retry after 3600s]', now);
  assert.equal(e.cooldown_until, new Date(now + 1 * HOUR).toISOString());
});

test('显式日期时间按北京时间解析', () => {
  useLedger(tmpLedger());
  const now = Date.parse('2026-10-05T12:00:00+08:00');
  const e = noteFailure('workbuddy/hy3', '[1310][您已达到上限，限额将在 2026-10-06 12:00:00 重置。]', now);
  assert.equal(e.cooldown_until, '2026-10-06T04:00:00.000Z');
});

test('CLI 兼容：report/check/list 形状不变，归一化双读使 check 短名命中，冷却中 exit 1', () => {
  const file = tmpLedger();
  const env = {...process.env, CTBZ_HEALTH_FILE: file};
  const run = (...args) => spawnSync(process.execPath, [HEALTH, ...args], {encoding: 'utf8', env});
  let r = run('report', 'workbuddy/hy3', '[1310][限额将在 2030-01-02 12:00:00 重置。]');
  assert.equal(r.status, 0, r.stderr);
  const rep = JSON.parse(r.stdout);
  assert.deepEqual({ok: rep.ok, model: rep.model, until: rep.cooldown_until}, {ok: true, model: 'workbuddy/hy3', until: '2030-01-02T04:00:00.000Z'});
  r = run('check', 'hy3');
  assert.equal(r.status, 1);
  assert.ok(JSON.parse(r.stdout).冷却中.hy3, r.stdout);
  r = run('check', 'glm-5.3');
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout).可派发, ['glm-5.3']);
  assert.equal(JSON.parse(run('list').stdout)['workbuddy/hy3'].状态, '冷却中');
  assert.equal(run('').status, 2); // 用法行覆盖 ok/migrate
});

test('ok 子命令衰减计数；migrate 只读列旧键不做破坏性转换', () => {
  const file = tmpLedger({'custom:8d56774b:hy3': {cooldown_until: '2020-01-01T00:00:00.000Z', fail_count: 2}});
  const env = {...process.env, CTBZ_HEALTH_FILE: file};
  const run = (...args) => spawnSync(process.execPath, [HEALTH, ...args], {encoding: 'utf8', env});
  const ok = JSON.parse(run('ok', 'custom:8d56774b:hy3').stdout);
  assert.deepEqual([ok.fail_count, ok.success_streak], [1, 1]);
  const mig = JSON.parse(run('migrate').stdout);
  assert.equal(mig.旧键可读, true);
  assert.equal(mig.keys, 1);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(file, 'utf8'))), ['custom:8d56774b:hy3']); // 旧键原样保留
  writeFileSync(file, '{ 坏账本');
  assert.equal(run('migrate').status, 1); // 坏 JSON 明确失败，不静默全绿
});

test('pick-profile 接线：冷却槽出局滑向次选；全冷却兜底输出并打 cooling:true', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ctbz-health-pick-'));
  const rulesFile = join(dir, 'rules.json');
  writeFileSync(rulesFile, JSON.stringify({
    timezone: 'Asia/Shanghai',
    role_tier: {heavy: ['planner'], light: ['implementer']},
    rules: [
      {id: 'RA', enabled: true, priority: 1, type: 'free_model', model: 'custom:prov-a:glm-5.3', action: {try_profile: 'profA', parallel_multiplier: 3}},
      {id: 'RB', enabled: true, priority: 2, type: 'free_model', model: 'custom:prov-b:hy3', action: {try_profile: 'profB', parallel_multiplier: 3}},
    ],
  }));
  const ledger = tmpLedger({'custom:prov-a:glm-5.3': {cooldown_until: '2030-01-01T00:00:00.000Z'}});
  const run = () => spawnSync(process.execPath, [PICK, '--role', 'implementer', '--rules', rulesFile],
    {encoding: 'utf8', env: {...process.env, CTBZ_HEALTH_FILE: ledger}});
  let out = JSON.parse(run().stdout);
  assert.equal(out.hit.rule, 'RB'); // RA 冷却出局，短名互认命中完整 ref
  assert.equal(out.hit.cooling, undefined);
  writeFileSync(ledger, JSON.stringify({
    'custom:prov-a:glm-5.3': {cooldown_until: '2030-01-01T00:00:00.000Z'},
    'custom:prov-b:hy3': {cooldown_until: '2030-01-01T00:00:00.000Z'},
  }));
  out = JSON.parse(run().stdout);
  assert.equal(out.hit.rule, 'RA'); // 全候选冷却：兜底首选项，不空解
  assert.equal(out.hit.cooling, true);
  writeFileSync(ledger, '{}');
  out = JSON.parse(run().stdout);
  assert.equal(out.hit.rule, 'RA'); // 无冷却时行为不变
  assert.ok(!out.hit.cooling);
});
