import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRuntime, openRuntime, nativeSelection, validateTask, sessionRoot, selectHarness} from '../skills/ctbz/scripts/lib/native-runtime.mjs';
import {createPort as codexPort} from '../adapters/codex/scripts/native.mjs';
import {createPort as zcodePort} from '../adapters/zcode/scripts/native.mjs';
import {deploy} from '../skills/ctbz/scripts/lib/release.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-native-')));
const codex = {harness: 'codex', source: 'current-harness-tool-list', tools: ['collaboration.spawn_agent', 'collaboration.wait_agent', 'collaboration.interrupt_agent']};
const zcode = {harness: 'zcode', source: 'current-harness-tool-list', tools: ['host.start', 'host.wait', 'host.stop']};
const brief = (taskId = 'module_one') => ({taskId, role: 'implementer', phase: 'implement', workspace, objective: 'Write the authorized deliverable', context: 'The user selected unified CTBZ. Preserve the existing interface and data.', authorization: 'User authorized the named test workspace writeSet.', inputs: [], writeSet: [path.join(workspace, taskId + '.txt')], acceptance: ['File contains verified result'], stopConditions: ['Permission denial or user pause'], budget: {maxRepairRounds: 3}, methods: ['verification-before-completion']});
const parent = async task => { fs.writeFileSync(task.writeSet[0], 'verified'); return {evidence: task.writeSet}; };

test('selection uses actual host evidence and harness model routing without a core concurrency gate', () => {
  assert.equal(selectHarness({harness: 'codex', tools: codex.tools}).mode, 'parent');
  assert.equal(selectHarness({...codex, harness: 'unknown'}).mode, 'parent');
  assert.equal(nativeSelection({...brief(), phase: 'plan'}, codex).model, 'gpt-6-astra');
  assert.equal(nativeSelection(brief(), codex).model, 'gpt-6.1-sol');
  assert.equal(nativeSelection(brief(), codex).mode, 'native');
  assert.equal(nativeSelection(brief(), zcode).mode, 'native');
  assert.equal(sessionRoot(workspace, 'codex'), path.join(workspace, '.codex/ctbz'));
  assert.equal(sessionRoot(workspace, 'zcode'), path.join(workspace, '.zcode/ctbz'));
});

test('concurrent calls dispatch in parallel because the harness scheduler owns parallelism', async () => {
  let active = 1, highest = 1, release;
  const held = new Promise(resolve => { release = resolve; });
  const port = {start: async selection => { active++; highest = Math.max(highest, active); return {agentId: selection.taskName}; }, wait: async handle => { await held; active--; return {...handle, status: 'completed', evidence: ['real-output']}; }};
  const runtime = createRuntime({evidence: codex, port, sessionId: 'parallel-session'});
  const first = runtime.run(brief('parallel_one'));
  const second = runtime.run(brief('parallel_two'));
  const third = runtime.run(brief('parallel_three'));
  release();
  assert.equal((await first).status, 'completed');
  assert.equal((await second).status, 'completed');
  assert.equal((await third).status, 'completed');
  assert.equal(highest, 4);
});

test('standalone contract rejects relative writes and writable read-only roles', () => {
  assert.throws(() => validateTask({...brief(), writeSet: ['relative']}), /absolute/);
  assert.throws(() => validateTask({...brief(), role: 'planner'}), /read-only/);
  assert.throws(() => validateTask({...brief(), context: ''}), /context/);
  assert.throws(() => validateTask({...brief(), methods: ['not-a-method']}), /shared role index/);
  assert.throws(() => validateTask({...brief(), taskId: 'bad-name'}), /underscores/);
  assert.ok(path.isAbsolute(validateTask(brief()).sharedContract));
});

