import fs from 'node:fs';
import path from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {bundleFiles, verifyBundle} from './methods.mjs';

export const VERSION = '0.2.2';
export const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
export const packages = repo => [
  {id: 'core', source: path.join(repo, 'skills/ctbz'), target: '.agents/skills/ctbz'},
  {id: 'codex', source: path.join(repo, 'adapters/codex'), target: '.codex/skills/ctbz-codex'},
  {id: 'zcode', source: path.join(repo, 'adapters/zcode'), target: '.zcode/skills/ctbz-zcode'},
];
const digest = value => createHash('sha256').update(value).digest('hex');
const localNames = new Set(['.ctbz-record', '.git', '.backups', '__pycache__', '.DS_Store', 'credentials.json', 'config.json', '调用规则.json', '初始化状态.json', 'setting.yaml', '模型健康.json', '.env']);

function files(root) {
  const list = bundleFiles(root);
  if (list.some(file => file.split('/').some(part => localNames.has(part) || part.startsWith('.env.')))) throw Error('package contains local state or credentials');
  return list;
}

export function packageSnapshot(root) {
  return Object.fromEntries(files(root).map(file => [file, digest(fs.readFileSync(path.join(root, file)))]));
}

export function writeLock(root) {
  const snapshot = packageSnapshot(root);
  fs.writeFileSync(path.join(root, 'dependencies.lock.json'), JSON.stringify({schemaVersion: 1, files: Object.entries(snapshot).map(([path, sha256]) => ({path, sha256}))}, null, 2) + '\n');
}

