import fs from 'node:fs';
import path from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {verifyBundle, roleMethods, installRoot} from './methods.mjs';
import {verifyPackage} from './release.mjs';

export const VERSION = '0.0.2';
export const HARNESS = Object.freeze({codex: '.codex', zcode: '.zcode'});
const readOnly = new Set(['planner', 'reviewer', 'explorer', 'researcher', 'reporter']);
const phases = new Set(['plan', 'discuss', 'implement', 'debug', 'test', 'review', 'research', 'report']);
const permissionDenied = error => ['EACCES', 'EPERM', 'PERMISSION_DENIED', 'permission-denied'].includes(error?.code || error?.category) || /permission denied|approval (?:denied|rejected)|not authorized/i.test(error?.message || '');

export function selectHarness(evidence) {
  if (!evidence || evidence.source !== 'current-harness-tool-list' || !Object.hasOwn(HARNESS, evidence.harness)) return {mode: 'parent', reason: 'unknown-harness'};
  if (!Array.isArray(evidence.tools) || !evidence.tools.length) return {mode: 'parent', reason: 'missing-native-tools'};
  return {mode: 'native', harness: evidence.harness};
}

export function sessionRoot(workspace, harness) {
  if (!path.isAbsolute(workspace)) throw Error('workspace must be absolute');
  return path.join(workspace, Object.hasOwn(HARNESS, harness) ? HARNESS[harness] : '.ctbz-record', 'ctbz');
}

export function validateTask(task, core = installRoot) {
  const bundle = verifyBundle(core);
  const registry = JSON.parse(fs.readFileSync(path.join(core, '角色清单.json'), 'utf8'));
  if (!task || !/^[a-z][a-z0-9_]{0,63}$/.test(task.taskId || '')) throw Error('taskId must use lowercase letters, numbers and underscores');
  if (!registry.roles.some(role => role.id === task.role) || !phases.has(task.phase)) throw Error('unknown role or phase');
  for (const field of ['objective', 'context', 'authorization']) if (typeof task[field] !== 'string' || !task[field].trim()) throw Error(`${field} is required standalone context`);
  if (!path.isAbsolute(task.workspace || '') || !Array.isArray(task.writeSet) || task.writeSet.some(file => typeof file !== 'string' || !path.isAbsolute(file))) throw Error('workspace and writeSet must be absolute');
  if (readOnly.has(task.role) && task.writeSet.length) throw Error('read-only role requires an empty writeSet');
  for (const field of ['acceptance', 'stopConditions']) if (!Array.isArray(task[field]) || !task[field].length || task[field].some(value => typeof value !== 'string' || !value.trim())) throw Error(`${field} requires nonempty checks`);
  if (!Array.isArray(task.inputs) || task.inputs.some(file => typeof file !== 'string' || !path.isAbsolute(file))) throw Error('inputs must be absolute paths');
  if (!task.budget || !Number.isInteger(task.budget.maxRepairRounds) || task.budget.maxRepairRounds < 0 || task.budget.maxRepairRounds > 3) throw Error('maxRepairRounds must be 0..3');
  const methods = roleMethods(task.role, bundle);
  if (!Array.isArray(task.methods) || task.methods.some(id => !methods.some(method => method.id === id))) throw Error('methods must come from the shared role index');
  return {...task, methods: methods.filter(method => task.methods.includes(method.id)), sharedContract: path.join(core, 'methods/contract.md'), coreVersion: VERSION};
}

export function taskMessage(task) {
  return `CTBZ standalone task\n${JSON.stringify(task, null, 2)}\nRead sharedContract and selected methods first. Do not spawn agents. Write only within writeSet; read-only roles return evidence or drafts. Return actual result, evidence, checkpoint, and permission failures. Do not alter project state or claim independent review if executing in the parent.`;
}

export function nativeSelection(task, evidence, activeAgents = 0) {
  const route = selectHarness(evidence);
  if (route.mode === 'parent') return route;
  if (!Number.isInteger(activeAgents) || activeAgents < 0) throw Error('activeAgents must be the actual nonnegative count');
  if (activeAgents >= 2) return {mode: 'queued', reason: 'concurrency-limit', harness: route.harness};
  return {...route, role: task.role, phase: task.phase, ...(route.harness === 'codex' ? {model: ['plan', 'discuss'].includes(task.phase) ? 'gpt-6-astra' : 'gpt-6.1-sol'} : {}), taskName: `ctbz_${task.taskId}`, maxConcurrent: 2};
}

