import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { lstat, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { setTimeout as delay } from 'node:timers/promises';
import { basename, dirname, isAbsolute, join, sep } from "node:path";

export class StateError extends Error {}

export async function withFileLock(path, operation) {
  requireAbsolutePath(path, 'locked file');
  const parents = [];
  for (let p = dirname(path); dirname(p) !== p; p = dirname(p)) parents.unshift(p);
  for (const p of parents) await requireNonSymlink(p, 'lock ancestor', { allowMissing: true });
  await mkdir(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  let handle;
  for (let attempt = 0; attempt < 500; attempt++) {
    await requireNonSymlink(lockPath, 'run lock', { allowMissing: true });
    try { handle = await open(lockPath, 'wx', 0o600); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (attempt === 499) throw new StateError('Run writer is busy. Retry; if its process stopped, inspect and remove the .json.lock file manually.');
      await delay(20);
    }
  }
  try {
    await handle.writeFile(JSON.stringify({pid: process.pid, at: new Date().toISOString()}));
    await requireNonSymlink(path, 'locked file', {allowMissing: true});
    return await operation();
  } finally { await handle.close(); await rm(lockPath, {force: true}); }
}

export function requireAbsolutePath(path, label) {
  if (typeof path !== "string" || !isAbsolute(path)) {
    throw new StateError(`${label} must be absolute`);
  }
  return path;
}

export function rejectCredentialsBasename(path, label = "path") {
  requireAbsolutePath(path, label);
  if (basename(path).toLowerCase() === "credentials.json") {
    throw new StateError(`${label} must not target credentials.json`);
  }
  return path;
}

export async function requireNonSymlink(path, label, { allowMissing = false } = {}) {
  requireAbsolutePath(path, label);
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) {
      throw new StateError(`${label} must not be a symlink`);
    }
  } catch (error) {
    if (error instanceof StateError) throw error;
    if (allowMissing && error?.code === "ENOENT") return path;
    if (error?.code === "ENOENT") {
      throw new StateError(`${label} must exist`);
    }
    throw error;
  }
  return path;
}

export async function requirePathWithinRoot(path, root, label = "path", rootLabel = "root") {
  requireAbsolutePath(path, label);
  requireAbsolutePath(root, rootLabel);
  let resolvedPath;
  let resolvedRoot;
  try {
    resolvedPath = await realpath(path);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new StateError(`${label} must exist`);
    }
    throw new StateError(`${label} must resolve within ${rootLabel}`);
  }
  try {
    resolvedRoot = await realpath(root);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new StateError(`${rootLabel} must exist`);
    }
    throw new StateError(`${rootLabel} must resolve to a real directory`);
  }
  const rootPrefix = resolvedRoot.endsWith(sep) ? resolvedRoot : `${resolvedRoot}${sep}`;
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(rootPrefix)) {
    throw new StateError(`${label} must resolve within ${rootLabel}`);
  }
  return resolvedPath;
}

export async function readJson(path) {
  rejectCredentialsBasename(path);
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") throw new StateError(`${path} not found`);
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) throw new StateError(`${path} invalid json`);
    throw error;
  }
}

export async function writeJsonAtomic(path, value) {
  rejectCredentialsBasename(path);
  const directory = dirname(path);
  await mkdir(directory, { recursive: true });

  const temporaryPath = join(
    directory,
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}