test('unknown host, missing tools and start failure execute the authorized parent path with one notice per session', async () => {
  for (const options of [{evidence: {...codex, harness: 'unknown'}}, {evidence: codex}, {evidence: codex, port: {activeCount: async () => 0, start: async () => { throw Error('host offline'); }, wait: async () => {}}}]) {
    const notices = [], records = [];
    const runtime = createRuntime({...options, sessionId: 'real-fixture-session', executeParent: parent, parentExecutionAuthorized: true, notify: async event => notices.push(event), record: async event => records.push(event)});
    for (const id of ['fallback_one', 'fallback_two']) {
      const result = await runtime.run(brief(id));
      assert.equal(result.mode, 'parent');
      assert.equal(result.status, 'completed');
      assert.equal(result.review, 'parent-self-review');
      assert.equal(fs.readFileSync(brief(id).writeSet[0], 'utf8'), 'verified');
    }
    assert.equal(notices.length, 1);
    assert.equal(records.filter(event => event.status === 'parent-completed').length, 2);
    assert.ok(records.every(event => event.sessionId === 'real-fixture-session'));
  }
});

test('without parentExecutionAuthorized the parent executor is never called and the result is parent-required', async () => {
  for (const options of [{evidence: {...codex, harness: 'unknown'}}, {evidence: codex}, {evidence: codex, port: {activeCount: async () => 0, start: async () => { throw Error('host offline'); }, wait: async () => {}}}]) {
    const notices = [], records = [];
    let called = false;
    const runtime = createRuntime({...options, sessionId: 'unauthorized-session', executeParent: async () => { called = true; return parent(brief('unauthorized_one')); }, notify: async event => notices.push(event), record: async event => records.push(event)});
    const result = await runtime.run(brief('unauthorized_one'));
    assert.equal(result.mode, 'parent');
    assert.equal(result.status, 'parent-required');
    assert.equal(result.review, 'parent-self-review');
    assert.equal(called, false);
    assert.ok(fs.existsSync(brief('unauthorized_one').writeSet[0]) === false);
    assert.equal(notices.length, 1);
    assert.equal(records.filter(event => event.status === 'parent-required').length, 1);
    assert.equal(records.filter(event => event.status === 'parent-completed').length, 0);
  }
});

test('Codex native port maps schema and verifies actual result identity', async () => {
  let captured;
  const port = codexPort({activeCount: async () => 0, spawnAgent: async args => { captured = args; return {task_name: '/root/v001_build'}; }, waitAgentResult: async agentId => ({agentId, status: 'completed', result: 'verified', evidence: ['/actual/test-output']}), interruptAgent: async () => true}, codex);
  const result = await createRuntime({evidence: codex, port, sessionId: 'codex-session'}).run(brief());
  assert.equal(result.agentId, '/root/v001_build');
  assert.equal(captured.task_name, 'ctbz_module_one');
  assert.equal(captured.fork_turns, 'none');
  assert.equal(captured.model, 'gpt-6.1-sol');
  const data = JSON.parse(captured.message.split('\n').slice(1, -1).join('\n'));
  assert.equal(data.context, brief().context);
  assert.equal(data.sharedContract, path.join(repo, 'skills/ctbz/methods/contract.md'));
  assert.deepEqual(data.writeSet, brief().writeSet);
});

test('mid-task failure confirms old execution stopped, transfers checkpoint, and does not bypass permission denial', async () => {
  const events = [], notices = [];
  let stopped = false;
  const port = {activeCount: async () => 0, start: async () => ({agentId: 'real-agent'}), wait: async () => { throw Error('stream lost'); }, stop: async () => { stopped = true; return true; }};
  const run = createRuntime({evidence: codex, port, sessionId: 'mid-session', record: async e => events.push(e), notify: async e => notices.push(e), executeParent: async task => { assert.ok(stopped); return parent(task); }});
  const result = await run.run(brief('mid_failure'));
  assert.equal(result.reason, 'native-mid-task-failure');
  assert.equal(result.agentId, 'real-agent');
  assert.equal(notices.length, 1);
  let parentCalled = false;
  const denied = {...port, wait: async () => { const error = Error('permission denied'); error.code = 'PERMISSION_DENIED'; throw error; }};
  const blocked = await createRuntime({evidence: codex, port: denied, sessionId: 'denied-session', executeParent: async () => { parentCalled = true; }}).run(brief('denied'));
  assert.equal(blocked.status, 'permission-denied');
  assert.equal(parentCalled, false);
  const unresolvedRuntime = createRuntime({evidence: codex, port: {...port, stop: async () => false}, sessionId: 'lost-session', executeParent: async () => { parentCalled = true; }});
  const unresolved = await unresolvedRuntime.run(brief('lost'));
  assert.equal(unresolved.status, 'awaiting-stop');
  assert.equal(parentCalled, false);
  // An unconfirmed child releases its writeSet claim, so an overlapping sibling is not
  // permanently blocked; the taskId itself stays registered against duplicate dispatch.
  const overlapping = await unresolvedRuntime.run({...brief('lost_next'), writeSet: brief('lost').writeSet});
  assert.equal(overlapping.status, 'awaiting-stop');
  await assert.rejects(unresolvedRuntime.run(brief('lost')), /duplicate taskId in session/);
  const checkpoint = {files: [brief('resume').writeSet[0]], next: 'verify existing file'};
  const failed = {...port, wait: async () => ({agentId: 'real-agent', status: 'failed', checkpoint, evidence: ['/actual/partial-output']})};
  await createRuntime({evidence: codex, port: failed, sessionId: 'resume-session', executeParent: async (task, detail) => { assert.deepEqual(detail.checkpoint, checkpoint); return parent(task); }}).run(brief('resume'));
});

