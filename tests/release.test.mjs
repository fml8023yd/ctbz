import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {deploy, packages, packageSnapshot, verifyRepository, verifyPackage, writeLock} from '../skills/ctbz/scripts/lib/release.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const temporary = label => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `ctbz-${label}-`)));
function copiedRepo() {
  const copy = temporary('source');
  for (const pkg of packages(repo)) fs.cpSync(pkg.source, path.join(copy, path.relative(repo, pkg.source)), {recursive: true});
  return copy;
}

test('source locks detect changed, added and deleted files; checks never rewrite locks', () => {
  const copy = copiedRepo(), core = path.join(copy, 'skills/ctbz');
  const originalLock = fs.readFileSync(path.join(core, 'dependencies.lock.json'), 'utf8');
  const skill = fs.readFileSync(path.join(core, 'SKILL.md'), 'utf8');
  fs.appendFileSync(path.join(core, 'SKILL.md'), '\nchanged');
  assert.throws(() => verifyRepository(copy), /lock mismatch/);
  fs.writeFileSync(path.join(core, 'SKILL.md'), skill);
  fs.writeFileSync(path.join(core, 'new-file.txt'), 'added');
  assert.throws(() => verifyRepository(copy), /new-file/);
  fs.unlinkSync(path.join(core, 'new-file.txt'));
  fs.unlinkSync(path.join(core, 'scripts/methods'));
  assert.throws(() => verifyRepository(copy), /scripts\/methods/);
  assert.equal(fs.readFileSync(path.join(core, 'dependencies.lock.json'), 'utf8'), originalLock);
});

test('isolated install uses one core and private adapters; failed replacement restores all old installations', () => {
  const home = temporary('install');
  const first = deploy(repo, home);
  assert.equal(first.installed.length, 3);
  for (const pkg of packages(repo)) {
    const destination = path.join(home, pkg.target);
    verifyPackage(destination, pkg.id);
    assert.deepEqual(packageSnapshot(destination), packageSnapshot(pkg.source));
    if (pkg.id !== 'core') assert.equal(fs.existsSync(path.join(destination, 'methods')), false);
  }
  const baseline = fs.readFileSync(path.join(home, '.ctbz-install/baseline.json'), 'utf8');
  const zcode = spawnSync(process.execPath, [path.join(home, '.zcode/skills/ctbz-zcode/scripts/initialize'), 'status', '--workspace', home], {encoding: 'utf8'});
  assert.equal(zcode.status, 0, zcode.stderr);
  assert.equal(JSON.parse(zcode.stdout).mode, 'parent-only');
  assert.throws(() => deploy(repo, home, {failAt: 'zcode'}), /injected/);
  assert.equal(fs.readFileSync(path.join(home, '.ctbz-install/baseline.json'), 'utf8'), baseline);
  const installedCore = path.join(home, '.agents/skills/ctbz');
  const lockBefore = fs.readFileSync(path.join(installedCore, 'dependencies.lock.json'), 'utf8');
  const refused = spawnSync(process.execPath, [path.join(installedCore, 'scripts/发布检查.js'), installedCore, '--write-lock'], {encoding: 'utf8'});
  assert.equal(refused.status, 1);
  assert.equal(fs.readFileSync(path.join(installedCore, 'dependencies.lock.json'), 'utf8'), lockBefore);
  assert.equal(deploy(repo, home, {checkOnly: true}).ok, true);
  for (const pkg of packages(repo)) assert.deepEqual(packageSnapshot(path.join(home, pkg.target)), packageSnapshot(pkg.source));
  fs.unlinkSync(path.join(home, '.agents/skills/ctbz/scripts/methods'));
  assert.throws(() => deploy(repo, home), /drift/);
});

test('first install preserves custom old content in recoverable backup and refuses local configuration in packages', () => {
  const home = temporary('legacy');
  fs.mkdirSync(path.join(home, '.agents/skills/ctbz'), {recursive: true});
  fs.writeFileSync(path.join(home, '.agents/skills/ctbz/custom.txt'), 'raw user data');
  const result = deploy(repo, home);
  assert.equal(fs.readFileSync(path.join(result.backup, 'core/custom.txt'), 'utf8'), 'raw user data');
  const copy = copiedRepo();
  fs.writeFileSync(path.join(copy, 'adapters/zcode/config.json'), '{"local":true}');
  assert.throws(() => writeLock(path.join(copy, 'adapters/zcode')), /local state/);
});

test('CLI check-only preserves files and local release archive contains only isolated packages', () => {
  const home = temporary('cli');
  const deployScript = path.join(repo, 'skills/ctbz/scripts/部署.js');
  const result = spawnSync(process.execPath, [deployScript, '--home-dir', home], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  const baseline = fs.readFileSync(path.join(home, '.ctbz-install/baseline.json'), 'utf8');
  const checked = spawnSync(process.execPath, [deployScript, '--home-dir', home, '--check-only'], {encoding: 'utf8'});
  assert.equal(checked.status, 0, checked.stderr);
  assert.equal(fs.readFileSync(path.join(home, '.ctbz-install/baseline.json'), 'utf8'), baseline);
  const archive = path.join(temporary('archive'), 'ctbz.tar.gz');
  execFileSync(process.execPath, [path.join(repo, 'skills/ctbz/scripts/release.mjs'), '--output', archive]);
  const contents = execFileSync('tar', ['-tzf', archive], {encoding: 'utf8'}).split('\n');
  assert.ok(contents.includes('skills/ctbz/SKILL.md'));
  assert.ok(contents.includes('adapters/codex/SKILL.md'));
  assert.ok(contents.includes('adapters/zcode/SKILL.md'));
  assert.equal(contents.some(file => /\.ctbz-record|credentials\.json|\/config\.json|setting\.yaml/.test(file)), false);
  const extract = temporary('extracted');
  execFileSync('tar', ['-xzf', archive, '-C', extract]);
  assert.equal(verifyRepository(extract).length, 3);
  assert.equal(deploy(extract, temporary('new-machine')).ok, true);
});
