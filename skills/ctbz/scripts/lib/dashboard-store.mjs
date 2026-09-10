import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, realpath, rename, rm } from 'node:fs/promises';
import { basename, isAbsolute, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export class DashboardError extends Error {
  constructor(message, status = 400, code = 'INVALID_STATE', details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    Object.assign(this, details);
  }
}

const MAX_PAYLOAD = 256 * 1024;
const MAX_BOARD = 32 * 1024 * 1024;
const TERMINAL = new Set(['completed', 'cancelled']);
const MODES = ['normal', 'loop'];
const NODE_STATUSES = ['planned', 'active', 'completed', 'blocked', 'cancelled'];
const PROJECT_STATUSES = ['active', 'paused', 'stopped', 'blocked', 'completed'];
const REQUEST_ACTIONS = ['pause', 'resume', 'stop', 'next', 'cancel', 'reopen', 'correct'];
const REQUEST_TERMINAL = new Set(['completed', 'failed', 'withdrawn']);
const EXECUTION_FIELDS = ['status', 'result', 'evidence', 'model', 'owner', 'outcome', 'method', 'pitfalls', 'nextSteps'];
const stamp = () => new Date().toISOString();
const fail = (message, status, code, details) => { throw new DashboardError(message, status, code, details); };

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}
function text(value, label, required = false) {
  if (typeof value !== 'string' || value.length > 50000 || (required && !value.trim())) fail(`${label} must be ${required ? 'nonempty ' : ''}text (maximum 50000 characters)`);
  return value;
}
function id(value, label = 'id') {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)) fail(`${label} must be a safe identifier`);
  return value;
}
function oneOf(value, values, label) {
  if (!values.includes(value)) fail(`${label} must be one of ${values.join(', ')}`);
}
function integer(value, label, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) fail(`${label} must be an integer >= ${min}`);
}
function date(value, label, nullable = false) {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) fail(`${label} must be a timestamp`);
}
function array(value, label, max = 10000) {
  if (!Array.isArray(value) || value.length > max) fail(`${label} must be an array with at most ${max} entries`);
  return value;
}
function strings(value, label, max = 1000) {
  array(value, label, max).forEach(item => text(item, label, true));
}
function fields(input, allowed, label) {
  object(input, label);
  for (const key of Object.keys(input)) if (!allowed.includes(key)) fail(`Unsupported ${label} field: ${key}`);
}
function unique(items, label) {
  const keys = items.map(item => id(item.id, `${label}.id`));
  if (new Set(keys).size !== keys.length) fail(`${label} IDs must be unique`);
}
function boundedPayload(payload) {
  object(payload, 'payload');
  let encoded;
  try { encoded = JSON.stringify(payload); } catch { fail('Payload must be JSON'); }
  if (Buffer.byteLength(encoded) > MAX_PAYLOAD) fail('Payload exceeds 256 KiB', 413, 'PAYLOAD_TOO_LARGE');
  return JSON.parse(encoded);
}
function descendants(board, nodeId) {
  const children = new Map();
  for (const node of board.nodes) {
    if (!children.has(node.parentId)) children.set(node.parentId, []);
    children.get(node.parentId).push(node.id);
  }
  const found = new Set();
  const queue = [nodeId];
  while (queue.length) {
    const parent = queue.pop();
    for (const child of children.get(parent) ?? []) if (!found.has(child)) {
      found.add(child);
      queue.push(child);
    }
  }
  return found;
}
function validateCycles(nodes, edges, label) {
  const visited = new Set();
  const visiting = new Set();
  const byId = new Map(nodes.map(node => [node.id, node]));
  function visit(key) {
    if (visiting.has(key)) fail(`${label} cycle detected`);
    if (visited.has(key)) return;
    visiting.add(key);
    for (const next of edges(byId.get(key))) {
      if (!byId.has(next)) fail(`${label} references missing node ${next}`);
      visit(next);
    }
    visiting.delete(key);
    visited.add(key);
  }
  for (const node of nodes) visit(node.id);
}

function scopeDefaults() {
  return { owner: null, lastHeartbeat: null, planRevision: 0, checkpoint: null };
}

function migrateBoard(input) {
  if (input.schemaVersion !== 1) return input;
  const board = structuredClone(input);
  object(board.project, 'project');
  for (const key of ['nodes', 'questions', 'knowledge', 'rounds']) array(board[key], key);
  object(board.project.control, 'project.control');
  board.schemaVersion = 2;
  Object.assign(board.project, { ...scopeDefaults(), ...board.project });
  board.questions.forEach(question => Object.assign(question, { scopeId: null, history: [] }));
  board.knowledge.forEach(entry => { entry.supersedesId = null; });
  board.rounds.forEach(round => Object.assign(round, { scopeId: null, nodeSnapshot: null, completedNodeSnapshots: null, snapshotAvailable: false }));
  board.requests = [];
  const old = board.project.control;
  if (old.requestedAction) board.requests.push({ id: `legacy-${createHash('sha256').update(JSON.stringify(old)).digest('hex').slice(0, 24)}`, scopeId: null, action: old.requestedAction, nodeId: null, reason: '', changes: null, status: old.acknowledgedAt ? 'completed' : 'pending', createdAt: old.requestedAt, receivedAt: old.acknowledgedAt, finishedAt: old.acknowledgedAt, sessionId: null, ownerEpoch: null, message: old.acknowledgement, receipts: [] });
  return board;
}

export function getScope(board, scopeId = null) {
  if (scopeId === null) return board.project;
  const node = find(board.nodes, scopeId, 'Work scope');
  if (!node.work) fail('Node is not an independent work scope', 400, 'INVALID_SCOPE');
  return node.work;
}

export function scopeForNode(board, nodeId) {
  let node = find(board.nodes, nodeId, 'Node');
  const seen = new Set();
  while (node) {
    if (seen.has(node.id)) fail('Parent cycle detected');
    seen.add(node.id);
    if (node.work) return node.id;
    node = node.parentId === null ? null : find(board.nodes, node.parentId, 'Parent');
  }
  return null;
}

function scopeNodes(board, scopeId) {
  return board.nodes.filter(node => scopeForNode(board, node.id) === scopeId);
}

export function assertScopeOwner(board, scopeId = null, sessionId, ownerEpoch) {
  const scope = getScope(board, scopeId);
  if (scope.owner && (scope.owner.sessionId !== sessionId || scope.owner.epoch !== ownerEpoch)) fail('Scope belongs to another session or ownership epoch', 409, 'SCOPE_OWNER_MISMATCH');
  return scope;
}

export function assertCanDispatch(board, { scopeId = null, sessionId, ownerEpoch, planRevision } = {}) {
  const scope = assertScopeOwner(board, scopeId, sessionId, ownerEpoch);
  if (scope.status !== 'active') fail('Scope must be active before dispatch', 409, 'SCOPE_NOT_ACTIVE');
  if ((board.requests ?? []).some(request => request.scopeId === scopeId && !REQUEST_TERMINAL.has(request.status) && ['pause', 'stop'].includes(request.action))) fail('A pause or stop request prevents new dispatch', 409, 'CONTROL_PENDING');
  const seen = planRevision ?? scope.checkpoint?.seenPlanRevision;
  if ((scope.owner || planRevision !== undefined) && seen !== scope.planRevision) fail('Read and adopt the current plan at a checkpoint before dispatch', 409, 'PLAN_CHANGED', { planRevision: scope.planRevision, seenPlanRevision: seen ?? null });
  if (scope.checkpoint?.decisionStatus === 'needs-clarification') fail('The current plan needs clarification before dispatch', 409, 'PLAN_NEEDS_CLARIFICATION');
  return scope;
}

function validateScope(scope, label) {
  object(scope, label);
  oneOf(scope.mode, MODES, `${label}.mode`);
  text(scope.goal, `${label}.goal`);
  oneOf(scope.phase, ['discussion', 'planning', 'execution', 'review', 'complete'], `${label}.phase`);
  oneOf(scope.status, PROJECT_STATUSES, `${label}.status`);
  integer(scope.round, `${label}.round`);
  integer(scope.planRevision, `${label}.planRevision`);
  date(scope.lastHeartbeat, `${label}.lastHeartbeat`, true);
  object(scope.budget, `${label}.budget`);
  for (const key of ['maxRounds', 'minutes']) if (scope.budget[key] !== null) integer(scope.budget[key], `${label}.budget.${key}`, 1);
  if (scope.owner !== null) {
    object(scope.owner, `${label}.owner`);
    text(scope.owner.sessionId, 'owner.sessionId', true);
    integer(scope.owner.epoch, 'owner.epoch', 1);
    date(scope.owner.claimedAt, 'owner.claimedAt');
    text(scope.owner.reason, 'owner.reason');
  }
  if (scope.checkpoint !== null) {
    object(scope.checkpoint, 'checkpoint');
    date(scope.checkpoint.at, 'checkpoint.at');
    if (scope.checkpoint.sessionId !== null) text(scope.checkpoint.sessionId, 'checkpoint.sessionId', true);
    integer(scope.checkpoint.seenPlanRevision, 'checkpoint.seenPlanRevision');
    if (scope.checkpoint.seenPlanRevision > scope.planRevision) fail('Checkpoint cannot adopt a future plan');
    text(scope.checkpoint.summary, 'checkpoint.summary');
    oneOf(scope.checkpoint.decisionStatus, ['adopted', 'needs-clarification'], 'checkpoint.decisionStatus');
  }
}