export async function discoverAdapter(evidence, home = homedir()) {
  const route = selectHarness(evidence);
  if (route.mode !== 'native') return route;
  const adapterRoot = path.join(home, HARNESS[route.harness], 'skills', `ctbz-${route.harness}`);
  try {
    verifyPackage(adapterRoot, route.harness);
    const metadata = JSON.parse(fs.readFileSync(path.join(adapterRoot, 'adapter.json'), 'utf8'));
    if (metadata.harness !== route.harness || metadata.version !== VERSION) return {mode: 'parent', reason: 'adapter-version-mismatch'};
    const module = await import(pathToFileURL(path.join(adapterRoot, 'scripts/native.mjs')).href);
    return {...route, adapterRoot, createPort: module.createPort};
  } catch (error) {
    if (permissionDenied(error)) throw error;
    return {mode: 'parent', reason: 'adapter-unavailable'};
  }
}

// The harness owns native tool calls; this module only invokes the supplied port.
export function createRuntime({evidence, port, executeParent, notify = async event => { console.error(event.message); }, record, sessionId, core = installRoot, fallbackReason}) {
  if (typeof sessionId !== 'string' || !sessionId.trim()) throw Error('actual sessionId is required');
  let notified = false, reserved = 0, startGate = Promise.resolve(), parentGate = Promise.resolve();
  const tasks = new Set();
  const inFlight = new Map();
  const locations = new Map();
  const sessionKey = createHash('sha256').update(sessionId).digest('hex').slice(0, 24);
  function journalRoot(task) {
    const root = sessionRoot(task.workspace, evidence?.harness);
    for (const location of [path.dirname(root), root]) if (fs.existsSync(location) && fs.lstatSync(location).isSymbolicLink()) throw Error('refuse symlink session journal');
    fs.mkdirSync(root, {recursive: true});
    if (fs.lstatSync(root).isSymbolicLink()) throw Error('refuse symlink session journal');
    return root;
  }
  const emit = event => {
    const complete = {schemaVersion: 1, version: VERSION, sessionId, at: new Date().toISOString(), ...event};
    if (record) return record(complete);
    const journal = path.join(journalRoot(locations.get(event.taskId)), `events-${sessionKey}.jsonl`);
    if (fs.existsSync(journal) && fs.lstatSync(journal).isSymbolicLink()) throw Error('refuse symlink journal');
    fs.appendFileSync(journal, JSON.stringify(complete) + '\n', {mode: 0o600});
  };
  async function fallback(task, reason, detail = {}) {
    let firstNotice = !notified;
    if (firstNotice && !record) {
      const marker = path.join(journalRoot(task), `fallback-${sessionKey}.json`);
      try { fs.writeFileSync(marker, JSON.stringify({sessionId, reason, notifiedAt: new Date().toISOString()}), {flag: 'wx', mode: 0o600}); }
      catch (error) { if (error.code === 'EEXIST') firstNotice = false; else throw error; }
    }
    if (firstNotice) {
      await notify({reason, message: 'CTBZ 原生子 Agent 不可用，主进程继续已授权任务；评审降级为主进程自审。'});
    }
    notified = true;
    await emit({taskId: task.taskId, status: 'parent-required', actor: 'parent-only', reason, ...detail, review: 'parent-self-review'});
    if (typeof executeParent !== 'function') return {mode: 'parent', status: 'parent-required', task, reason, ...detail, review: 'parent-self-review'};
    const previous = parentGate;
    let releaseParent;
    parentGate = new Promise(resolve => { releaseParent = resolve; });
    await previous;
    try {
      const result = await executeParent(task, {reason, ...detail, review: 'parent-self-review'});
      if (!result || !Array.isArray(result.evidence) || !result.evidence.length || result.evidence.some(item => typeof item !== 'string' || !item.trim())) throw Error('parent completion requires actual evidence');
      await emit({taskId: task.taskId, status: 'parent-completed', actor: 'parent-only', reason, ...detail, review: 'parent-self-review', result});
      return {mode: 'parent', status: 'completed', result, reason, ...detail, review: 'parent-self-review'};
    } catch (error) {
      await emit({taskId: task.taskId, status: permissionDenied(error) ? 'permission-denied' : 'parent-failed', reason});
      throw error;
    } finally { releaseParent(); }
  }
  async function run(rawTask) {
    const task = validateTask(rawTask, core);
    if (tasks.has(task.taskId) || inFlight.has(task.taskId)) throw Error('duplicate taskId in session');
    locations.set(task.taskId, task);
    const route = selectHarness(evidence);
    if (route.mode === 'parent') { tasks.add(task.taskId); return fallback(task, route.reason); }
    if (!port || typeof port.start !== 'function' || typeof port.wait !== 'function' || typeof port.activeCount !== 'function') { tasks.add(task.taskId); return fallback(task, fallbackReason || 'missing-native-tools'); }
    if ([...inFlight.values()].some(other => other.writeSet.some(a => task.writeSet.some(b => a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep))))) return {mode: 'queued', status: 'queued', reason: 'write-conflict'};
    // Reserve before awaiting host counts, preventing concurrent calls racing the limit.
    if (reserved >= 2) return {mode: 'queued', status: 'queued', reason: 'concurrency-limit'};
    reserved++;
    inFlight.set(task.taskId, task);
    let handle, awaitingStop = false;
    try {
      const previous = startGate;
      let releaseGate;
      startGate = new Promise(resolve => { releaseGate = resolve; });
      await previous;
      try {
        const activeAgents = await port.activeCount();
        const selection = nativeSelection(task, evidence, activeAgents);
        if (selection.mode === 'queued') return {...selection, status: 'queued'};
        tasks.add(task.taskId);
        await emit({taskId: task.taskId, status: 'starting', harness: evidence.harness, role: task.role, model: selection.model});
        handle = await port.start(selection, taskMessage(task));
        if (!handle || typeof handle.agentId !== 'string' || !handle.agentId.trim()) throw Error('native start omitted actual agent identity');
      } finally { releaseGate(); }
      await emit({taskId: task.taskId, status: 'running', harness: evidence.harness, agentId: handle.agentId});
      const receipt = await port.wait(handle);
      if (receipt?.agentId !== handle.agentId) throw Error('native receipt identity mismatch');
      if (receipt.status === 'permission-denied' || permissionDenied(receipt)) {
        await emit({taskId: task.taskId, agentId: handle.agentId, status: 'permission-denied'});
        return {mode: 'native', status: 'permission-denied', agentId: handle.agentId, receipt};
      }
      if (receipt.status !== 'completed' || !Array.isArray(receipt.evidence) || !receipt.evidence.length || receipt.evidence.some(item => typeof item !== 'string' || !item.trim())) {
        const failure = Error('native task failed or lacks completion evidence');
        failure.receipt = receipt;
        throw failure;
      }
      await emit({taskId: task.taskId, status: 'completed', agentId: handle.agentId, receipt, review: task.role === 'reviewer' ? 'independent-agent' : 'not-review'});
      return {mode: 'native', status: 'completed', agentId: handle.agentId, receipt};
    } catch (error) {
      if (permissionDenied(error)) {
        await emit({taskId: task.taskId, status: 'permission-denied', agentId: handle?.agentId || null});
        return {mode: 'native', status: 'permission-denied', agentId: handle?.agentId || null};
      }
      if (handle?.agentId && error.receipt?.status !== 'failed') {
        const stopped = typeof port.stop === 'function' && await Promise.resolve().then(() => port.stop(handle)).catch(() => false);
        if (!stopped) {
          awaitingStop = true;
          await emit({taskId: task.taskId, status: 'awaiting-stop', agentId: handle.agentId, reason: 'cannot-confirm-child-stopped'});
          return {mode: 'native', status: 'awaiting-stop', agentId: handle.agentId, reason: 'cannot-confirm-child-stopped'};
        }
      }
      tasks.add(task.taskId);
      return fallback(task, handle ? 'native-mid-task-failure' : 'native-start-failure', {agentId: handle?.agentId || null, checkpoint: error.receipt?.checkpoint || null, evidence: error.receipt?.evidence || []});
    } finally { reserved--; if (!awaitingStop) inFlight.delete(task.taskId); }
  }
  return {run};
}

export async function openRuntime(options) {
  const adapter = await discoverAdapter(options.evidence, options.home);
  if (adapter.mode === 'native') {
    try { return createRuntime({...options, port: adapter.createPort(options.nativeTools, options.evidence)}); }
    catch (error) { if (permissionDenied(error)) throw error; }
  }
  return createRuntime({...options, port: null, fallbackReason: adapter.reason || 'missing-native-tools'});
}
