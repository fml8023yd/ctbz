import {createHash, randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat, mkdir, open, readdir, realpath, rename, rm} from 'node:fs/promises';
import {basename, isAbsolute, join} from 'node:path';
import {DashboardError, getScope, readBoard, scopeForNode} from './dashboard-store.mjs';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_METADATA_BYTES = 256 * 1024;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (message, status = 400, code = 'INVALID_ARTIFACT') => {throw new DashboardError(message, status, code);};
const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function text(value, label, required = false) {
  if (typeof value !== 'string' || value.length > 50000 || (required && !value.trim())) fail(`${label} must be ${required ? 'nonempty ' : ''}text`);
}
async function regular(file, limit = MAX_BYTES) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('Artifact must be a regular file');
  if (stat.size > limit) fail('Artifact exceeds its size limit', 413, 'ARTIFACT_TOO_LARGE');
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const actual = await handle.stat();
    if (!actual.isFile() || actual.size > limit) fail('Invalid artifact file');
    const bytes = await handle.readFile();
    if (bytes.length > limit) fail('Artifact exceeds its size limit', 413);
    return bytes;
  } finally {await handle.close();}
}
async function directory(workspace, create = false) {
  if (!isAbsolute(workspace)) fail('Workspace must be absolute');
  const root = await realpath(workspace);
  let location = root;
  for (const segment of ['.ctbz-record', 'artifacts']) {
    location = join(location, segment);
    if (create) await mkdir(location, {recursive: false, mode: 0o700}).catch(error => {if (error.code !== 'EEXIST') throw error;});
    const stat = await lstat(location);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Artifact storage must be a real directory');
  }
  return location;
}

export function validateTable(table) {
  if (!object(table)) fail('Table must be an object');
  const allowed = ['id','title','scopeId','nodeId','round','version','source','methodology','columns','rows','baseline'];
  if (Object.keys(table).some(key => !allowed.includes(key))) fail('Unknown table field');
  text(table.title, 'title', true);
  for (const key of ['version','source','methodology']) text(table[key], key, true);
  if (table.baseline !== undefined) text(table.baseline, 'baseline');
  if (!Array.isArray(table.columns) || !table.columns.length || table.columns.length > 100) fail('Table requires 1-100 columns');
  if (!Array.isArray(table.rows) || table.rows.length > 10000) fail('Table allows at most 10000 rows');
  const keys = new Set();
  for (const column of table.columns) {
    if (!object(column) || Object.keys(column).some(key => !['key','label','type','unit'].includes(key))) fail('Invalid column');
    if (!safeId(column.key) || ['__proto__','prototype','constructor'].includes(column.key) || keys.has(column.key)) fail('Column keys must be unique safe identifiers');
    keys.add(column.key);
    text(column.label, 'column label', true);
    if (!['text','number'].includes(column.type)) fail('Column type must be text or number');
    if (column.unit !== undefined) text(column.unit, 'column unit');
  }
  for (const row of table.rows) {
    if (!object(row) || Object.keys(row).some(key => !keys.has(key))) fail('Invalid row columns');
    for (const column of table.columns) {
      const value = row[column.key];
      if (value === null) continue;
      if (column.type === 'number') {if (typeof value !== 'number' || !Number.isFinite(value)) fail(`Column ${column.key} requires finite numbers or null`);}
      else text(value, `Column ${column.key}`);
    }
  }
  return table;
}

