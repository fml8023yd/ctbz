import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export const installRoot = fs.realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
const digest = value => createHash('sha256').update(value).digest('hex');
const expected = ['brainstorming','dispatching-parallel-agents','executing-plans','finishing-a-development-branch','receiving-code-review','requesting-code-review','subagent-driven-development','systematic-debugging','test-driven-development','using-git-worktrees','using-superpowers','verification-before-completion','writing-plans','writing-skills','ponytail','i-have-adhd'].sort();

export function bundleFiles(root = installRoot) {
  const files = [];
  function walk(relative) {
    const location = path.join(root, relative), stat = fs.lstatSync(location);
    if (stat.isSymbolicLink()) throw Error(`内置依赖禁止符号链接: ${relative}`);
    if (stat.isDirectory()) for (const entry of fs.readdirSync(location).sort()) {
      if (!relative && entry === 'dependencies.lock.json') continue;
      walk(relative ? `${relative}/${entry}` : entry);
    }
    else if (stat.isFile()) files.push(relative);
    else throw Error(`内置依赖不是普通文件: ${relative}`);
  }
  walk('');
  return files.sort();
}

function localFile(relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative === 'dependencies.lock.json' || relative.includes('\\') || relative.split('/').some(x => !x || x === '.' || x === '..')) throw Error('内置依赖路径无效');
  return path.join(installRoot, relative);
}

export function verifyBundle() {
  try {
    const lockPath = path.join(installRoot, 'dependencies.lock.json');
    if (!fs.lstatSync(lockPath).isFile() || fs.lstatSync(lockPath).isSymbolicLink()) throw Error('依赖锁必须是普通文件');
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (lock.schemaVersion !== 1 || !Array.isArray(lock.files)) throw Error('依赖锁格式无效');
    const listed = new Set();
    for (const item of lock.files) {
      const file = localFile(item.path);
      if (listed.has(item.path) || !/^[a-f0-9]{64}$/.test(item.sha256)) throw Error('依赖锁重复或摘要无效');
      listed.add(item.path);
      if (fs.lstatSync(file).isSymbolicLink() || digest(fs.readFileSync(file)) !== item.sha256) throw Error(`依赖文件已变化: ${item.path}`);
    }
    const actual = bundleFiles();
    if (JSON.stringify(actual) !== JSON.stringify([...listed].sort())) throw Error('依赖文件集合与锁不一致');
    if (JSON.stringify(actual.filter(file => path.basename(file) === 'SKILL.md')) !== JSON.stringify(['SKILL.md'])) throw Error('安装根只能有一个 SKILL.md 入口');
    const index = JSON.parse(fs.readFileSync(path.join(installRoot, 'methods/index.json'), 'utf8'));
    if (index.schemaVersion !== 1 || !Array.isArray(index.methods) || JSON.stringify(index.methods.map(m => m.id).sort()) !== JSON.stringify(expected)) throw Error('需要完整且唯一的 14 项 Superpowers 方法和 2 项辅助方法');
    for (const method of index.methods) {
      if (!Array.isArray(method.resources) || !Array.isArray(method.roles) || !method.roles.length) throw Error(`方法索引无效: ${method.id}`);
      for (const relative of [method.entry, ...method.resources, 'methods/contract.md']) {
        if (typeof relative !== 'string' || !relative.startsWith('methods/')) throw Error('运行方法资源必须位于 methods 目录');
        localFile(relative);
        if (!listed.has(relative)) throw Error(`方法资源未锁定: ${relative}`);
      }
    }
    return {installRoot, fingerprint: digest(JSON.stringify(lock)), methods: index.methods};
  } catch (error) { throw Error(`CTBZ 内置依赖检查失败，请修复安装包后重新 prepare/activate: ${error.message}`); }
}

export function requireBundleBinding(bundle, current = verifyBundle()) {
  if (bundle.installRoot !== current.installRoot || bundle.methodFingerprint !== current.fingerprint) throw Error('CTBZ 安装目录或方法版本已变化，请重新 prepare 并在新会话 activate');
  return current;
}

export function roleMethods(role, current = verifyBundle()) {
  return current.methods.filter(method => method.roles.includes(role)).map(method => ({id: method.id, entry: path.join(current.installRoot, method.entry), resources: method.resources.map(file => path.join(current.installRoot, file))}));
}