export function validateBoard(board) {
  object(board, 'board');
  board = migrateBoard(board);
  if (board.schemaVersion !== 2) fail('Unsupported dashboard schema version');
  integer(board.revision, 'revision');
  const project = object(board.project, 'project');
  validateScope(project, 'project');
  id(project.id, 'project.id');
  text(project.title, 'project.title', true);
  text(project.goal, 'project.goal');
  oneOf(project.mode, MODES, 'project.mode');
  oneOf(project.phase, ['discussion', 'planning', 'execution', 'review', 'complete'], 'project.phase');
  oneOf(project.status, PROJECT_STATUSES, 'project.status');
  if (typeof project.isExample !== 'boolean') fail('project.isExample must be boolean');
  integer(project.round, 'project.round');
  date(project.createdAt, 'project.createdAt');
  date(project.updatedAt, 'project.updatedAt');
  date(project.lastHeartbeat, 'project.lastHeartbeat', true);
  object(project.budget, 'project.budget');
  for (const field of ['maxRounds', 'minutes']) if (project.budget[field] !== null) integer(project.budget[field], `budget.${field}`, 1);
  object(project.control, 'project.control');
  oneOf(project.control.requestedAction, [null, ...REQUEST_ACTIONS], 'requestedAction');
  date(project.control.requestedAt, 'requestedAt', true);
  date(project.control.acknowledgedAt, 'acknowledgedAt', true);
  text(project.control.acknowledgement, 'acknowledgement');
  array(board.nodes, 'nodes', 2000);
  unique(board.nodes, 'nodes');
  for (const node of board.nodes) {
    if (node.work) {
      if (node.parentId !== null || node.kind !== 'group') fail('Independent work must be a top-level group');
      validateScope(node.work, 'work');
    }
    if (node.parentId !== null) id(node.parentId, 'parentId');
    oneOf(node.kind, ['group', 'task', 'experiment'], 'node.kind');
    oneOf(node.status, NODE_STATUSES, 'node.status');
    oneOf(node.outcome, ['unknown', 'supported', 'rejected', 'inconclusive'], 'node.outcome');
    text(node.title, 'node.title', true);
    for (const field of ['description', 'owner', 'model', 'scoreReason', 'result', 'method', 'pitfalls', 'nextSteps']) text(node[field], `node.${field}`);
    if (!Number.isFinite(node.score) || node.score < 0 || node.score > 100) fail('node.score must be between 0 and 100');
    strings(node.evidence, 'evidence');
    array(node.dependsOn, 'dependsOn', 2000).forEach(value => id(value, 'dependency'));
    if (new Set(node.dependsOn).size !== node.dependsOn.length) fail('Dependencies must be unique');
    if (typeof node.archived !== 'boolean') fail('node.archived must be boolean');
    if (node.execution) {
      object(node.execution, 'node.execution');
      text(node.execution.runId, 'execution.runId', true);
      text(node.execution.taskId, 'execution.taskId', true);
      if (node.execution.scopeId !== undefined && node.execution.scopeId !== scopeForNode(board, node.id)) fail('Execution belongs to another scope');
      if (node.execution.sessionId != null) text(node.execution.sessionId, 'execution.sessionId', true);
      if (node.execution.scopeEpoch != null) integer(node.execution.scopeEpoch, 'execution.scopeEpoch', 1);
      if (node.execution.planRevision != null) integer(node.execution.planRevision, 'execution.planRevision');
    }
    date(node.createdAt, 'node.createdAt');
    date(node.updatedAt, 'node.updatedAt');
    if (node.completedRound !== null) integer(node.completedRound, 'completedRound');
    if (node.status === 'completed' && (!node.result.trim() || !node.evidence.length)) fail('Completed nodes require a result and at least one evidence entry');
  }
  validateCycles(board.nodes, node => node.parentId ? [node.parentId] : [], 'Parent');
  validateCycles(board.nodes, node => node.dependsOn, 'Dependency');
  for (const node of board.nodes) {
    const below = descendants(board, node.id);
    if (node.kind === 'group' && node.status === 'completed' && board.nodes.some(other => below.has(other.id) && !TERMINAL.has(other.status))) fail('Cannot complete a group with unfinished descendants');
    if (node.dependsOn.some(dependency => below.has(dependency))) fail('A node cannot depend on its own descendant');
  }
  array(board.questions, 'questions');
  unique(board.questions, 'questions');
  for (const question of board.questions) {
    text(question.title, 'question.title', true);
    text(question.context, 'question.context');
    text(question.answer, 'question.answer');
    array(question.options, 'options', 3);
    if (question.options.length < 2) fail('Questions require 2-3 options');
    unique(question.options, 'options');
    for (const option of question.options) {
      text(option.label, 'option.label', true);
      text(option.reason, 'option.reason', true);
    }
    if (new Set(question.options.map(option => option.label.trim())).size !== question.options.length) fail('Question options must be distinct');
    if (!question.options.some(option => option.id === question.recommendedOptionId)) fail('recommendedOptionId must identify an option');
    if (question.selectedOptionId !== null && !question.options.some(option => option.id === question.selectedOptionId)) fail('selectedOptionId must identify an option');
    getScope(board, question.scopeId);
    array(question.history, 'question.history');
    oneOf(question.status, ['open', 'resolved', 'void'], 'question.status');
    if (question.status === 'resolved' && !question.selectedOptionId && !question.answer.trim()) fail('Resolved questions require a selected option or answer');
    date(question.createdAt, 'question.createdAt');
    date(question.updatedAt, 'question.updatedAt');
  }
  array(board.knowledge, 'knowledge');
  unique(board.knowledge, 'knowledge');
  const nodeIds = new Set(board.nodes.map(node => node.id));
  for (const entry of board.knowledge) {
    if (entry.supersedesId !== null) {
      if (entry.supersedesId === entry.id || !board.knowledge.some(other => other.id === entry.supersedesId)) fail('Knowledge replacement must reference another existing entry');
    }
    text(entry.title, 'knowledge.title', true);
    text(entry.content, 'knowledge.content', true);
    for (const field of ['source', 'scope']) text(entry[field], `knowledge.${field}`);
    oneOf(entry.tier, ['experience', 'confirmed'], 'knowledge.tier');
    oneOf(entry.status, ['active', 'rejected', 'superseded'], 'knowledge.status');
    oneOf(entry.confidence, ['low', 'medium', 'high'], 'confidence');
    array(entry.sourceNodeIds, 'sourceNodeIds', 2000).forEach(key => { if (!nodeIds.has(key)) fail('Knowledge references a missing node'); });
    date(entry.createdAt, 'knowledge.createdAt');
    date(entry.updatedAt, 'knowledge.updatedAt');
    date(entry.confirmedAt, 'knowledge.confirmedAt', true);
    if ((entry.tier === 'confirmed') !== (entry.confirmedAt !== null)) fail('Knowledge confirmation timestamp and tier must agree');
  }
  array(board.rounds, 'rounds', Number.MAX_SAFE_INTEGER);
  const counts = new Map(), openScopes = new Set();
  for (const round of board.rounds) {
    const scope = getScope(board, round.scopeId);
    const count = (counts.get(round.scopeId) ?? 0) + 1;
    if (round.number !== count) fail('Round numbers must be sequential within each scope');
    counts.set(round.scopeId, count);
    if (openScopes.has(round.scopeId)) fail('Only the latest round in a scope may be open');
    if (round.nodeId !== null && !nodeIds.has(round.nodeId)) fail('Round references a missing node');
    date(round.startedAt, 'round.startedAt');
    date(round.finishedAt, 'round.finishedAt', true);
    if (round.finishedAt === null) {
      openScopes.add(round.scopeId);
      if (scope.mode !== 'loop') fail('Open rounds require loop mode');
    }
    if (round.nodeId !== null && scopeForNode(board, round.nodeId) !== round.scopeId) fail('Round direction belongs to another scope');
    if (typeof round.snapshotAvailable !== 'boolean') fail('snapshotAvailable must be boolean');
    if (round.completedNodeSnapshots !== null) array(round.completedNodeSnapshots, 'completedNodeSnapshots', 2000);
    for (const field of ['summary', 'method', 'pitfalls', 'conclusion', 'nextSteps']) text(round[field], `round.${field}`);
    array(round.rankingSnapshot, 'rankingSnapshot', 2000);
    array(round.completedNodeIds, 'completedNodeIds', 2000).forEach(key => { if (!nodeIds.has(key)) fail('Round completion references a missing node'); });
  }
  for (const scopeId of [null, ...board.nodes.filter(node => node.work).map(node => node.id)]) if (getScope(board, scopeId).round !== (counts.get(scopeId) ?? 0)) fail('Scope round must match recorded rounds');
  for (const current of board.rounds.filter(round => round.finishedAt === null && round.nodeId)) {
    const branch = descendants(board, current.nodeId);
    branch.add(current.nodeId);
    if (scopeNodes(board, current.scopeId).some(node => node.status === 'active' && node.kind !== 'group' && !branch.has(node.id))) fail('Only the current research branch may be active during a round');
  }
  array(board.requests, 'requests', Number.MAX_SAFE_INTEGER);
  unique(board.requests, 'requests');
  const pendingScopes = new Set();
  for (const request of board.requests) {
    getScope(board, request.scopeId);
    oneOf(request.action, REQUEST_ACTIONS, 'request.action');
    oneOf(request.status, ['pending', 'received', ...REQUEST_TERMINAL], 'request.status');
    if (!REQUEST_TERMINAL.has(request.status)) {
      if (pendingScopes.has(request.scopeId)) fail('Only one nonterminal request is allowed per scope');
      pendingScopes.add(request.scopeId);
    }
    if (request.nodeId !== null && scopeForNode(board, request.nodeId) !== request.scopeId) fail('Request node belongs to another scope');
    text(request.reason, 'request.reason'); text(request.message, 'request.message');
    date(request.createdAt, 'request.createdAt');
    date(request.receivedAt, 'request.receivedAt', true); date(request.finishedAt, 'request.finishedAt', true);
    if (request.sessionId !== null) text(request.sessionId, 'request.sessionId', true);
    if (request.ownerEpoch !== null) integer(request.ownerEpoch, 'request.ownerEpoch', 1);
    if (request.changes !== null) object(request.changes, 'request.changes');
    array(request.receipts, 'request.receipts');
  }
  array(board.events, 'events', Number.MAX_SAFE_INTEGER);
  unique(board.events, 'events');
  for (const event of board.events) {
    date(event.at, 'event.at');
    text(event.type, 'event.type', true);
    oneOf(event.actor, ['user', 'agent'], 'event.actor');
    text(event.summary, 'event.summary');
    object(event.data, 'event.data');
  }
  return board;
}