export async function addArtifact(workspace, sourceFile, options = {}) {
  if (!isAbsolute(sourceFile)) fail('Source path must be absolute');
  let bytes = await regular(sourceFile);
  const format = options.format ?? 'file';
  if (!['file','table'].includes(format)) fail('Artifact format must be table or file');
  let table;
  if (format === 'table') {
    try {table = JSON.parse(bytes.toString('utf8'));} catch {fail('Table source must be valid JSON');}
    validateTable(table);
  }
  const id = table?.id ?? `artifact-${randomUUID()}`;
  if (!safeId(id)) fail('Invalid artifact id');
  const metadata = {
    id, title: options.title ?? table?.title ?? basename(sourceFile), format,
    scopeId: options.scopeId ?? table?.scopeId ?? null,
    nodeId: options.nodeId ?? table?.nodeId ?? null,
    round: options.round ?? table?.round ?? null,
    version: options.version ?? table?.version ?? '1',
    source: table?.source ?? options.source ?? basename(sourceFile),
    methodology: table?.methodology ?? '', baseline: table?.baseline ?? '',
    filename: format === 'table' ? `${id}.json` : basename(sourceFile).replace(/[\r\n\x00-\x1f]/g, '_'),
    createdAt: new Date().toISOString(), sha256: digest(bytes), bytes: bytes.length,
    ...(table ? {rowCount: table.rows.length, columnCount: table.columns.length} : {}),
  };
  text(metadata.title, 'title', true); text(metadata.version, 'version', true);
  if (table) {
    table = {...table, id, title: metadata.title, scopeId: metadata.scopeId, nodeId: metadata.nodeId, round: metadata.round, version: metadata.version};
    bytes = Buffer.from(JSON.stringify(table));
    if (bytes.length > MAX_BYTES) fail('Table exceeds its size limit', 413, 'ARTIFACT_TOO_LARGE');
    metadata.sha256 = digest(bytes); metadata.bytes = bytes.length;
  }
  for (const key of ['scopeId','nodeId']) if (metadata[key] !== null && !safeId(metadata[key])) fail(`Invalid ${key}`);
  if (metadata.round !== null && (!Number.isSafeInteger(metadata.round) || metadata.round < 0)) fail('Invalid round');
  const metadataBytes = Buffer.from(JSON.stringify(metadata));
  if (metadataBytes.length > MAX_METADATA_BYTES) fail('Artifact metadata exceeds 256 KiB', 413, 'ARTIFACT_TOO_LARGE');
  const board = await readBoard(workspace);
  if (!board) fail('Initialize the project before registering artifacts');
  getScope(board, metadata.scopeId);
  if (metadata.nodeId !== null && scopeForNode(board, metadata.nodeId) !== metadata.scopeId) fail('Artifact node belongs to another scope');
  if (metadata.round !== null && metadata.round > 0 && !board.rounds.some(round => (round.scopeId ?? null) === metadata.scopeId && round.number === metadata.round)) fail('Artifact references an unknown round');
  const root = await directory(workspace, true), target = join(root, id), temporary = join(root, `.pending-${randomUUID()}`);
  await mkdir(temporary, {mode: 0o700});
  try {
    for (const [name, content] of [['content', bytes], ['metadata.json', metadataBytes]]) {
      const handle = await open(join(temporary, name), 'wx', 0o600);
      try {await handle.writeFile(content); await handle.sync();} finally {await handle.close();}
    }
    try {await lstat(target); fail('Artifact ID already exists; register a new version with a new ID', 409, 'ARTIFACT_EXISTS');}
    catch (error) {if (error.code !== 'ENOENT') throw error;}
    try {await rename(temporary, target);} catch (error) {if (['EEXIST','ENOTEMPTY'].includes(error.code)) fail('Artifact ID already exists', 409, 'ARTIFACT_EXISTS'); throw error;}
    return metadata;
  } finally {await rm(temporary, {recursive: true, force: true});}
}

async function readMetadata(root, id) {
  if (!safeId(id)) fail('Invalid artifact identifier', 404, 'NOT_FOUND');
  const location = join(root, id);
  const stat = await lstat(location);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Artifact location is invalid');
  let metadata;
  try {metadata = JSON.parse((await regular(join(location, 'metadata.json'), MAX_METADATA_BYTES)).toString('utf8'));} catch (error) {if (error instanceof DashboardError) throw error; fail('Artifact metadata is invalid');}
  if (!object(metadata) || metadata.id !== id || !/^[0-9a-f]{64}$/.test(metadata.sha256) || !['file','table'].includes(metadata.format)) fail('Artifact metadata is invalid');
  return metadata;
}

export async function listArtifacts(workspace) {
  let root;
  try {root = await directory(workspace);} catch (error) {if (error.code === 'ENOENT') return []; throw error;}
  const records = [];
  for (const entry of await readdir(root, {withFileTypes: true})) {
    if (entry.name.startsWith('.pending-')) continue;
    records.push(await readMetadata(root, entry.name));
  }
  return records.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
}

export async function readArtifact(workspace, id) {
  try {
    const root = await directory(workspace), metadata = await readMetadata(root, id);
    const bytes = await regular(join(root, id, 'content'));
    if (bytes.length !== metadata.bytes || digest(bytes) !== metadata.sha256) fail('Artifact content changed since registration', 409, 'ARTIFACT_CHANGED');
    const table = metadata.format === 'table' ? validateTable(JSON.parse(bytes.toString('utf8'))) : undefined;
    return {metadata, bytes, ...(table ? {table} : {})};
  } catch (error) {if (error.code === 'ENOENT') fail('Artifact not found', 404, 'NOT_FOUND'); throw error;}
}

export function tableCsv(table) {
  validateTable(table);
  const cell = value => {
    if (value === null) return '';
    let source = String(value);
    if (typeof value === 'string' && /^[\s]*[=+@-]/.test(source)) source = "'" + source;
    return `"${source.replaceAll('"', '""')}"`;
  };
  return '\ufeff' + [table.columns.map(column => cell(column.label + (column.unit ? ` (${column.unit})` : ''))).join(','), ...table.rows.map(row => table.columns.map(column => cell(row[column.key])).join(','))].join('\r\n') + '\r\n';
}
