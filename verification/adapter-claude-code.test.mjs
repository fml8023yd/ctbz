import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const core = path.join(repo, 'skills/ctbz');
const {selectHarness, createRuntime} = await import(path.join(core, 'scripts/lib/native-runtime.mjs'));
const {deploy} = await import(path.join(core, 'scripts/lib/release.mjs'));
const {createPort, receiptRef} = await import(path.join(repo, 'adapters/claude-code/scripts/native.mjs'));

const evidence = {source: 'current-harness-tool-list', harness: 'claude-code', tools: ['Agent', 'TaskStop', 'SendMessage']};

function fakeTools(store = {}) {
  return {
    dispatchAgent: async args => { store.dispatched = args; return {agentId: 'agent-12345'}; },
    agentResult: async agentId => ({agentId, status: 'completed', evidence: ['tool: Read']}),
    stopAgent: async agentId => { store.stopped = agentId; return true; },
  };
}

test('selectHarness 识别 claude-code 原生宿主', () => {
  assert.deepEqual(selectHarness(evidence), {mode: 'native', harness: 'claude-code'});
  assert.equal(selectHarness({...evidence, harness: 'unknown'}).mode, 'parent');
  assert.equal(selectHarness({...evidence, source: 'guess'}).mode, 'parent');
});

test('createPort 拒绝错误 harness、缺工具与缺注入函数', () => {
  const tools = fakeTools();
  assert.throws(() => createPort(tools, {...evidence, harness: 'codex'}), /different harness/);
  assert.throws(() => createPort(tools, {...evidence, tools: ['Agent', 'SendMessage']}), /tools unavailable/);
  assert.throws(() => createPort({dispatchAgent() {}, agentResult() {}}, evidence), /missing stopAgent/);
  assert.throws(() => createPort(null, evidence), /missing dispatchAgent/);
});

test('start 返回真实 agentId，wait 身份一致，stop 确认 true', async () => {
  const store = {};
  const port = createPort(fakeTools(store), evidence);
  const handle = await port.start({role: 'implementer', taskName: 'ctbz_demo'}, 'do it');
  assert.equal(handle.agentId, 'agent-12345');
  assert.equal(store.dispatched.subagent_type, 'general-purpose');
  const receipt = await port.wait(handle);
  assert.equal(receipt.agentId, handle.agentId);
  assert.equal(receipt.status, 'completed');
  assert.ok(receipt.evidence.length);
  assert.equal(await port.stop(handle), true);
  assert.equal(store.stopped, 'agent-12345');
});

test('角色路由符合只读/可写映射', async () => {
  const expected = {planner: 'Plan', reviewer: 'Explore', explorer: 'Explore', researcher: 'Explore', reporter: 'Explore', implementer: 'general-purpose', debugger: 'general-purpose', tester: 'general-purpose'};
  for (const [role, subagent] of Object.entries(expected)) {
    const store = {};
    await createPort(fakeTools(store), evidence).start({role, taskName: `ctbz_${role}`}, 'x');
    assert.equal(store.dispatched.subagent_type, subagent, role);
  }
});

test('wait 拒绝身份不一致或缺失证据', async () => {
  const tools = fakeTools();
  tools.agentResult = async () => ({agentId: 'other-id', status: 'completed', evidence: ['x']});
  await assert.rejects(createPort(tools, evidence).wait({agentId: 'agent-12345'}), /identity mismatch/);
  tools.agentResult = async agentId => ({agentId, status: 'completed', evidence: []});
  await assert.rejects(createPort(tools, evidence).wait({agentId: 'agent-12345'}), /requires actual evidence/);
});

test('receiptRef 稳定、8 位十六进制且不等于原 agentId', () => {
  const first = receiptRef('agent-12345');
  assert.match(first, /^[a-f0-9]{8}$/);
  assert.equal(receiptRef('agent-12345'), first);
  assert.notEqual(first, 'agent-12345');
  assert.notEqual(receiptRef('agent-54321'), first);
  assert.throws(() => receiptRef(''), /required/);
});

test('createRuntime 注入假 port 跑完 task 并在内部记录真实 agentId', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-cc-'));
  const task = {
    taskId: 'demo_task',
    role: 'implementer',
    phase: 'implement',
    objective: 'write the demo output',
    context: 'standalone test context',
    authorization: 'test authorization',
    workspace,
    writeSet: [path.join(workspace, 'out.txt')],
    inputs: [],
    acceptance: ['out.txt exists'],
    stopConditions: ['blocked'],
    budget: {maxRepairRounds: 1},
    methods: [],
  };
  const events = [];
  const runtime = createRuntime({
    evidence,
    port: {
      start: async () => ({agentId: 'agent-12345'}),
      wait: async handle => ({agentId: handle.agentId, status: 'completed', evidence: ['file: out.txt']}),
      stop: async () => true,
    },
    sessionId: 'session-adapter-test',
    record: event => events.push(event),
    core,
  });
  const result = await runtime.run(task);
  assert.equal(result.mode, 'native');
  assert.equal(result.status, 'completed');
  assert.equal(result.agentId, 'agent-12345');
  assert.ok(events.some(event => event.status === 'running' && event.agentId === 'agent-12345'));
  assert.ok(events.some(event => event.status === 'completed' && event.agentId === 'agent-12345'));
});

test('deploy 不因 baseline 缺少新增 claude-code 记录而误判漂移', () => {
  const home = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ctbz-home-'));
  try {
    const maintenance = path.join(home, '.ctbz-install');
    fs.mkdirSync(maintenance, {recursive: true});
    // 旧版 baseline 只有三个包，每个记录为空快照（目标未安装时 installedSnapshot 同构）。
    fs.writeFileSync(path.join(maintenance, 'baseline.json'), JSON.stringify({schemaVersion: 1, version: '0.1.0', packages: {core: {}, codex: {}, zcode: {}}}));
    const result = deploy(repo, home);
    assert.equal(result.ok, true);
    assert.ok(fs.existsSync(path.join(home, '.claude/skills/ctbz-claude-code/SKILL.md')));
  } finally {
    fs.rmSync(home, {recursive: true, force: true});
  }
});

test('deploy 仍拦截 baseline 中已记录包的真实漂移', () => {
  const home = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ctbz-home-'));
  try {
    const maintenance = path.join(home, '.ctbz-install');
    fs.mkdirSync(maintenance, {recursive: true});
    fs.writeFileSync(path.join(maintenance, 'baseline.json'), JSON.stringify({schemaVersion: 1, version: '0.1.0', packages: {core: {'stale.txt': '0'.repeat(64)}, codex: {}, zcode: {}}}));
    assert.throws(() => deploy(repo, home), /installed core drift/);
  } finally {
    fs.rmSync(home, {recursive: true, force: true});
  }
});