async function noSymlink(path, kind, allowMissing = false) {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || (kind === 'directory' ? !stat.isDirectory() : !stat.isFile()) || (kind === 'file' && stat.nlink !== 1)) fail('Dashboard record path must be a regular, unlinked path', 400, 'UNSAFE_PATH');
    return stat;
  } catch (error) {
    if (allowMissing && error.code === 'ENOENT') return null;
    throw error;
  }
}
async function paths(workspace, create = false) {
  if (typeof workspace !== 'string' || !isAbsolute(workspace)) fail('workspace must be an absolute directory', 400, 'UNSAFE_PATH');
  await noSymlink(workspace, 'directory');
  const root = await realpath(workspace);
  const directory = join(root, '.ctbz-record');
  await noSymlink(directory, 'directory', true);
  if (create) await mkdir(directory, { recursive: true, mode: 0o700 });
  const boardPath = join(directory, 'dashboard.json');
  const logPath = join(directory, '记录.md');
  const lockPath = join(directory, '.dashboard.lock');
  for (const path of [boardPath, logPath, lockPath]) await noSymlink(path, 'file', true);
  return { root, directory, boardPath, logPath, lockPath };
}
async function readCanonical(location) {
  const info = await noSymlink(location.boardPath, 'file', true);
  if (!info) return null;
  if (info.size > MAX_BOARD) fail('Dashboard record exceeds 32 MiB; archive the workspace before continuing', 413, 'RECORD_TOO_LARGE');
  const file = await open(location.boardPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    let parsed;
    try { parsed = JSON.parse(await file.readFile('utf8')); } catch { fail('Dashboard record is invalid JSON', 400, 'CORRUPT_RECORD'); }
    return validateBoard(parsed);
  } finally { await file.close(); }
}
export async function readBoard(workspace) {
  return readCanonical(await paths(workspace));
}

async function locked(workspace, operation) {
  const location = await paths(workspace, true);
  let lock;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      lock = await open(location.lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      await noSymlink(location.lockPath, 'file');
      if (attempt === 59) fail('Dashboard writer is busy; retry after the current writer finishes. A stopped writer may require removal of .dashboard.lock.', 423, 'RECORD_LOCKED');
      await delay(25);
    }
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, at: stamp() }));
    await paths(workspace);
    return await operation(location);
  } finally {
    await lock.close();
    await rm(location.lockPath, { force: true });
  }
}

function recordEvent(board, type, actor, data, summary) {
  const at = stamp();
  board.revision++;
  board.project.updatedAt = at;
  board.events.push({ id: randomUUID(), at, type, actor, summary, data: structuredClone(data) });
}
async function save(location, board) {
  validateBoard(board);
  const encoded = `${JSON.stringify(board, null, 2)}\n`;
  if (Buffer.byteLength(encoded) > MAX_BOARD) fail('Dashboard record exceeds 32 MiB; no history was removed', 413, 'RECORD_TOO_LARGE');
  const current = await noSymlink(location.boardPath, 'file', true);
  if (current) {
    const source = await open(location.boardPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    let original;
    try { original = await source.readFile(); } finally { await source.close(); }
    if (JSON.parse(original.toString('utf8')).schemaVersion === 1) {
      const backupPath = join(location.directory, 'dashboard.schema-1.backup.json');
      await noSymlink(backupPath, 'file', true);
      const backupTemporary = join(location.directory, `.backup-${randomUUID()}.tmp`);
      let backup;
      try {
        backup = await open(backupTemporary, 'wx', 0o600);
        await backup.writeFile(original);
        await backup.sync();
        try { await link(backupTemporary, backupPath); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
      } finally {
        if (backup) await backup.close();
        await rm(backupTemporary, { force: true });
      }
      const savedBackup = await open(backupPath, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        if (!(await savedBackup.readFile()).equals(original)) fail('Existing schema 1 backup differs from the source; preserve both files and resolve before migration', 409, 'MIGRATION_BACKUP_CONFLICT');
      } finally { await savedBackup.close(); }
    }
  }
  const temporary = join(location.directory, `.dashboard-${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(encoded);
    await handle.sync();
    await handle.close();
    handle = null;
    await noSymlink(location.boardPath, 'file', true);
    await rename(temporary, location.boardPath);
  } finally {
    if (handle) await handle.close();
    await rm(temporary, { force: true });
  }
  const event = board.events.at(-1);
  try {
    await noSymlink(location.logPath, 'file', true);
    const handle = await open(location.logPath, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600);
    try {
      await handle.writeFile(`\n## ${event.at} | ${event.type} | ${event.actor}\n\n${event.summary}\n\n\`\`\`json\n${JSON.stringify(event.data, null, 2)}\n\`\`\`\n`);
      await handle.sync();
    } finally { await handle.close(); }
  } catch {
    fail('Dashboard JSON was committed, but the Markdown log could not be appended. Reload before retrying; export can regenerate the record.', 500, 'RECORD_LOG_INCOMPLETE', { committed: true, revision: board.revision });
  }
  return board;
}

function newBoard(root, input) {
  fields(input, ['id', 'title', 'goal', 'mode', 'isExample', 'budget'], 'project');
  const at = stamp();
  return { schemaVersion: 2, revision: 0, project: {
    id: input.id ?? `project-${createHash('sha256').update(root).digest('hex').slice(0, 16)}`,
    title: input.title ?? basename(root), goal: input.goal ?? '', mode: input.mode ?? 'normal',
    phase: 'discussion', status: 'active', isExample: input.isExample ?? false,
    createdAt: at, updatedAt: at, round: 0,
    budget: { maxRounds: null, minutes: null, ...input.budget },
    control: { requestedAction: null, requestedAt: null, acknowledgedAt: null, acknowledgement: '' },
    ...scopeDefaults(),
  }, nodes: [], questions: [], rounds: [], knowledge: [], requests: [], events: [] };
}
export async function initBoard(workspace, projectFields = {}) {
  const input = boundedPayload(projectFields);
  return locked(workspace, async location => {
    if (await readCanonical(location)) fail('Dashboard already exists; use project.update to change it', 409, 'ALREADY_INITIALIZED');
    const board = newBoard(location.root, input);
    recordEvent(board, 'project.init', 'agent', input, `Initialized project: ${board.project.title}`);
    return save(location, board);
  });
}

export function rankBoard(board, scopeId) {
  const byId = new Map(board.nodes.map(node => [node.id, node]));
  const parents = new Set(board.nodes.map(node => node.parentId).filter(Boolean));
  if (scopeId !== undefined) getScope(board, scopeId);
  const queue = board.nodes.filter(node => node.kind !== 'group' && !TERMINAL.has(node.status) && !node.archived && (scopeId === undefined || scopeForNode(board, node.id) === scopeId)).map(node => {
    let reason = '';
    if (parents.has(node.id)) reason = 'Has child tasks';
    else if (node.status === 'active') reason = 'Already active';
    else if (node.status === 'blocked') reason = 'Node is blocked';
    let parent = byId.get(node.parentId);
    while (parent) {
      if (parent.archived || ['blocked', 'cancelled'].includes(parent.status)) reason ||= 'Ancestor is blocked, archived or cancelled';
      if (parent.dependsOn.some(key => byId.get(key)?.status !== 'completed')) reason ||= 'Ancestor dependencies incomplete';
      parent = byId.get(parent.parentId);
    }
    const dependencies = node.dependsOn.filter(key => byId.get(key)?.status !== 'completed');
    if (dependencies.length) reason ||= `Dependencies incomplete: ${dependencies.join(', ')}`;
    return { ...node, eligible: !reason, blockedReason: reason, share: 0 };
  }).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id, 'en'));
  const ready = queue.filter(node => node.eligible);
  const sum = ready.reduce((total, node) => total + node.score, 0);
  for (const node of ready) node.share = sum ? node.score / sum * 100 : 100 / ready.length;
  return queue;
}
export function boardView(board) {
  board = migrateBoard(board);
  const parents = new Set(board.nodes.map(node => node.parentId));
  const tasks = board.nodes.filter(node => node.kind !== 'group' && node.status !== 'cancelled' && !parents.has(node.id));
  const count = status => tasks.filter(node => node.status === status).length;
  const scopes = [null, ...board.nodes.filter(node => node.work).map(node => node.id)].map(scopeId => {
    const scope = getScope(board, scopeId);
    return { ...scope, id: scopeId, title: scopeId === null ? board.project.title : find(board.nodes, scopeId, 'Scope').title,
      pendingRequests: board.requests.filter(request => request.scopeId === scopeId && !REQUEST_TERMINAL.has(request.status)),
      changes: board.events.filter(event => event.data.scopeId === scopeId && event.data.planRevision > (scope.checkpoint?.seenPlanRevision ?? 0)),
    };
  });
  return { ...board, scopes, ranking: rankBoard(board), stats: { total: tasks.length, completed: count('completed'), active: count('active'), blocked: count('blocked'), planned: count('planned'), progress: tasks.length ? count('completed') / tasks.length * 100 : 0 }, server: { readOnly: false } };
}
export async function viewBoard(workspace) {
  const board = await readBoard(workspace);
  if (!board) fail('Dashboard is not initialized', 404, 'NOT_INITIALIZED');
  return boardView(board);
}

