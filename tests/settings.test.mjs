import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DEFAULTS, mergeInherit} from '../skills/ctbz/scripts/settings.js';

test('new settings wait thirty minutes without enabling automatic mode', () => {
  assert.equal(DEFAULTS.权限边界.计划超时自动执行, 30);
  assert.equal(DEFAULTS.权限边界.执行档位, '标准');
});
test('inheritance preserves an explicit opt out and other user settings', () => {
  const {merged} = mergeInherit(DEFAULTS, [{from:'existing', data:{权限边界:{计划超时自动执行:0, 可写目录:['/task']}}}]);
  assert.equal(merged.权限边界.计划超时自动执行, 0);
  assert.deepEqual(merged.权限边界.可写目录, ['/task']);
  assert.equal(DEFAULTS.权限边界.计划超时自动执行, 30);
});
test('settings CLI resolves the Chinese source path before showing usage', () => {
  const script=fileURLToPath(new URL('../skills/ctbz/scripts/settings.js',import.meta.url));
  const result=spawnSync(process.execPath,[script],{encoding:'utf8'});
  assert.equal(result.status,2);
  assert.match(result.stdout,/用法/);
  assert.equal(result.stderr,'');
});
