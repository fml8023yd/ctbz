import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {read,safe} from './本机配置.mjs';

export function documentsDir(home=os.homedir(), platform=process.platform) {
  if (platform === 'win32') return process.env.OneDrive ? path.join(process.env.OneDrive, 'Documents') : path.join(home, 'Documents');
  if (platform === 'darwin') return path.join(home, 'Documents');
  const xdg=process.env.XDG_DOCUMENTS_DIR;
  if (xdg) return xdg.replace('$HOME', home);
  return path.join(home, 'Documents');
}
export function storageRoot(choice, home=os.homedir()) {
  if (choice === 'later') return null;
  if (choice === undefined) {
    const locator=storageLocation(home);
    if (!fs.existsSync(locator)) return null;
    const selected=read(locator);
    if (selected?.schemaVersion !== 1 || typeof selected.root !== 'string') throw Error('存储位置记录无效，请显式重新选择目录');
    return safe(selected.root,true,'已保存的状态目录');
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
