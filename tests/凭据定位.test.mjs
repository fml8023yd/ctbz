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

const dir_isolated = mkdtempSync(join(tmpdir(), 'ctbz-cred-iso-'));  // 隔离新格式 provider_config.json
function writeConfig(baseURL, apiKey = 'fixture-key') {
  const dir = mkdtempSync(join(tmpdir(), 'ctbz-cred-'));
  const file = join(dir, 'config.json');
  writeFileSync(file, JSON.stringify({provider: {'fixture-wb': {name: 'WB', options: {baseURL, apiKey}}}}));
  return file;
}

function preflight(config) {
  const r = spawnSync(process.execPath,
    [PREFLIGHT, '--json', '--only', 'M2', '--endpoint-override', `M2=${DEAD}`],
    {encoding: 'utf8', env: {...process.env, CTBZ_ZC_CONFIG: config, CTBZ_PROVIDER_CONFIG: join(dir_isolated, 'nonexistent-provider_config.json')}});
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
    {encoding: 'utf8', env: {...process.env, CTBZ_ZC_CONFIG: config, CTBZ_PROVIDER_CONFIG: join(dir_isolated, 'nonexistent-provider_config.json')}});
  assert.equal(r.status, 0);
  assert.match(r.stdout, /127\.0\.0\.1:7864\/v1\/chat\/completions/);
});

// ── 2.1.5：双代配置读取（新格式 provider_config.json 优先）──
// 背景：宿主迁新格式后，旧 config.json 端点会过期（实测旧端点 deepseek 503 而新端点 200），
// 只读旧格式会把可用链路判成故障。此用例锁定「新格式优先、旧格式回退」两条路径。

function writeProviderConfig(baseURL, apiKey = 'fixture-new-key') {
  const dir = mkdtempSync(join(tmpdir(), 'ctbz-pc-'));
  const file = join(dir, 'provider_config.json');
  writeFileSync(file, JSON.stringify({
    schemaVersion: 1,
    config: { providerConfigRules: { providerRules: [
      { providerId: 'fixture-new-wb', providerName: 'WB-New', config: {
        access: { type: 'api-key', apiKey },
        api: { type: 'openai-chat-completions', baseUrl: baseURL },
        personalModelIds: ['glm-5.3'],
      } },
    ] } },
  }));
  return file;
}

test('新格式 provider_config.json 命中凭据（宿主迁新格式后不再假报缺失）', () => {
  const pc = writeProviderConfig('https://work.htibinak.com/v1');
  const r = spawnSync(process.execPath,
    [PREFLIGHT, '--json', '--only', 'M2', '--endpoint-override', `M2=${DEAD}`],
    {encoding: 'utf8', env: {...process.env, CTBZ_PROVIDER_CONFIG: pc, CTBZ_ZC_CONFIG: join(tmpdir(), 'ctbz-no-such-config.json')}});
  const j = JSON.parse(r.stdout);
  assert.equal(j.credentials.workbuddy.present, true, '新格式应命中凭据');
  assert.match(j.credentials.workbuddy.source, /provider-config:/);
  assert.doesNotMatch(j.rows[0].detail, /凭据缺失/);
});

test('新格式优先于旧格式：两者都命中时取新格式端点', () => {
  const pc = writeProviderConfig('https://work.htibinak.com/v1');
  const old = writeConfig('http://127.0.0.1:7864/v1');
  const r = spawnSync(process.execPath,
    [DIRECT, '--plan', planFilePath(), '--workspace', process.cwd(), '--camps', 'zhipu', '--dry-run'],
    {encoding: 'utf8', env: {...process.env, CTBZ_PROVIDER_CONFIG: pc, CTBZ_ZC_CONFIG: old}});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /work\.htibinak\.com/, '新格式端点应优先');
  assert.doesNotMatch(r.stdout, /127\.0\.0\.1:7864/, '旧格式端点不应被选中');
});

function planFilePath() {
  const dir = mkdtempSync(join(tmpdir(), 'ctbz-cred-plan-'));
  const file = join(dir, 'plan.md');
  writeFileSync(file, '# 夹具\n\nreview_scale: 轻\n');
  return file;
}