function find(items, key, label) {
  id(key);
  const item = items.find(candidate => candidate.id === key);
  if (!item) fail(`${label} not found`, 404, 'NOT_FOUND');
  return item;
}
function requireActor(actual, required) {
  if (actual !== required) fail(`This action requires actor ${required}`, 403, 'ACTOR_REQUIRED');
}
function newNode(input) {
  const at = stamp();
  return { id: input.id, parentId: null, kind: 'task', title: '', description: '', status: 'planned', outcome: 'unknown', owner: '', model: '', dependsOn: [], score: 50, scoreReason: '', result: '', evidence: [], method: '', pitfalls: '', nextSteps: '', createdAt: at, updatedAt: at, completedRound: null, archived: false, ...input };
}
const NODE_FIELDS = ['id', 'parentId', 'kind', 'title', 'description', 'status', 'outcome', 'owner', 'model', 'dependsOn', 'score', 'scoreReason', 'result', 'evidence', 'method', 'pitfalls', 'nextSteps', 'archived'];

function mutationScope(board, action, payload) {
  if (action.startsWith('node.') && payload.node && board.nodes.some(node => node.id === payload.node.id)) return scopeForNode(board, payload.node.id);
  if (action === 'node.upsert' && payload.node?.parentId) return scopeForNode(board, payload.node.parentId);
  if (action === 'work.upsert') return board.nodes.some(node => node.id === payload.node?.id && node.work) ? payload.node.id : null;
  if (action === 'question.upsert') return payload.question.scopeId ?? board.questions.find(question => question.id === payload.question.id)?.scopeId ?? null;
  if (action === 'question.resolve' || action === 'question.void') return find(board.questions, payload.id, 'Question').scopeId;
  if (action === 'control.ack' || action === 'control.withdraw') return find(board.requests, payload.requestId, 'Request').scopeId;
  return payload.scopeId ?? null;
}

