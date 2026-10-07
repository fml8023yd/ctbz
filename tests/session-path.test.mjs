import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'adapters/zcode/scripts/initialize');
const TMP = realpathSync(tmpdir());

test('initialize 默认 session 根锚定 workspace/.zcode/ctbz，不读取全局 locator', () => {
  const home = mkdtempSync(join(TMP, 'ctbz-home-'));
  const workspace = mkdtempSync(join(TMP, 'ctbz-workspace-'));
  mkdirSync(join(home, '.zcode'), { recursive: true });
  writeFileSync(join(home, '.ctbz-location.json'), JSON.stringify({ schemaVersion: 1, root: join(home, 'legacy') }));
  const r = spawnSync(process.execPath, [SCRIPT, 'status', '--workspace', workspace], {
    encoding: 'utf8', env: { ...process.env, HOME: home },
  });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.home, join(workspace, '.zcode', 'ctbz'));
  assert.equal(out.home.includes('legacy'), false);
});

test('initialize 显式 --home 保留旧状态兼容', () => {
  const home = mkdtempSync(join(TMP, 'ctbz-home-'));
  const legacy = join(home, 'legacy');
  mkdirSync(legacy, { recursive: true });
  const workspace = mkdtempSync(join(TMP, 'ctbz-workspace-'));
  const r = spawnSync(process.execPath, [SCRIPT, 'status', '--workspace', workspace, '--home', legacy], {
    encoding: 'utf8', env: { ...process.env, HOME: home },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).home, legacy);
  assert.equal(JSON.parse(r.stdout).legacyReadOnly, true);
});

test('explicit global session overrides cannot prepare, activate or select outside project .zcode', () => {
  const home = mkdtempSync(join(TMP, 'ctbz-legacy-'));
  const workspace = mkdtempSync(join(TMP, 'ctbz-isolated-'));
  const sentinel = join(home, 'sentinel.txt');
  writeFileSync(sentinel, 'preserve');
  for (const command of ['prepare', 'activate', 'select']) {
    for (const flag of ['--home', '--storage']) {
      const r = spawnSync(process.execPath, [SCRIPT, command, '--workspace', workspace, flag, home, '--session', 'real-fixture'], {encoding: 'utf8'});
      assert.equal(r.status, 1);
      assert.match(r.stderr, /Session 必须位于当前项目 \.zcode/);
    }
  }
  assert.equal(readFileSync(sentinel, 'utf8'), 'preserve');
  assert.deepEqual(readdirSync(home), ['sentinel.txt']);
});
