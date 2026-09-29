// 凭据定位回归（2.1.0 补丁）：渠道 baseURL 前缀变更导致「凭据缺失」假失败
// 夹具配置经 CTBZ_ZC_CONFIG 注入；端点一律指向必然拒绝的地址或 dry-run，零外部网络、零计费。
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const PREFLIGHT = join(REPO, 'skills/ctbz/scripts/preflight.mjs');
const DIRECT = join(REPO, 'skills/ctbz/scripts/反审直连.mjs');
const DEAD = 'http://127.0.0.1:1'; // 连接必拒绝：走到「发请求」即证明凭据已解析

function writeConfig(baseURL, apiKey = 'fixture-key') {
  const dir = mkdtempSync(join(tmpdir(), 'ctbz-cred-'));
  const file = join(dir, 'config.json');
  writeFileSync(file, JSON.stringify({provider: {'fixture-wb': {name: 'WB', options: {baseURL, apiKey}}}}));
  return file;
}

function preflight(config) {
  const r = spawnSync(process.execPath,
    [PREFLIGHT, '--json', '--only', 'M2', '--endpoint-override', `M2=${DEAD}`],
    {encoding: 'utf8', env: {...process.env, CTBZ_ZC_CONFIG: config}});
  return JSON.parse(r.stdout);
}

test('本机网关前缀（127.0.0.1:7864）命中凭据，不再报凭据缺失', () => {
  const j = preflight(writeConfig('http://127.0.0.1:7864/v1'));
  assert.equal(j.credentials.workbuddy.present, true);
  assert.doesNotMatch(j.rows[0].detail, /凭据缺失/);
});

test('旧通道前缀（101.133.151.121:18890）向后兼容', () => {
  const j = preflight(writeConfig('http://101.133.151.121:18890/v1'));
  assert.equal(j.credentials.workbuddy.present, true);
});

test('无关前缀仍判凭据缺失（负例）', () => {
  const j = preflight(writeConfig('http://192.0.2.1/v1'));
  assert.equal(j.credentials.workbuddy.present, false);
  assert.match(j.rows[0].detail, /凭据缺失/);
});

test('后缀伪装前缀不命中（白名单封闭，负例）', () => {
  const j = preflight(writeConfig('http://127.0.0.1:7864/v1.evil'));
  assert.equal(j.credentials.workbuddy.present, false);
});

test('baseURL 为空按凭据缺失处理，不抛异常（边界）', () => {
  const j = preflight(writeConfig(''));
  assert.equal(j.credentials.workbuddy.present, false);
  assert.match(j.rows[0].detail, /凭据缺失/);
});

test('多前缀同时命中时按配置枚举序取首条（确定性）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ctbz-cred-'));
  const file = join(dir, 'config.json');
  writeFileSync(file, JSON.stringify({provider: {
    'wb-alpha': {name: 'A', options: {baseURL: 'http://127.0.0.1:7864/v1', apiKey: 'key-alpha'}},
    'wb-beta': {name: 'B', options: {baseURL: 'http://127.0.0.1:7864/v1/alt', apiKey: 'key-beta'}},
  }}));
  const j = preflight(file);
  assert.equal(j.credentials.workbuddy.present, true);
  assert.equal(j.credentials.workbuddy.source, 'zcode-config:wb-alpha');
});

test('反审直连 dry-run 取宿主配置命中的端点，不写死地址', () => {
  const config = writeConfig('http://127.0.0.1:7864/v1');
  const dir = mkdtempSync(join(tmpdir(), 'ctbz-plan-'));
  const plan = join(dir, 'fixture-plan.md');
  writeFileSync(plan, '# 夹具计划（仅用于 dry-run 端点断言）\n');
  const r = spawnSync(process.execPath, [DIRECT, '--plan', plan, '--dry-run'],
    {encoding: 'utf8', env: {...process.env, CTBZ_ZC_CONFIG: config}});
  assert.equal(r.status, 0);
  assert.match(r.stdout, /127\.0\.0\.1:7864\/v1\/chat\/completions/);
});