function applyMutation(board, action, payload, actor, options = {}) {
  const at = stamp();
  let summary = action;
  if (['scope.claim', 'control.ack', 'checkpoint', 'heartbeat', 'round.start', 'round.finish'].includes(action)) requireActor(actor, 'agent');
  let scopeId = mutationScope(board, action, payload);
  if (actor === 'agent' && action !== 'scope.claim') assertScopeOwner(board, scopeId, options.sessionId, options.ownerEpoch);
  const planScopes = new Set();
  const markPlan = (key = scopeId) => planScopes.add(key);
  switch (action) {
    case 'project.update': {
      const input = payload.project ?? payload;
      fields(input, ['title', 'goal', 'mode', 'phase', 'status', 'budget', 'isExample'], 'project');
      if (input.mode && input.mode !== board.project.mode && board.rounds.some(round => round.scopeId === null && !round.finishedAt)) fail('Cannot change mode during an open round', 409, 'ROUND_OPEN');
      const budget = { ...board.project.budget, ...input.budget };
      if (input.budget) fields(input.budget, ['maxRounds', 'minutes'], 'budget');
      if (actor === 'user' && input.status !== undefined && input.status !== board.project.status) fail('Execution state changes require a control request', 409, 'CONTROL_REQUIRED');
      if (['goal', 'mode', 'budget'].some(key => input[key] !== undefined && JSON.stringify(key === 'budget' ? budget : input[key]) !== JSON.stringify(board.project[key]))) markPlan();
      Object.assign(board.project, input, { budget });
      summary = `Updated project: ${board.project.title}`;
      break;
    }
    case 'work.create':
    case 'work.upsert': {
      fields(payload, ['node', 'work'], 'payload');
      fields(payload.node, ['id', 'title', 'description'], 'node');
      fields(payload.work, ['mode', 'goal', 'budget', 'phase', 'status'], 'work');
      id(payload.node.id);
      const previous = board.nodes.find(node => node.id === payload.node.id);
      if (action === 'work.create' && previous) fail('Independent work already exists; use work.upsert to update it', 409, 'WORK_EXISTS');
      if (previous && !previous.work) fail('An existing ordinary node cannot become an independent scope', 409, 'INVALID_SCOPE');
      const next = previous ? { ...previous, ...payload.node, updatedAt: at, work: structuredClone(previous.work) } : newNode({ ...payload.node, kind: 'group', work: { mode: 'normal', goal: '', phase: 'discussion', status: 'active', budget: { maxRounds: null, minutes: null }, round: 0, ...scopeDefaults() } });
      scopeId = next.id;
      if (payload.work.budget) fields(payload.work.budget, ['maxRounds', 'minutes'], 'budget');
      if (payload.work.mode && payload.work.mode !== next.work.mode && board.rounds.some(round => round.scopeId === scopeId && !round.finishedAt)) fail('Cannot change mode during an open round', 409, 'ROUND_OPEN');
      if (actor === 'user' && payload.work.status !== undefined && payload.work.status !== next.work.status) fail('Execution state changes require a control request', 409, 'CONTROL_REQUIRED');
      const budget = { ...next.work.budget, ...payload.work.budget };
      if (!previous || Object.entries(payload.node).some(([key, value]) => JSON.stringify(value) !== JSON.stringify(previous[key])) || ['mode', 'goal', 'budget'].some(key => payload.work[key] !== undefined && JSON.stringify(key === 'budget' ? budget : payload.work[key]) !== JSON.stringify(next.work[key]))) markPlan(scopeId);
      Object.assign(next.work, payload.work, { budget });
      if (previous) board.nodes[board.nodes.indexOf(previous)] = next; else board.nodes.push(next);
      summary = `${previous ? 'Updated' : 'Added'} independent work: ${next.title}`;
      break;
    }
    case 'scope.claim': {
      requireActor(actor, 'agent');
      fields(payload, ['scopeId', 'sessionId', 'takeover', 'reason'], 'payload');
      text(payload.sessionId, 'sessionId', true);
      if (payload.takeover !== undefined && typeof payload.takeover !== 'boolean') fail('takeover must be boolean');
      if (options.sessionId !== undefined && options.sessionId !== payload.sessionId) fail('Claim session must match the caller', 409, 'SCOPE_OWNER_MISMATCH');
      const scope = getScope(board, scopeId);
      if (scope.owner?.sessionId === payload.sessionId) return false;
      if (scope.owner && !payload.takeover) fail('Scope already has an owner; explicit takeover is required', 409, 'SCOPE_OWNED');
      if (scope.owner || payload.takeover) text(payload.reason, 'takeover reason', true);
      scope.owner = { sessionId: payload.sessionId, epoch: (scope.owner?.epoch ?? 0) + 1, claimedAt: at, reason: payload.reason ?? '' };
      summary = `Scope owner registered: ${payload.sessionId}`;
      break;
    }
    case 'node.upsert': {
      fields(payload, ['node', 'reopen', 'reason'], 'payload');
      fields(payload.node, NODE_FIELDS, 'node');
      id(payload.node.id);
      const previous = board.nodes.find(node => node.id === payload.node.id);
      const next = previous ? { ...previous, ...payload.node, updatedAt: at } : newNode(payload.node);
      const changed = field => JSON.stringify(next[field]) !== JSON.stringify(previous?.[field]);
      if (previous?.execution && changed('kind')) fail('Cannot change the kind of a bound execution node', 409, 'NODE_BINDING_CONFLICT');
      if (previous?.execution && !options.projection && EXECUTION_FIELDS.some(field => changed(field))) fail('Bound execution facts are maintained by the run; submit a control request', 409, 'EXECUTION_BOUND');
      if (previous?.work && (next.parentId !== null || next.kind !== 'group')) fail('Independent work must remain a top-level group');
      if (previous && changed('parentId') && [previous, ...board.nodes.filter(node => descendants(board, previous.id).has(node.id))].some(node => node.execution)) fail('Cannot move a bound execution branch', 409, 'NODE_BINDING_CONFLICT');
      if (payload.reopen !== undefined && typeof payload.reopen !== 'boolean') fail('reopen must be boolean');
      if (previous && TERMINAL.has(previous.status) && !options.projection) {
        const historical = ['status', 'outcome', 'result', 'evidence', 'method', 'pitfalls', 'nextSteps'];
        const changed = historical.some(field => JSON.stringify(next[field]) !== JSON.stringify(previous[field]));
        if (changed && (!payload.reopen || !payload.reason?.trim())) fail('Terminal history requires reopen:true and a reason before changes', 409, 'REOPEN_REQUIRED');
        if (payload.reopen && (!payload.reason?.trim() || TERMINAL.has(next.status))) fail('Reopening requires a reason and a nonterminal status');
      }
      if (payload.reopen) text(payload.reason, 'reopen reason', true);
      if (next.status === 'active' && previous?.status !== 'active' && !options.projection) {
        const check = structuredClone(board);
        const candidate = { ...next, status: 'planned' };
        const oldIndex = check.nodes.findIndex(node => node.id === next.id);
        if (oldIndex < 0) check.nodes.push(candidate); else check.nodes[oldIndex] = candidate;
        validateCycles(check.nodes, node => node.parentId ? [node.parentId] : [], 'Parent');
        const byId = new Map(check.nodes.map(node => [node.id, node]));
        if (next.dependsOn.some(key => byId.get(key)?.status !== 'completed')) fail('Cannot activate task: Dependencies incomplete', 409, 'NOT_ELIGIBLE');
        let parent = byId.get(next.parentId);
        while (parent) {
          if (parent.archived || ['blocked', 'cancelled'].includes(parent.status)) fail('Cannot activate task: ancestor is blocked or archived', 409, 'NOT_ELIGIBLE');
          if (parent.dependsOn.some(key => byId.get(key)?.status !== 'completed')) fail('Cannot activate task: ancestor dependencies incomplete', 409, 'NOT_ELIGIBLE');
          parent = byId.get(parent.parentId);
        }
        if (next.archived) fail('Cannot activate an archived task', 409, 'NOT_ELIGIBLE');
      }
      const candidateBoard = { ...board, nodes: previous ? board.nodes.map(node => node.id === next.id ? next : node) : [...board.nodes, next] };
      const nextScope = scopeForNode(candidateBoard, next.id);
      if (previous && nextScope !== scopeId) fail('A node cannot move between independent work scopes; create a new planned node', 409, 'INVALID_SCOPE');
      if (actor === 'agent') assertScopeOwner(board, nextScope, options.sessionId, options.ownerEpoch);
      if (next.status === 'active' && previous?.status !== 'active' && !options.projection) assertCanDispatch(board, { scopeId: nextScope, sessionId: options.sessionId, ownerEpoch: options.ownerEpoch, planRevision: options.planRevision });
      if (next.status === 'completed' && previous?.status !== 'completed') next.completedRound = getScope(board, nextScope).round;
      if (options.projection && next.status !== 'completed') next.completedRound = null;
      if (payload.reopen) next.completedRound = null;
      if (previous) board.nodes[board.nodes.indexOf(previous)] = next; else board.nodes.push(next);
      scopeId = nextScope;
      if (!options.projection && (!previous || ['title', 'description', 'parentId', 'kind', 'dependsOn', 'score', 'scoreReason', 'archived'].some(changed) || (actor === 'user' && changed('status')))) markPlan(nextScope);
      summary = `${previous ? 'Updated' : 'Added'} node: ${next.title}`;
      break;
    }
    case 'question.upsert': {
      fields(payload, ['question'], 'payload');
      fields(payload.question, ['id', 'title', 'context', 'options', 'recommendedOptionId', 'scopeId'], 'question');
      id(payload.question.id);
      const previous = board.questions.find(question => question.id === payload.question.id);
      if (previous && previous.status !== 'open') fail('Closed questions are historical; create a new question', 409, 'QUESTION_RESOLVED');
      if (previous && payload.question.scopeId !== undefined && payload.question.scopeId !== previous.scopeId) fail('Question scope cannot change');
      const next = { context: '', answer: '', status: 'open', scopeId, history: [], selectedOptionId: null, createdAt: at, ...previous, ...payload.question, updatedAt: at };
      if (previous) next.history = [...previous.history, { at, type: 'edited', actor, previous: { title: previous.title, context: previous.context, options: previous.options, recommendedOptionId: previous.recommendedOptionId } }];
      if (previous) board.questions[board.questions.indexOf(previous)] = next; else board.questions.push(next);
      summary = `Decision question: ${next.title}`;
      markPlan();
      break;
    }
    case 'question.resolve': {
      fields(payload, ['id', 'optionId', 'answer'], 'payload');
      const question = find(board.questions, payload.id, 'Question');
      if (question.status !== 'open') fail('Question is no longer open', 409, 'QUESTION_RESOLVED');
      question.selectedOptionId = payload.optionId ?? null;
      question.answer = payload.answer ?? '';
      question.status = 'resolved';
      question.updatedAt = at;
      question.history.push({ at, type: 'resolved', actor, optionId: question.selectedOptionId, answer: question.answer });
      markPlan();
      summary = `Resolved decision: ${question.title}`;
      break;
    }
    case 'question.void': {
      fields(payload, ['id', 'reason'], 'payload');
      text(payload.reason, 'void reason', true);
      const question = find(board.questions, payload.id, 'Question');
      if (question.status !== 'open') fail('Only open questions can be voided', 409, 'QUESTION_RESOLVED');
      question.status = 'void'; question.updatedAt = at;
      question.history.push({ at, type: 'void', actor, reason: payload.reason });
      markPlan();
      summary = `Voided decision: ${question.title}. ${payload.reason}`;
      break;
    }
    case 'knowledge.upsert': {
      fields(payload, ['entry'], 'payload');
      fields(payload.entry, ['id', 'title', 'content', 'sourceNodeIds', 'source', 'scope', 'confidence', 'status', 'tier', 'supersedesId'], 'knowledge');
      id(payload.entry.id);
      const previous = board.knowledge.find(entry => entry.id === payload.entry.id);
      if (payload.entry.tier && payload.entry.tier !== (previous?.tier ?? 'experience')) fail('Knowledge promotion requires an explicit user confirmation action', 403, 'CONFIRMATION_REQUIRED');
      if (previous?.tier === 'confirmed' && Object.keys(payload.entry).some(field => JSON.stringify(payload.entry[field]) !== JSON.stringify(previous[field]))) fail('Confirmed knowledge is immutable; create a replacement experience for confirmation', 409, 'CONFIRMED_IMMUTABLE');
      if (payload.entry.status && payload.entry.status !== 'active') fail('Knowledge status changes require confirmation or the user-only reject action');
      const next = { title: '', content: '', tier: 'experience', status: 'active', sourceNodeIds: [], source: '', scope: '', confidence: 'medium', supersedesId: null, createdAt: at, confirmedAt: null, ...previous, ...payload.entry, updatedAt: at };
      if (next.supersedesId !== null) {
        const prior = find(board.knowledge, next.supersedesId, 'Superseded knowledge');
        if (prior.tier !== 'confirmed' || prior.status !== 'active') fail('A replacement must target active confirmed knowledge');
      }
      if (previous) board.knowledge[board.knowledge.indexOf(previous)] = next; else board.knowledge.push(next);
      summary = `Recorded knowledge: ${next.title}`;
      break;
    }
    case 'knowledge.confirm': {
      requireActor(actor, 'user');
      fields(payload, ['id'], 'payload');
      const entry = find(board.knowledge, payload.id, 'Knowledge');
      if (entry.status !== 'active') fail('Only active experience can be confirmed');
      if (entry.tier === 'confirmed') fail('Knowledge has already been confirmed', 409, 'ALREADY_CONFIRMED');
      if (entry.supersedesId) {
        const previous = find(board.knowledge, entry.supersedesId, 'Superseded knowledge');
        if (previous.status !== 'active' || previous.tier !== 'confirmed') fail('Knowledge has already been replaced or rejected; review the current version', 409, 'KNOWLEDGE_REPLACED');
        Object.assign(previous, { status: 'superseded', updatedAt: at, supersededById: entry.id });
      }
      Object.assign(entry, { tier: 'confirmed', confirmedAt: at, updatedAt: at });
      summary = `User confirmed knowledge: ${entry.title}`;
      break;
    }
    case 'knowledge.reject': {
      requireActor(actor, 'user');
      fields(payload, ['id', 'reason'], 'payload');
      text(payload.reason, 'rejection reason', true);
      const entry = find(board.knowledge, payload.id, 'Knowledge');
      Object.assign(entry, { status: 'rejected', updatedAt: at });
      summary = `User rejected knowledge: ${entry.title}. ${payload.reason}`;
      break;
    }
    case 'round.start': {
      requireActor(actor, 'agent');
      fields(payload, ['nodeId', 'scopeId'], 'payload');
      const scope = getScope(board, scopeId);
      if (scope.mode !== 'loop') fail('Round start requires loop mode');
      if (scope.status !== 'active') fail('Project must be active to start a round', 409, 'PROJECT_NOT_ACTIVE');
      assertCanDispatch(board, { scopeId, sessionId: options.sessionId, ownerEpoch: options.ownerEpoch });
      if (board.rounds.some(round => round.scopeId === scopeId && !round.finishedAt)) fail('A round is already open', 409, 'ROUND_OPEN');
      const limit = scope.budget.maxRounds;
      if (limit !== null && scope.round >= limit) fail('Round budget has been reached', 409, 'BUDGET_EXHAUSTED');
      const elapsed = board.rounds.filter(round => round.scopeId === scopeId).reduce((sum, round) => sum + (Date.parse(round.finishedAt) - Date.parse(round.startedAt)), 0);
      if (scope.budget.minutes !== null && elapsed >= scope.budget.minutes * 60000) fail('Recorded round time budget has been reached', 409, 'BUDGET_EXHAUSTED');
      const ranking = rankBoard(board, scopeId);
      let candidate = payload.nodeId ? ranking.find(node => node.id === payload.nodeId && node.eligible) : ranking.find(node => node.eligible);
      if (!candidate && payload.nodeId) {
        const direction = board.nodes.find(node => node.id === payload.nodeId);
        if (direction && scopeForNode(board, direction.id) === scopeId && !direction.work && !direction.archived && !TERMINAL.has(direction.status) && direction.status !== 'blocked') {
          const branch = descendants(board, direction.id);
          if (ranking.some(node => branch.has(node.id) && node.eligible)) candidate = direction;
        }
      }
      if (!candidate) fail('No eligible research direction is available', 409, 'NO_ELIGIBLE_NODE');
      if (scopeNodes(board, scopeId).some(node => node.status === 'active' && node.kind !== 'group')) fail('Finish active tasks before starting a research round', 409, 'ACTIVE_TASKS');
      scope.round++;
      scope.phase = 'execution';
      board.rounds.push({ scopeId, number: scope.round, startedAt: at, finishedAt: null, nodeId: candidate.id, summary: '', method: '', pitfalls: '', conclusion: '', nextSteps: '', rankingSnapshot: ranking.map(({ id, title, score, scoreReason, eligible, blockedReason, share }) => ({ id, title, score, scoreReason, eligible, blockedReason, share })), completedNodeIds: [], nodeSnapshot: structuredClone(find(board.nodes, candidate.id, 'Node')), completedNodeSnapshots: [], snapshotAvailable: true });
      Object.assign(find(board.nodes, candidate.id, 'Node'), { status: 'active', updatedAt: at });
      summary = `Started round ${scope.round}: ${candidate.title}`;
      break;
    }
    case 'round.finish': {
      requireActor(actor, 'agent');
      fields(payload, ['scopeId', 'summary', 'method', 'pitfalls', 'conclusion', 'nextSteps'], 'payload');
      const round = board.rounds.find(item => item.scopeId === scopeId && !item.finishedAt);
      if (!round) fail('No round is open', 409, 'NO_OPEN_ROUND');
      const node = find(board.nodes, round.nodeId, 'Node');
      const branch = descendants(board, node.id);
      if (board.nodes.some(item => branch.has(item.id) && item.status === 'active')) fail('Active descendant tasks must finish before closing the round', 409, 'ACTIVE_TASKS');
      if (!TERMINAL.has(node.status) && node.status !== 'blocked') fail('Research direction must be completed, cancelled or blocked before closing the round', 409, 'DIRECTION_NOT_FINISHED');
      text(payload.summary, 'round summary', true);
      text(payload.conclusion, 'round conclusion', true);
      const completed = scopeNodes(board, scopeId).filter(item => item.completedRound === round.number && item.status === 'completed');
      Object.assign(round, payload, { finishedAt: at, completedNodeIds: completed.map(item => item.id), nodeSnapshot: structuredClone(node), completedNodeSnapshots: structuredClone(completed), snapshotAvailable: true });
      getScope(board, scopeId).phase = 'review';
      summary = `Finished round ${round.number}: ${round.summary}`;
      break;
    }
    case 'note.add':
      fields(payload, ['text', 'scopeId'], 'payload');
      text(payload.text, 'note', true);
      summary = payload.text;
      break;
    case 'control.request': {
      fields(payload, ['scopeId', 'action', 'nodeId', 'reason', 'changes', 'replaceRequestId'], 'payload');
      oneOf(payload.action, REQUEST_ACTIONS, 'control.action');
      getScope(board, scopeId);
      if (payload.reason !== undefined) text(payload.reason, 'request.reason');
      if (['cancel', 'reopen', 'correct'].includes(payload.action)) {
        const node = find(board.nodes, payload.nodeId, 'Node');
        if (scopeForNode(board, node.id) !== scopeId) fail('Control node belongs to another scope', 409, 'INVALID_SCOPE');
        text(payload.reason, 'request.reason', true);
      } else if (payload.nodeId !== undefined && payload.nodeId !== null) fail('Only node actions accept nodeId');
      if (payload.changes !== undefined) {
        if (payload.action !== 'correct') fail('Only a correction request accepts changes');
        fields(payload.changes, EXECUTION_FIELDS, 'changes');
        if (!Object.keys(payload.changes).length) fail('Correction changes cannot be empty');
      }
      if (payload.action === 'correct' && payload.changes === undefined) fail('Correction requests require proposed changes');
      const previous = board.requests.find(request => request.scopeId === scopeId && !REQUEST_TERMINAL.has(request.status));
      if (previous && (!payload.replaceRequestId || previous.id !== payload.replaceRequestId)) fail('A control request is already pending', 409, 'CONTROL_PENDING');
      if (payload.replaceRequestId) {
        if (!previous || previous.id !== payload.replaceRequestId || previous.status !== 'pending') fail('Only the current pending request can be replaced', 409, 'CONTROL_NOT_PENDING');
        Object.assign(previous, { status: 'withdrawn', finishedAt: at, message: `Replaced by a new ${payload.action} request` });
      }
      board.requests.push({ id: randomUUID(), scopeId, action: payload.action, nodeId: payload.nodeId ?? null, reason: payload.reason ?? '', changes: payload.changes ?? null, status: 'pending', createdAt: at, receivedAt: null, finishedAt: null, sessionId: null, ownerEpoch: null, message: '', receipts: [] });
      if (scopeId === null) Object.assign(board.project.control, { requestedAction: payload.action, requestedAt: at, acknowledgedAt: null, acknowledgement: '' });
      summary = `Requested control action: ${payload.action}`;
      break;
    }
    case 'control.withdraw': {
      fields(payload, ['requestId'], 'payload');
      const request = find(board.requests, payload.requestId, 'Request');
      if (request.status !== 'pending') fail('Only a pending request can be withdrawn', 409, 'CONTROL_NOT_PENDING');
      Object.assign(request, { status: 'withdrawn', finishedAt: at, message: 'Withdrawn before processing' });
      if (scopeId === null) Object.assign(board.project.control, { acknowledgedAt: at, acknowledgement: request.message });
      summary = 'Withdrew pending control request';
      break;
    }
    case 'control.ack': {
      requireActor(actor, 'agent');
      fields(payload, ['requestId', 'stage', 'status', 'message'], 'payload');
      oneOf(payload.stage, ['received', 'completed', 'failed'], 'control.stage');
      if (payload.status !== undefined) oneOf(payload.status, PROJECT_STATUSES, 'control.status');
      text(payload.message, 'acknowledgement', true);
      const request = find(board.requests, payload.requestId, 'Request');
      const scope = getScope(board, scopeId);
      const sessionId = options.sessionId ?? null, ownerEpoch = options.ownerEpoch ?? null;
      const receipt = { stage: payload.stage, status: payload.status ?? null, message: payload.message, sessionId, ownerEpoch };
      if (request.receipts.some(item => JSON.stringify(item) === JSON.stringify(receipt))) return false;
      if (REQUEST_TERMINAL.has(request.status)) fail('This request is already terminal; it cannot affect another request', 409, 'CONTROL_TERMINAL');
      if (request.sessionId !== null && request.sessionId !== sessionId && scope.owner?.sessionId !== sessionId) fail('Receipt belongs to another session', 409, 'SCOPE_OWNER_MISMATCH');
      if (request.status === 'received' && payload.stage === 'received' && request.sessionId === sessionId && request.ownerEpoch === ownerEpoch) fail('Request was already received with different details', 409, 'CONTROL_RECEIPT_CONFLICT');
      if (payload.stage === 'completed' && ['pause', 'stop'].includes(request.action) && scopeNodes(board, scopeId).some(node => node.status === 'active')) fail('Wait for active tasks before confirming pause or stop', 409, 'ACTIVE_TASKS');
      if (payload.stage === 'completed' && request.nodeId) {
        const node = find(board.nodes, request.nodeId, 'Node');
        if (request.action === 'cancel' && node.status !== 'cancelled') fail('Record task cancellation before completing this request', 409, 'CONTROL_NOT_APPLIED');
        if (request.action === 'reopen' && TERMINAL.has(node.status)) fail('Record task reopening before completing this request', 409, 'CONTROL_NOT_APPLIED');
        if (request.action === 'correct' && Object.entries(request.changes).some(([key, value]) => JSON.stringify(node[key]) !== JSON.stringify(value))) fail('Record the accepted correction before completing this request', 409, 'CONTROL_NOT_APPLIED');
      }
      const targetStatus = { pause: 'paused', stop: 'stopped', resume: 'active' }[request.action];
      if (payload.stage !== 'completed' && payload.status !== undefined) fail('Only a completed receipt can change scope status');
      if (payload.stage === 'completed' && payload.status !== undefined && payload.status !== (targetStatus ?? scope.status)) fail('Receipt status does not match the requested action');
      if (payload.stage === 'completed' && targetStatus) scope.status = targetStatus;
      request.receipts.push(receipt);
      Object.assign(request, { status: payload.stage, receivedAt: request.receivedAt ?? at, finishedAt: payload.stage === 'received' ? null : at, sessionId, ownerEpoch, message: payload.message });
      if (scopeId === null) Object.assign(board.project.control, { acknowledgedAt: request.finishedAt, acknowledgement: payload.message });
      summary = `Agent acknowledged control: ${payload.message}`;
      break;
    }
    case 'checkpoint': {
      requireActor(actor, 'agent');
      fields(payload, ['scopeId', 'seenPlanRevision', 'summary', 'decisionStatus'], 'payload');
      const scope = getScope(board, scopeId);
      const seenPlanRevision = payload.seenPlanRevision ?? scope.checkpoint?.seenPlanRevision ?? 0;
      integer(seenPlanRevision, 'seenPlanRevision');
      if (seenPlanRevision > scope.planRevision) fail('Cannot adopt a future plan', 409, 'PLAN_CHANGED');
      if (seenPlanRevision < (scope.checkpoint?.seenPlanRevision ?? 0)) fail('Checkpoint cannot move plan adoption backwards', 409, 'PLAN_CHANGED');
      const decisionStatus = payload.decisionStatus ?? scope.checkpoint?.decisionStatus ?? 'adopted';
      oneOf(decisionStatus, ['adopted', 'needs-clarification'], 'decisionStatus');
      text(payload.summary ?? '', 'summary');
      scope.checkpoint = { at, sessionId: options.sessionId ?? null, seenPlanRevision, summary: payload.summary ?? '', decisionStatus };
      scope.lastHeartbeat = at;
      summary = `Agent checkpoint: ${scope.checkpoint.summary}`;
      break;
    }
    case 'heartbeat':
      requireActor(actor, 'agent');
      fields(payload, ['scopeId'], 'payload');
      getScope(board, scopeId).lastHeartbeat = at;
      summary = 'Agent heartbeat';
      break;
    default: fail(`Unknown dashboard action '${action}'; valid actions: project.update, work.create, work.upsert, scope.claim, node.upsert, question.upsert, question.resolve, question.void, knowledge.upsert, knowledge.confirm, knowledge.reject, round.start, round.finish, note.add, control.request, control.withdraw, control.ack, checkpoint, heartbeat`, 400, 'UNKNOWN_ACTION');
  }
  for (const key of planScopes) getScope(board, key).planRevision++;
  recordEvent(board, action, actor, { ...payload, scopeId, ...(planScopes.size ? { planRevision: getScope(board, scopeId).planRevision } : {}) }, summary);
  return true;
}

