import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const source = fileURLToPath(new URL('../../../skills/ctbz/', import.meta.url));
const installed = fileURLToPath(new URL('../../../../.agents/skills/ctbz/', import.meta.url));
const adapter = fileURLToPath(new URL('../', import.meta.url));
const isSource = path.basename(path.dirname(adapter)) === 'adapters';
const root = process.env.CTBZ_CORE_ROOT || (isSource ? source : installed);
if (!path.isAbsolute(root)) throw Error('CTBZ_CORE_ROOT must be absolute');
export const installRoot = fs.realpathSync(root);
const load = name => import(pathToFileURL(path.join(installRoot, 'scripts/lib', name + '.mjs')).href);
const methods = await load('methods');
const state = await load('state');
const board = await load('dashboard-store');
export const {verifyBundle, requireBundleBinding, roleMethods} = methods;
export const {readJson, requireAbsolutePath, requireNonSymlink, requirePathWithinRoot, StateError, writeJsonAtomic, withFileLock, rejectCredentialsBasename} = state;
export const {initBoard, mutateBoard, readBoard, syncTask, validateTaskBinding, getScope, scopeForNode, assertScopeOwner, assertCanDispatch, boardView} = board;
