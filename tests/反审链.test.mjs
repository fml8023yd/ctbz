// 反审链覆盖回归（2.1.3）：改了 skills/ctbz/scripts 下的脚本却没有「计划/内审」点名，
// 部署必须判红并给出补救命令（机器不靠人的自觉）。
// 夹具为独立 git 仓库（临时目录），零网络、零外部凭据。
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const LIB = join(REPO, 'skills/ctbz/scripts/lib/反审链.mjs');

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'ctbz-chain-'));
  const git = (args) => spawnSync('git', ['-C', dir, ...args], {encoding: 'utf8'});
  git(['init', '-q']);
  git(['config', 'user.email', 'fixture@test']);
  git(['config', 'user.name', 'fixture']);
  mkdirSync(join(dir, 'skills/ctbz/scripts/lib'), {recursive: true});
  mkdirSync(join(dir, '.ctbz-record/反审'), {recursive: true});
  mkdirSync(join(dir, 'docs'), {recursive: true});
  writeFileSync(join(dir, 'skills/ctbz/scripts/target.mjs'), 'export const v = 1;\n');
  git(['add', '-A']);
  git(['commit', '-qm', 'init']);
  return {dir, git};
}

function chain(dir) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import {reviewChainProblems} from ${JSON.stringify(LIB)}; console.log(JSON.stringify(reviewChainProblems(${JSON.stringify(dir)})));`],
    {encoding: 'utf8'});
  return JSON.parse(r.stdout);
}

test('无脚本改动时不拦（文档/测试改动无需反审链）', () => {
  const {dir} = makeRepo();
  writeFileSync(join(dir, 'docs', 'note.md'), 'docs only\n');
  const r = chain(dir);
  assert.equal(r.checked, false);
  assert.equal(r.problems.length, 0);
});

test('脚本改动无覆盖文档 → 判红且给出补救命令', () => {
  const {dir} = makeRepo();
  writeFileSync(join(dir, 'skills/ctbz/scripts/target.mjs'), 'export const v = 2;\n');
  const r = chain(dir);
  assert.equal(r.checked, true);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /target\.mjs/);
  assert.match(r.fix, /反审直连\.mjs/);
  rmSync(dir, {recursive: true, force: true});
});

test('内审记录点名该脚本即放行（缺陷修复路径）', () => {
  const {dir} = makeRepo();
  writeFileSync(join(dir, 'skills/ctbz/scripts/target.mjs'), 'export const v = 3;\n');
  mkdirSync(join(dir, 'docs/内审'), {recursive: true});
  writeFileSync(join(dir, 'docs/内审', 'x.md'),
    '修改项: skills/ctbz/scripts/target.mjs 修复某缺陷；验收：node --test tests/x.test.mjs\n');
  const r = chain(dir);
  assert.equal(r.problems.length, 0);
  rmSync(dir, {recursive: true, force: true});
});

test('中文脚本名可被识别（core.quotePath 关断后不落空）', () => {
  const {dir} = makeRepo();
  writeFileSync(join(dir, 'skills/ctbz/scripts/中文脚本.mjs'), 'export const v = 1;\n');
  const r = chain(dir);
  assert.equal(r.files.length, 1);
  assert.match(r.files[0], /中文脚本\.mjs/);
  rmSync(dir, {recursive: true, force: true});
});
