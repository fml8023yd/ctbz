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
const brief = (taskId = 'module_one') => ({taskId, role: 'implementer', phase: 'implement', workspace, objective: 'Write the authorized deliverable', context: 'The user selected unified CTBZ. Preserve the existing interface and data.', authorization: 'User authorized the named test workspace writeSet.', inputs: [], writeSet: [path.join(workspace, taskId + '.txt')], acceptance: ['File contains verified result'], stopConditions: ['Permission denial or user pause'], budget: {maxRepairRounds: 3}, methods: ['verification-before-completion']});
const parent = async task => { fs.writeFileSync(task.writeSet[0], 'verified'); return {evidence: task.writeSet}; };

test('selection uses actual host evidence, enforces model and real in-flight limit without task-list loophole', () => {
  assert.equal(selectHarness({harness: 'codex', tools: codex.tools}).mode, 'parent');
  assert.equal(selectHarness({...codex, harness: 'unknown'}).mode, 'parent');
  assert.equal(nativeSelection({...brief(), phase: 'plan'}, codex, 0).model, 'gpt-6-astra');
  assert.equal(nativeSelection(brief(), codex, 0).model, 'gpt-6.1-sol');
  assert.equal(nativeSelection(brief(), {...codex, tasks: []}, 2).mode, 'queued');
  assert.equal(sessionRoot(workspace, 'codex'), path.join(workspace, '.codex/ctbz'));
  assert.equal(sessionRoot(workspace, 'zcode'), path.join(workspace, '.zcode/ctbz'));
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
    const runtime = createRuntime({...options, sessionId: 'real-fixture-session', executeParent: parent, notify: async event => notices.push(event), record: async event => records.push(event)});
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
  const overlapping = await unresolvedRuntime.run({...brief('lost_next'), writeSet: brief('lost').writeSet});
  assert.equal(overlapping.reason, 'write-conflict');
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

test('concurrent calls reserve capacity and include agents outside the current task list', async () => {
  let active = 1, highest = 1, release;
  const held = new Promise(resolve => { release = resolve; });
  const port = {activeCount: async () => active, start: async selection => { active++; highest = Math.max(highest, active); return {agentId: selection.taskName}; }, wait: async handle => { await held; active--; return {...handle, status: 'completed', evidence: ['real-output']}; }};
  const runtime = createRuntime({evidence: codex, port, sessionId: 'parallel-session'});
  const first = runtime.run(brief('parallel_one'));
  const second = runtime.run(brief('parallel_two'));
  assert.equal((await second).mode, 'queued');
  release();
  assert.equal((await first).status, 'completed');
  assert.equal(highest, 2);
});

test('installed unified entry discovers each private adapter and completes through harness-injected ports', async () => {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-installed-')));
  deploy(repo, home);
  const tools = {activeCount: async () => 0, spawnAgent: async () => ({agentId: 'installed-codex-agent'}), waitAgentResult: async agentId => ({agentId, status: 'completed', evidence: ['installed actual result']}), interruptAgent: async () => true};
  const runtime = await openRuntime({evidence: codex, home, nativeTools: tools, sessionId: 'installed-session', core: path.join(home, '.agents/skills/ctbz')});
  assert.equal((await runtime.run(brief('installed'))).agentId, 'installed-codex-agent');
  const zcode = {harness: 'zcode', source: 'current-harness-tool-list', tools: ['host.start', 'host.wait', 'host.stop']};
  const ztools = {toolNames: {start: 'host.start', wait: 'host.wait', stop: 'host.stop'}, activeCount: async () => 0, start: async () => ({agentId: 'installed-zcode-agent'}), wait: async handle => ({...handle, status: 'completed', evidence: ['native zcode output']}), stop: async () => true};
  assert.equal((await (await openRuntime({evidence: zcode, home, nativeTools: ztools, sessionId: 'zcode-session'})).run(brief('zcode'))).agentId, 'installed-zcode-agent');
  assert.throws(() => zcodePort({...ztools, toolNames: {start: 'invented'}}, zcode), /unavailable/);
  const missing = await openRuntime({evidence: codex, home: path.join(home, 'empty'), sessionId: 'empty-session', executeParent: parent});
  assert.equal((await missing.run(brief('missing_adapter'))).mode, 'parent');
});
