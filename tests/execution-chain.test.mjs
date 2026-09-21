import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {initialize, selectProfile, highest} from '../skills/ctbz/scripts/lib/初始化.mjs';
import {route, defaultRules, atomic, safe, read} from '../skills/ctbz/scripts/lib/本机配置.mjs';

const root = fileURLToPath(new URL('../skills/ctbz/', import.meta.url));
const scripts = path.join(root, 'scripts');
const RETIRED_RE = /dsh 版不支持 ZCode profile 注册链/;

test('已删除的 lib/model-ref.mjs 不再存在（退役件已移除）', () => {
  assert.equal(fs.existsSync(path.join(scripts, 'lib', 'model-ref.mjs')), false);
});

test('初始化.mjs 的注册链导出（initialize/selectProfile/highest）已退役并抛退役文案', () => {
  assert.throws(() => initialize({}, {}, []), RETIRED_RE);
  assert.throws(() => selectProfile(), RETIRED_RE);
  assert.throws(() => highest(), RETIRED_RE);
});

test('本机配置.mjs 的 ZCode 路由函数已退役，safe/read 保留', () => {
  assert.throws(() => route(), RETIRED_RE);
  assert.throws(() => defaultRules(), RETIRED_RE);
  assert.throws(() => atomic(), RETIRED_RE);
  // safe/read 是 scripts/lib/存储位置.mjs 仍依赖的保留函数，必须继续可用。
  // 注意：macOS 下 os.tmpdir() 返回 /var/folders/...（软链到 /private/var），safe 拒绝软链，
  // 故 realpath 归一后再断言。
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-safe-')));
  const f = path.join(dir, 'a.json');
  fs.writeFileSync(f, JSON.stringify({x: 1}));
  assert.equal(safe(f), f);
  assert.deepEqual(read(f), {x: 1});
});

test('initialize CLI 是存根：exit 非 0 并报退役文案', () => {
  const r = spawnSync(process.execPath, [path.join(scripts, 'initialize'), 'prepare'], {encoding: 'utf8'});
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /已退役/);
  assert.match(r.stderr, /dsh 版不支持 ZCode profile 注册链/);
});

test('status --smoke 通过（dsh 版 status 冒烟，不依赖 ZCode 发现链）', () => {
  const r = spawnSync(process.execPath, [path.join(scripts, 'status'), '--smoke'], {encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).ok, true);
  assert.equal(JSON.parse(r.stdout).pathsModuleLoaded, true);
});