test('same task cannot be dispatched twice while the first native start is pending', async () => {
  let starts = 0, release;
  const held = new Promise(resolve => { release = resolve; });
  const port = {activeCount: async () => 0, start: async () => ({agentId: 'real_' + (++starts)}), wait: async handle => { await held; return {...handle, status: 'completed', evidence: ['actual output']}; }};
  const runtime = createRuntime({evidence: codex, port, sessionId: 'duplicate-session'});
  const first = runtime.run(brief('duplicate'));
  await assert.rejects(runtime.run({...brief('duplicate'), writeSet: [path.join(workspace, 'different.txt')]}), /duplicate taskId/);
  release();
  assert.equal((await first).status, 'completed');
  assert.equal(starts, 1);
});

test('installed unified entry discovers each private adapter and completes through harness-injected ports', async () => {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-installed-')));
  deploy(repo, home);
  const tools = {activeCount: async () => 0, spawnAgent: async () => ({agentId: 'installed-codex-agent'}), waitAgentResult: async agentId => ({agentId, status: 'completed', evidence: ['installed actual result']}), interruptAgent: async () => true};
  const runtime = await openRuntime({evidence: codex, home, nativeTools: tools, sessionId: 'installed-session', core: path.join(home, '.agents/skills/ctbz')});
  assert.equal((await runtime.run(brief('installed'))).agentId, 'installed-codex-agent');
  const ztools = {toolNames: {start: 'host.start', wait: 'host.wait', stop: 'host.stop'}, start: async () => ({agentId: 'installed-zcode-agent'}), wait: async handle => ({...handle, status: 'completed', evidence: ['native zcode output']}), stop: async () => true};
  assert.equal((await (await openRuntime({evidence: zcode, home, nativeTools: ztools, sessionId: 'zcode-session'})).run(brief('zcode'))).agentId, 'installed-zcode-agent');
  assert.throws(() => zcodePort({...ztools, toolNames: {start: 'invented'}}, zcode), /unavailable/);
  const missing = await openRuntime({evidence: codex, home: path.join(home, 'empty'), sessionId: 'empty-session', executeParent: parent});
  assert.equal((await missing.run(brief('missing_adapter'))).mode, 'parent');
});

test('synchronous zcode hosts may omit wait while start and stop stay mandatory', async () => {
  const syncTools = {toolNames: {start: 'host.start', stop: 'host.stop'}, start: async () => ({agentId: 'sync-zcode-agent', status: 'completed', evidence: ['synchronous actual output']}), stop: async () => true};
  const port = zcodePort(syncTools, zcode);
  assert.equal(typeof port.wait, 'function');
  assert.deepEqual(await port.wait({agentId: 'sync-zcode-agent'}), {agentId: 'sync-zcode-agent'});
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-sync-')));
  deploy(repo, home);
  const runtime = await openRuntime({evidence: zcode, home, nativeTools: syncTools, sessionId: 'sync-session', core: path.join(home, '.agents/skills/ctbz')});
  assert.equal((await runtime.run(brief('sync_zcode'))).agentId, 'sync-zcode-agent');
  assert.throws(() => zcodePort({...syncTools, start: undefined}, zcode), /missing start/);
  assert.throws(() => zcodePort({...syncTools, stop: undefined}, zcode), /missing stop/);
});

