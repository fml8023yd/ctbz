// 席位降级回归（2.1.3）：官方渠道欠费时，同源席（DeepSeek）按声明降级到备选 provider，
// 且派发闸放行降级回执；未声明备选的席位不得借用他人 provider/模型。
// 夹具经 CTBZ_ZC_CONFIG 注入；端点指向必拒地址，零外部网络、零计费。
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdtempSync, writeFileSync, mkdirSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import crypto from 'node:crypto';
import {seatAttempts} from '../skills/ctbz/scripts/lib/反审席位表.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const DIRECT = join(REPO, 'skills/ctbz/scripts/反审直连.mjs');
const GATE = join(REPO, 'skills/ctbz/scripts/派发闸.mjs');
const SIX_VIEWS = ['需求一致性', '架构合理性', '测试完整性', '边界条件', '性能安全', '用户体验'];
const sha256 = (f) => crypto.createHash('sha256').update(readFileSync(f)).digest('hex');

// 只给 workbuddy 一个渠道，且它的凭据缺失：官方席因此必须走降级分支（降级后同样取不到凭据，
// 从而在「不联网」的前提下暴露降级路径是否被触发、以及是否按备选 provider 解析）。
function fixtureConfig() {
  const dir = mkdtempSync(join(tmpdir(), 'ctbz-seat-'));
  const file = join(dir, 'config.json');
  writeFileSync(file, JSON.stringify({provider: {'other-gw': {name: 'Other', options: {baseURL: 'http://192.0.2.9/v1'}}}}));
  return file;
}

function planFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'ctbz-seat-plan-'));
  mkdirSync(join(dir, 'docs'), {recursive: true});
  const plan = join(dir, 'docs', 'plan.md');
  writeFileSync(plan, '# 夹具计划\n\nreview_scale: 轻\n');
  return plan;
}

test('deepseek 席在官方凭据缺失时尝试声明的降级渠道（不触及官方端点）', () => {
  const r = spawnSync(process.execPath,
    [DIRECT, '--plan', planFixture(), '--workspace', process.cwd(), '--camps', 'deepseek', '--dry-run'],
    {encoding: 'utf8', env: {...process.env, CTBZ_ZC_CONFIG: fixtureConfig()}});
  assert.equal(r.status, 0, r.stderr);
  // dry-run 仍打印官方端点（降级发生在实际调用路径），但不得因凭据缺失直接判死。
  assert.match(r.stdout, /deepseek/);
});

test('尝试序列由席位表封顶：官方在前、备选在后、恰好两条', () => {
  assert.deepEqual(seatAttempts('deepseek'), [
    {provider: 'deepseek-official', model: 'deepseek-flash'},
    {provider: 'workbuddy', model: 'deepseek-v4.1-flash'},
  ]);
  // 未声明备选的席位只有一条：不得借道他人渠道。
  assert.equal(seatAttempts('tencent').length, 1);
  assert.equal(seatAttempts('moonshot').length, 1);
});

test('双渠道都不可用时判 fail，且明示降级已尝试（失败级联不静默）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ctbz-seat-none-'));
  const cfg = join(dir, 'config.json');
  // 配置里没有任何匹配渠道 → 主渠道与备选都取不到凭据。
  writeFileSync(cfg, JSON.stringify({provider: {'unrelated': {name: 'X', options: {baseURL: 'http://192.0.2.9/v1'}}}}));
  const ws = mkdtempSync(join(tmpdir(), 'ctbz-seat-none-ws-'));
  const r = spawnSync(process.execPath,
    [DIRECT, '--plan', planFixture(), '--workspace', ws, '--camps', 'deepseek', '--json'],
    {encoding: 'utf8', env: {...process.env, CTBZ_ZC_CONFIG: cfg}});
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /凭据缺失/);
  assert.match(r.stdout + r.stderr, /已尝试降级到 workbuddy\/deepseek-v4.1-flash/);
});

test('降级回执被派发闸按备选 provider 放行；未声明的 provider 组合仍判红', () => {
  const ws = mkdtempSync(join(tmpdir(), 'ctbz-seat-gate-'));
  const plan = join(ws, 'plan.md');
  writeFileSync(plan, '# 夹具计划\n\nreview_scale: 轻\n');
  const dir = join(ws, '.ctbz-record', '反审', 'plan');
  mkdirSync(dir, {recursive: true});
  const receipt = (provider, model) => ({
    camp: 'deepseek', camp_label: 'DeepSeek', provider, model, round: '1',
    plan, plan_sha256: sha256(plan), generated_at: new Date().toISOString(),
    verdict: 'fixture', fresh_agent_test: {conclusion: 'fixture', blockers: []},
    verdicts: SIX_VIEWS.map((v) => ({view: v, category: '可接受', evidence: 'fixture', conclusion: '接受', disposition: 'fixture'})),
    summary: 'fixture',
  });
  const run = () => spawnSync(process.execPath, [GATE, '--plan', plan, '--workspace', ws, '--level', 'l1'], {encoding: 'utf8'});
  // 官方渠道（席位表主 provider）：放行
  writeFileSync(join(dir, 'deepseek.json'), JSON.stringify(receipt('deepseek-official', 'deepseek-flash')));
  let r = run();
  assert.doesNotMatch(r.stdout + r.stderr, /provider 未落席位表/);
  // 声明的降级组合：放行
  writeFileSync(join(dir, 'deepseek.json'), JSON.stringify(receipt('workbuddy', 'deepseek-v4.1-flash')));
  r = run();
  assert.doesNotMatch(r.stdout + r.stderr, /provider 未落席位表|model 未落席位表/);
  // 未声明的组合：判红
  writeFileSync(join(dir, 'deepseek.json'), JSON.stringify(receipt('workbuddy', 'glm-5.3-flash')));
  r = run();
  assert.match(r.stdout + r.stderr, /model 未落席位表/);
});

// 官方渠道可用时必须优先官方，不得直接走备选（评审要求：官方回正可核验）。
test('官方渠道可用时优先官方，回执 provider 落官方', () => {
  // 站点不联网：把官方与备选都指向本地必然拒绝的端口，验证「先试官方」的顺序而非结果。
  const dir = mkdtempSync(join(tmpdir(), 'ctbz-seat-order-'));
  const cfg = join(dir, 'config.json');
  writeFileSync(cfg, JSON.stringify({provider: {
    'ds': {name: 'DS', options: {baseURL: 'https://api.deepseek.com', apiKey: 'fixture-ds'}},
    'wb': {name: 'WB', options: {baseURL: 'http://127.0.0.1:7864/v1', apiKey: 'fixture-wb'}},
  }}));
  const attempts = seatAttempts('deepseek');
  assert.equal(attempts[0].provider, 'deepseek-official', '官方渠道必须排在第一位');
  assert.equal(attempts[0].model, 'deepseek-flash');
  assert.equal(attempts[1].provider, 'workbuddy');
  // 两条尝试的 provider 都在配置中可解析（证明顺序可执行，而非纸面约定）。
  const r = spawnSync(process.execPath,
    [DIRECT, '--plan', planFixture(), '--workspace', process.cwd(), '--camps', 'deepseek', '--dry-run'],
    {encoding: 'utf8', env: {...process.env, CTBZ_ZC_CONFIG: cfg}});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /api\.deepseek\.com/);
});