export function verifyPackage(root, id) {
  const actual = packageSnapshot(root);
  const lockPath = path.join(root, 'dependencies.lock.json');
  if (!fs.lstatSync(lockPath).isFile() || fs.lstatSync(lockPath).isSymbolicLink()) throw Error('lock must be a regular file');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  if (lock.schemaVersion !== 1 || !Array.isArray(lock.files)) throw Error('invalid package lock');
  const expected = Object.create(null);
  for (const entry of lock.files) {
    if (!entry || typeof entry.path !== 'string' || Object.hasOwn(expected, entry.path) || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw Error('invalid or duplicate lock entry');
    expected[entry.path] = entry.sha256;
  }
  const names = [...new Set([...Object.keys(actual), ...Object.keys(expected)])];
  const drift = names.filter(file => actual[file] !== expected[file]);
  if (drift.length) throw Error(`${id} source lock mismatch: ${drift.join(', ')}`);
  const skill = fs.readFileSync(path.join(root, 'SKILL.md'), 'utf8');
  if (!new RegExp(`^  version: ${VERSION.replaceAll('.', '\\.')}$`, 'm').test(skill)) throw Error(`${id} version mismatch`);
  if (id === 'core') {
    if (JSON.parse(fs.readFileSync(path.join(root, '角色清单.json'), 'utf8')).version !== VERSION) throw Error('role registry version mismatch');
    if (JSON.parse(fs.readFileSync(path.join(root, 'methods/index.json'), 'utf8')).version !== VERSION) throw Error('method registry version mismatch');
    verifyBundle(root);
    const client = fs.readFileSync(path.join(root, 'vendor/workbench/client.mjs'));
    const source = JSON.parse(fs.readFileSync(path.join(root, 'vendor/workbench/source.json'), 'utf8'));
    if (source.version !== VERSION || source.sha256 !== digest(client)) throw Error('workbench client source hash mismatch');
  } else {
    const metadata = JSON.parse(fs.readFileSync(path.join(root, 'adapter.json'), 'utf8'));
    if (metadata.harness !== id || metadata.version !== VERSION) throw Error('adapter identity mismatch');
    if (Object.keys(actual).some(file => /^(methods|dashboard|vendor)\//.test(file))) throw Error('adapter contains a duplicate core');
  }
  return {id, root, files: names.length, fingerprint: digest(JSON.stringify(actual))};
}

export function verifyRepository(repo = repositoryRoot) {
  return packages(repo).map(pkg => verifyPackage(pkg.source, pkg.id));
}

function assertNoSymlink(target) {
  const parts = path.resolve(target).split(path.sep).filter(Boolean);
  let current = path.parse(path.resolve(target)).root;
  for (const part of parts) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw Error(`refuse symlink install path: ${current}`);
  }
}
function installedSnapshot(root) {
  const snapshot = packageSnapshot(root);
  snapshot['dependencies.lock.json'] = digest(fs.readFileSync(path.join(root, 'dependencies.lock.json')));
  return snapshot;
}

// 流程资产：把核心包 assets/流程 模板安装到 <home>/.ctbz/流程/
// 仅当目标不存在或为空时安装；目标已有任何文件（含用户条目）则整体不动。
// 模板只含空骨架与脚本，不含用户 entries、本机绝对路径与凭据。
function installProcessAssets(repo, home) {
  const source = path.join(repo, 'skills/ctbz/assets/流程');
  const target = path.join(home, '.ctbz', '流程');
  assertNoSymlink(target);
  if (fs.existsSync(target)) {
    const existing = fs.readdirSync(target);
    if (existing.length) return {installed: false, reason: 'target-not-empty', target, entries: existing};
  } else {
    fs.mkdirSync(path.dirname(target), {recursive: true});
  }
  const staging = path.join(home, '.ctbz-install', `process-assets-${randomUUID()}`);
  fs.mkdirSync(path.dirname(staging), {recursive: true});
  fs.cpSync(source, staging, {recursive: true});
  fs.renameSync(staging, target);
  return {installed: true, target, entries: fs.readdirSync(target)};
}

// 部署后自检：骨架在位且 node 可启动。不依赖任何条目，不写 index.json。
function selfCheckProcessAssets(home) {
  const target = path.join(home, '.ctbz', '流程');
  const required = ['查.mjs', '验.mjs'];
  const missing = required.filter(name => !fs.existsSync(path.join(target, name)));
  if (missing.length) throw Error(`流程资产自检失败: 缺少 ${missing.join(', ')}`);
  try {
    execFileSync(process.execPath, [path.join(target, '验.mjs'), '--self'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
  } catch (error) {
    throw Error(`流程资产自检失败: ${error.stderr || error.message}`);
  }
  return {ok: true, target};
}

export function deploy(repo, home, {checkOnly = false, failAt} = {}) {
  if (!path.isAbsolute(home)) throw Error('--home-dir must be absolute');
  const sources = packages(repo);
  verifyRepository(repo);
  for (const pkg of sources) assertNoSymlink(path.join(home, pkg.target));
  if (checkOnly) return {ok: true, checkOnly: true, packages: sources.map(pkg => verifyPackage(path.join(home, pkg.target), pkg.id))};
  const maintenance = path.join(home, '.ctbz-install');
  assertNoSymlink(maintenance);
  fs.mkdirSync(maintenance, {recursive: true});
  const lock = path.join(maintenance, 'install.lock');
  const fd = fs.openSync(lock, 'wx');
  const id = randomUUID(), transaction = path.join(maintenance, 'transactions', id);
  const baselineFile = path.join(maintenance, 'baseline.json');
  const changed = [];
  try {
    if (fs.existsSync(baselineFile)) {
      const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
      for (const pkg of sources) {
        const target = path.join(home, pkg.target);
        const actual = fs.existsSync(target) ? installedSnapshot(target) : {};
        if (JSON.stringify(actual) !== JSON.stringify(baseline.packages[pkg.id])) throw Error(`installed ${pkg.id} drift; preserve changes before replacing`);
      }
    }
    for (const pkg of sources) {
      const stage = path.join(transaction, 'staging', pkg.id);
      fs.mkdirSync(path.dirname(stage), {recursive: true});
      fs.cpSync(pkg.source, stage, {recursive: true, errorOnExist: true, force: false});
      verifyPackage(stage, pkg.id);
    }
    for (const pkg of sources) {
      const target = path.join(home, pkg.target), backup = path.join(transaction, 'backup', pkg.id);
      fs.mkdirSync(path.dirname(target), {recursive: true});
      const prior = fs.existsSync(target);
      if (prior) { fs.mkdirSync(path.dirname(backup), {recursive: true}); fs.renameSync(target, backup); }
      const entry = {target, backup, prior, published: false};
      changed.push(entry);
      if (failAt === pkg.id) throw Error(`injected install failure at ${pkg.id}`);
      fs.renameSync(path.join(transaction, 'staging', pkg.id), target);
      entry.published = true;
      verifyPackage(target, pkg.id);
    }
    const baseline = {schemaVersion: 1, version: VERSION, transaction, packages: Object.fromEntries(sources.map(pkg => [pkg.id, installedSnapshot(path.join(home, pkg.target))]))};
    const temporary = path.join(maintenance, `baseline-${id}.tmp`);
    fs.writeFileSync(temporary, JSON.stringify(baseline, null, 2) + '\n');
    fs.renameSync(temporary, baselineFile);
    // 流程资产模板：仅当 ~/.ctbz/流程 不存在或为空时安装；用户已有条目不动。
    // 失败不回滚已安装的技能包（备份/回滚路径由上方 changed 列表负责），单独报错。
    const processAssets = installProcessAssets(repo, home);
    const processSelfCheck = processAssets.installed ? selfCheckProcessAssets(home) : {ok: true, skipped: 'target-not-empty'};
    return {ok: true, version: VERSION, home, backup: path.join(transaction, 'backup'), installed: sources.map(pkg => path.join(home, pkg.target)), processAssets, processSelfCheck};
  } catch (error) {
    for (const entry of changed.reverse()) {
      if (entry.published) fs.rmSync(entry.target, {recursive: true});
      if (entry.prior) fs.renameSync(entry.backup, entry.target);
    }
    throw error;
  } finally {
    fs.rmSync(path.join(transaction, 'staging'), {recursive: true, force: true});
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}