export async function mutateBoard(workspace, action, input = {}, { actor = 'agent', expectedRevision, sessionId, ownerEpoch } = {}) {
  oneOf(actor, ['agent', 'user'], 'actor');
  const payload = boundedPayload(input);
  if (expectedRevision !== undefined) integer(expectedRevision, 'expectedRevision');
  return locked(workspace, async location => {
    const board = await readCanonical(location);
    if (!board) fail('Dashboard is not initialized', 404, 'NOT_INITIALIZED');
    if (expectedRevision !== undefined && expectedRevision !== board.revision) fail('The project changed since it was loaded. Reload and review before retrying.', 409, 'REVISION_CONFLICT');
    if (!applyMutation(board, action, payload, actor, { sessionId, ownerEpoch })) return board;
    return save(location, board);
  });
}

export async function syncTask(workspace, task, run = {}) {
  boundedPayload(task);
  text(task.taskId, 'task.taskId', true);
  text(run.runId ?? 'default', 'run.runId', true);
  const root = await realpath(workspace);
  if (run.repository && await realpath(run.repository) !== root) fail('Run belongs to another project', 400, 'CROSS_PROJECT');
  const taskId = projectedTaskId(task, run);
  const statuses = { pending: 'planned', running: 'active', completed: 'completed', failed: 'blocked', blocked: 'blocked', cancelled: 'cancelled' };
  if (!statuses[task.status]) fail('Unsupported mirrored task status');
  return locked(workspace, async location => {
    let board = await readCanonical(location);
    if (!board) {
      board = newBoard(root, { title: basename(root), goal: run.goal ?? '', mode: 'normal' });
      // One canonical mutation mirrors one accepted manifest change; initialization is included in its event.
    }
    const previous = board.nodes.find(node => node.id === taskId);
    validateTaskBinding(board, task, run, { reconcile: true });
    const scopeId = previous ? scopeForNode(board, previous.id) : task.parentId ? scopeForNode(board, task.parentId) : run.scopeId ?? null;
    assertScopeOwner(board, scopeId, run.sessionId, run.scopeEpoch);
    const evidence = task.resultEvidence ?? ['verification', 'review', 'integration'].flatMap(field => typeof task[field]?.evidence === 'string' && task[field].evidence.trim() ? [`${field}: ${task[field].evidence}`] : []);
    const result = typeof task.result === 'string' ? task.result : typeof task.summary === 'string' ? task.summary : evidence.join('\n');
    const node = { id: taskId, status: statuses[task.status], owner: task.role ?? '', model: task.profile ?? '' };
    for (const key of ['outcome','method','pitfalls','nextSteps']) if (task[key] !== undefined) node[key] = task[key];
    if (task.parentId !== undefined) node.parentId = task.parentId;
    else if (!previous && scopeId !== null) node.parentId = scopeId;
    if (!previous) Object.assign(node, { title: task.title || task.taskId, description: task.description ?? '' });
    node.result = result;
    node.evidence = [...new Set(evidence)];
    if (task.status === 'failed' || task.status === 'blocked') {
      node.outcome = 'unknown';
      node.pitfalls = task.failure?.summary || (typeof task.error === 'string' ? task.error : 'Task execution is blocked; no research conclusion was inferred.');
    }
    const execution = { runId: run.runId ?? 'default', taskId: task.taskId, scopeId, sessionId: run.sessionId ?? null, scopeEpoch: run.scopeEpoch ?? null, planRevision: previous?.execution ? previous.execution.planRevision ?? null : run.planRevision ?? null };
    if (previous?.execution && JSON.stringify(previous.execution) === JSON.stringify(execution) && Object.entries(node).every(([key, value]) => JSON.stringify(previous[key]) === JSON.stringify(value))) return board;
    const reconciled = Boolean(previous?.execution && TERMINAL.has(previous.status) && Object.entries(node).some(([key, value]) => EXECUTION_FIELDS.includes(key) && JSON.stringify(previous[key]) !== JSON.stringify(value)));
    applyMutation(board, 'node.upsert', { node }, 'agent', { sessionId: run.sessionId, ownerEpoch: run.scopeEpoch, projection: true });
    board.nodes.find(node => node.id === taskId).execution = execution;
    const event = board.events.at(-1);
    event.type = 'task.sync';
    event.data = { runId: run.runId ?? 'default', taskId: task.taskId, nodeId: taskId, scopeId, status: task.status, reconciled };
    if (reconciled) event.summary = `Reconciled execution facts from run ${run.runId ?? 'default'}: ${task.taskId}`;
    return save(location, board);
  });
}