// 0.2.1 失败内审即时化：终态失败立刻回调 onTaskFailure，父会话在回调里记录 + 禁用 + 重派。
test('无证据完成即触发 onTaskFailure 并支持即时重派', async () => {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-audit-')));
  const briefFor = (taskId = 'audit_task') => ({...brief(taskId), workspace, writeSet: [path.join(workspace, taskId + '.txt')]});
  const events = [];
  const failures = [];
  let starts = 0;
  const agents = ['dead_agent', 'replacement_agent'];
  const port = {
    activeCount: async () => 0,
    start: async selection => ({agentId: agents[starts++] || 'late_agent'}),
    wait: async handle => handle.agentId === 'dead_agent'
      // 无证据完成：status=completed 但 evidence 为空 → 视为失败终态。
      ? {...handle, status: 'completed', evidence: []}
      : {...handle, status: 'completed', evidence: ['actual verified output']},
    stop: async () => true,
  };
  // 父会话在 onTaskFailure 内完成：写 audit 记录 → 任务级禁用 → 立即重派（不同身份）。
  const auditWrites = [];
  let redispatched = null;
  const runtime = createRuntime({
    evidence: codex,
    port,
    sessionId: 'audit-session',
    record: async e => events.push(e),
    notify: async () => {},
    onTaskFailure: async detail => {
      failures.push(detail);
      auditWrites.push({taskId: detail.taskId, agentId: detail.agentId, kind: detail.kind, attempt: detail.attempt});
      assert.equal(detail.kind, 'model-failure', '无证据完成归类 model-failure');
      assert.equal(detail.redispatch, true, '首次失败应允许重派');
      assert.equal(detail.escalate, false, '首次失败不升级');
      // 同一 run 内禁用该 Agent 身份，不再派发。
      assert.equal(runtime.isAgentDisabled(detail.taskId, detail.agentId), true);
      redispatched = await runtime.run({...briefFor(detail.taskId + '_retry'), objective: 'Write the authorized deliverable (redispatched)'});
      return false; // 父会话已自行重派，run 不再走 fallback
    },
  });
  const result = await runtime.run(briefFor('audit_task'));
  assert.equal(result.status, 'failed', '无证据完成且父会话已重派 → run 返回 failed 终态');
  assert.equal(result.agentId, 'dead_agent');
  assert.equal(failures.length, 1);
  assert.equal(failures[0].agentId, 'dead_agent');
  assert.equal(failures[0].attempt, 1);
  assert.ok(failures[0].receipt, '失败回调必须带回执');
  assert.equal(auditWrites.length, 1, '失败必须触发即时内审记录');
  assert.equal(auditWrites[0].taskId, 'audit_task');
  assert.equal(runtime.disabledAgents('audit_task').includes('dead_agent'), true);
  assert.equal(runtime.attempts('audit_task'), 1);
  // 重派的新 Agent 不同身份，立刻完成，不受原失败阻塞。
  assert.equal(redispatched.status, 'completed');
  assert.equal(redispatched.agentId, 'replacement_agent');
  assert.equal(starts, 2, '失败后立即重派新 Agent');
  // 权限拒绝不重派、不升级为重派。
  let deniedCalls = 0;
  const deniedAgents = [];
  const deniedPort = {
    activeCount: async () => 0,
    start: async () => ({agentId: 'denied_agent'}),
    wait: async handle => ({...handle, status: 'permission-denied', evidence: ['host refused']}),
    stop: async () => true,
  };
  const deniedRuntime = createRuntime({
    evidence: codex,
    port: deniedPort,
    sessionId: 'audit-denied-session',
    record: async () => {},
    notify: async () => {},
    onTaskFailure: async detail => {
      deniedCalls++;
      deniedAgents.push(detail.agentId);
      assert.equal(detail.kind, 'permission-denied');
      assert.equal(detail.redispatch, false, '权限拒绝不得重派');
    },
  });
  const denied = await deniedRuntime.run(briefFor('audit_denied'));
  assert.equal(denied.status, 'permission-denied');
  assert.equal(deniedCalls, 1);
  assert.deepEqual(deniedAgents, ['denied_agent']);
  assert.equal(deniedRuntime.isAgentDisabled('audit_denied', 'denied_agent'), true);
});
