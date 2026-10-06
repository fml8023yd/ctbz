import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {safe} from './本机配置.mjs';

export function workspaceSessionRoot(workspace) {
  if (!workspace) return null;
  return safe(path.join(path.resolve(workspace), '.zcode', 'ctbz'), true, 'workspace session root');
}

export function documentsDir(home=os.homedir(), platform=process.platform) {
  if (platform === 'win32') return process.env.OneDrive ? path.join(process.env.OneDrive, 'Documents') : path.join(home, 'Documents');
  if (platform === 'darwin') return path.join(home, 'Documents');
  const xdg=process.env.XDG_DOCUMENTS_DIR;
  if (xdg) return xdg.replace('$HOME', home);
  return path.join(home, 'Documents');
}
export function storageRoot(choice, home=os.homedir(), workspace=null) {
  if (choice === 'later') return null;
  if (choice === undefined) {
    if (workspace) return workspaceSessionRoot(workspace);
    throw Error('缺少 workspace：默认状态根位于项目 .zcode/ctbz');
  }
  const base=choice === 'documents' ? documentsDir(home) : choice;
  safe(base,true,'--storage');
  return safe(path.join(base, '.ctbz'),true,'--storage');
}
export function storageLocation(home=os.homedir()) {
  return safe(path.join(home,'.ctbz-location.json'),true);
}
export function ensureStorage(root) {
  safe(root,true);
  fs.mkdirSync(root,{recursive:true});
  const st=fs.lstatSync(root); if (!st.isDirectory() || st.isSymbolicLink()) throw Error('状态目录必须是非符号链接目录');
  return root;
}