function projectedTaskId(task, run) {
  if (task.nodeId !== undefined) { id(task.nodeId, 'task.nodeId'); return task.nodeId; }
  return `task-${createHash('sha256').update(JSON.stringify([run.runId ?? 'default', task.taskId])).digest('hex').slice(0, 24)}`;
}

export function validateTaskBinding(board, task, run = {}, { reconcile = false } = {}) {
  const key = projectedTaskId(task, run);
  const previous = board?.nodes.find(node => node.id === key);
  if (task.nodeId !== undefined && !previous) fail('Explicit task.nodeId must bind an existing planned node', 409, 'NODE_BINDING_MISSING');
  if (previous?.kind === 'group') fail('An execution task cannot bind a summary group', 409, 'NODE_BINDING_CONFLICT');
  if (previous?.execution && (previous.execution.runId !== (run.runId ?? 'default') || previous.execution.taskId !== task.taskId)) fail('Node is owned by another run/task', 409, 'NODE_BINDING_CONFLICT');
  if (board?.nodes.some(node => node.id !== key && node.execution?.runId === (run.runId ?? 'default') && node.execution?.taskId === task.taskId)) fail('Task already binds another node', 409, 'NODE_BINDING_CONFLICT');
  if (previous && task.parentId !== undefined && task.parentId !== previous.parentId) fail('Task must preserve planned parentId', 409, 'NODE_BINDING_CONFLICT');
  if (task.parentId != null && !board?.nodes.some(node => node.id === task.parentId)) fail('Task parent does not exist', 409, 'NODE_BINDING_MISSING');
  const scopeId = previous ? scopeForNode(board, key) : task.parentId ? scopeForNode(board, task.parentId) : run.scopeId ?? null;
  if (run.scopeId !== undefined && run.scopeId !== scopeId) fail('Run belongs to another work scope', 409, 'NODE_BINDING_CONFLICT');
  if (board) assertScopeOwner(board, scopeId, run.sessionId, run.scopeEpoch);
  if (task.status === 'running' && board) {
    const check = structuredClone(board);
    const node = previous ? { id: key, status: 'active' } : { id: key, title: task.title || task.taskId, parentId: task.parentId ?? scopeId, status: 'active' };
    applyMutation(check, 'node.upsert', { node }, 'agent', { sessionId: run.sessionId, ownerEpoch: run.scopeEpoch, planRevision: run.planRevision, projection: reconcile });
    validateBoard(check);
  }
  const current = board?.rounds.find(round => round.scopeId === scopeId && !round.finishedAt);
  if (task.status === 'running' && current?.nodeId) {
    const branch = descendants(board, current.nodeId);
    branch.add(current.nodeId);
    if (!branch.has(key) && !(task.nodeId === undefined && branch.has(task.parentId))) fail('Task is outside the current research branch', 409, 'NODE_BINDING_CONFLICT');
  }
}

function cell(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('|', '\\|').replace(/\r?\n/g, '<br>'); }
export function exportBoard(board, format = 'markdown', audience = 'owner', options = {}) {
  oneOf(format, ['markdown', 'json'], 'format');
  oneOf(audience, ['owner', 'leader'], 'audience');
  fields(options, ['section', 'scopeId'], 'export options');
  const section = options.section ?? 'all';
  oneOf(section, ['all', 'rounds'], 'section');
  board = migrateBoard(board);
  let title = board.project.title;
  let selectedScope = board.project;
  if (options.scopeId !== undefined) {
    selectedScope = getScope(board, options.scopeId);
    if (options.scopeId !== null) title = find(board.nodes, options.scopeId, 'Scope').title;
    const nodes = scopeNodes(board, options.scopeId);
    const keys = new Set(nodes.map(node => node.id));
    board = { ...board, nodes,
      questions: board.questions.filter(question => question.scopeId === options.scopeId),
      rounds: board.rounds.filter(round => round.scopeId === options.scopeId),
      requests: board.requests.filter(request => request.scopeId === options.scopeId),
      knowledge: board.knowledge.filter(entry => entry.sourceNodeIds.some(key => keys.has(key)) || (options.scopeId === null && !entry.sourceNodeIds.length)),
      events: board.events.filter(event => (event.data.scopeId ?? null) === options.scopeId),
    };
  }
  if (section === 'rounds' && format === 'json') return `${JSON.stringify({ schemaVersion: board.schemaVersion, project: { id: board.project.id, title }, scopeId: options.scopeId ?? null, rounds: board.rounds }, null, 2)}\n`;
  if (format === 'json') return `${JSON.stringify(board, null, 2)}\n`;
  const project = { ...board.project, ...selectedScope, title };
  const roundLines = () => {
    const rows = ['', '## 轮次记录', '', '| 任务范围 | 轮次 | 方向 | 本轮工作 | 方法 | 踩坑 | 结论 | 下一步 | 完成节点与证据 |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
    for (const round of board.rounds) {
      const direction = round.nodeSnapshot?.title ?? `${round.nodeId ?? ''} (历史快照不可用)`;
      const completed = round.completedNodeSnapshots?.map(node => `${node.title}: ${node.result}; ${node.evidence.join('; ')}`).join('\n') ?? '历史快照不可用';
      rows.push(`| ${cell(round.scopeId)} | ${round.number} | ${cell(direction)} | ${cell(round.summary)} | ${cell(round.method)} | ${cell(round.pitfalls)} | ${cell(round.conclusion)} | ${cell(round.nextSteps)} | ${cell(completed)} |`);
    }
    return rows;
  };
  if (section === 'rounds') return `${[`# ${cell(project.title)}`, ...roundLines()].join('\n')}\n`;
  const lines = [`# ${cell(project.title)}`, '', `目标：${cell(project.goal)}`, '', `状态：${project.status} | 阶段：${project.phase} | 模式：${project.mode} | 轮次：${project.round}`, '', `更新时间：${project.updatedAt}`, '', '## 成果与证据', '', '| 任务 | 结论 | 结果 | 证据 |', '| --- | --- | --- | --- |'];
  for (const node of board.nodes.filter(node => node.status === 'completed' && node.kind !== 'group')) lines.push(`| ${cell(node.title)} | ${node.outcome} | ${cell(node.result)} | ${cell(node.evidence.join('\n'))} |`);
  lines.push('', '## 风险与阻塞', '', '| 任务 | 状态 | 问题 | 下一步 |', '| --- | --- | --- | --- |');
  for (const node of board.nodes.filter(node => node.status === 'blocked' || node.pitfalls)) lines.push(`| ${cell(node.title)} | ${node.status} | ${cell(node.pitfalls)} | ${cell(node.nextSteps)} |`);
  lines.push('', '## 待决事项', '', '| 问题 | 选项与依据 | 推荐 |', '| --- | --- | --- |');
  for (const question of board.questions.filter(question => question.status === 'open')) lines.push(`| ${cell(question.title)} | ${cell(question.options.map(option => `${option.label}: ${option.reason}`).join('\n'))} | ${cell(question.options.find(option => option.id === question.recommendedOptionId)?.label)} |`);
  lines.push('', '## 已决事项', '', '| 问题 | 选择 | 依据 | 补充答案 | 决定时间 |', '| --- | --- | --- | --- | --- |');
  for (const question of board.questions.filter(question => question.status === 'resolved')) {
    const option = question.options.find(option => option.id === question.selectedOptionId);
    lines.push(`| ${cell(question.title)} | ${cell(option?.label)} | ${cell(option?.reason)} | ${cell(question.answer)} | ${cell(question.updatedAt)} |`);
  }
  if (audience === 'owner') {
    lines.push('', '## 任务与研究', '', '| 编号 | 父节点 | 任务 | 状态 | 优先分 | 评分依据 | 方法 |', '| --- | --- | --- | --- | --- | --- | --- |');
    for (const node of board.nodes) lines.push(`| ${node.id} | ${cell(node.parentId)} | ${cell(node.title)} | ${node.status}${node.archived ? ' (archived)' : ''} | ${node.score} | ${cell(node.scoreReason)} | ${cell(node.method)} |`);
    lines.push(...roundLines());
    lines.push('', '## 知识', '', '| 标题 | 层级 | 状态 | 内容 | 来源 |', '| --- | --- | --- | --- | --- |');
    for (const entry of board.knowledge) lines.push(`| ${cell(entry.title)} | ${entry.tier} | ${entry.status} | ${cell(entry.content)} | ${cell(entry.source)} |`);
    lines.push('', '## 事件记录', '', '| 时间 | 操作者 | 事件 | 记录 |', '| --- | --- | --- | --- |');
    for (const event of board.events) lines.push(`| ${event.at} | ${event.actor} | ${cell(event.type)} | ${cell(event.summary)} |`);
  }
  return `${lines.join('\n')}\n`;
}
