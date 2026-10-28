// w0_schema 层级化数据模型验收：role/depth/parentAgentId、状态扩展、leader group 执行绑定、
// 派生调度与父状态汇总。零 DOM、零网络；仅用临时目录落盘验证持久化路径。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  NODE_STATUSES, NODE_ROLES, DashboardError, validateBoard,
  initBoard, readBoard, mutateBoard, syncTask, rankBoard, deriveParentStatus,
} from '../skills/ctbz/scripts/lib/dashboard-store.mjs';

const temporary = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-hierarchy-')));

function makeNode(overrides = {}) {
  return { id: overrides.id ?? 'n1', title: `节点 ${overrides.id ?? 'n1'}`, dependsOn: [], score: 50, archived: false, ...overrides };
}

// 完整节点工厂：用于 validateBoard 内存构造（补齐 status/createdAt/updatedAt 等非 NODE_FIELDS 字段）。
function makeBoardNode(overrides = {}) {
  const at = '2026-01-01T00:00:00.000Z';
  return makeNode({ parentId: null, kind: 'task', status: 'planned', outcome: 'unknown', description: '', owner: '', model: '', scoreReason: '', result: '', method: '', pitfalls: '', nextSteps: '', evidence: [], createdAt: at, updatedAt: at, completedRound: null, ...overrides });
}

test('NODE_STATUSES 扩展与角色常量导出', () => {
  for (const status of ['planned', 'active', 'completed', 'blocked', 'cancelled', 'produced', 'reviewing', 'rework', 'approved']) {
    assert.ok(NODE_STATUSES.includes(status), `缺少状态 ${status}`);
  }
  assert.deepEqual([...NODE_ROLES].sort(), ['leader', 'worker']);
});

test('向后兼容：仅含旧 5 状态与旧字段的看板照常加载，不要求 role/depth', async () => {
  const workspace = temporary();
  await initBoard(workspace, { title: 'Legacy board', goal: 'Old data must load unchanged' });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'legacy-task', status: 'planned' }) });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'legacy-done', status: 'active' }) });
  await mutateBoard(workspace, 'node.upsert', { node: { id: 'legacy-done', status: 'completed', result: '结论', evidence: ['证据'] } });
  const board = await readBoard(workspace);
  const done = board.nodes.find(node => node.id === 'legacy-done');
  assert.equal(done.status, 'completed');
  assert.equal(done.role, 'worker', '缺省 role 视为 worker');
  assert.equal(done.parentAgentId, null);
  assert.equal(done.depth, 0);
});

test('新 4 状态接受并持久化', async () => {
  const workspace = temporary();
  await initBoard(workspace, { title: 'New statuses', goal: 'Accept produced/reviewing/rework/approved' });
  for (const status of ['produced', 'reviewing', 'rework', 'approved']) {
    await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: `node-${status}`, status }) });
    const board = await readBoard(workspace);
    assert.equal(board.nodes.find(node => node.id === `node-${status}`).status, status);
  }
});

test('非法状态拒绝', async () => {
  const workspace = temporary();
  await initBoard(workspace, { title: 'Bad status', goal: 'Reject unknown statuses' });
  await assert.rejects(
    mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'bad', status: 'shipped' }) }),
    error => error instanceof DashboardError && /node.status must be one of/.test(error.message),
  );
});

test('leader role 只能挂在 group 上', async () => {
  const workspace = temporary();
  await initBoard(workspace, { title: 'Roles', goal: 'Role constraints' });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'crew', kind: 'group', role: 'leader' }) });
  await assert.rejects(
    mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'solo', kind: 'task', role: 'leader' }) }),
    /Only groups can carry role=leader/,
  );
  const board = await readBoard(workspace);
  assert.equal(board.nodes.find(node => node.id === 'crew').role, 'leader');
});

test('depth 由 parentId 链推导，手填被拒绝', async () => {
  const workspace = temporary();
  await initBoard(workspace, { title: 'Depth', goal: 'Derived depth' });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'root', kind: 'group' }) });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'mid', kind: 'group', parentId: 'root' }) });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'leaf', parentId: 'mid' }) });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'moved', parentId: 'root' }) });
  let board = await readBoard(workspace);
  assert.equal(board.nodes.find(node => node.id === 'root').depth, 0);
  assert.equal(board.nodes.find(node => node.id === 'mid').depth, 1);
  assert.equal(board.nodes.find(node => node.id === 'leaf').depth, 2);
  assert.equal(board.nodes.find(node => node.id === 'moved').depth, 1);
  await assert.rejects(
    mutateBoard(workspace, 'node.upsert', { node: { id: 'leaf', depth: 9 } }),
    /depth is derived/,
  );
  await mutateBoard(workspace, 'node.upsert', { node: { id: 'leaf', parentId: null } });
  board = await readBoard(workspace);
  assert.equal(board.nodes.find(node => node.id === 'leaf').depth, 0, '父节点变化后 depth 重算');
});

test('parentAgentId 只能指向 role=leader 的父节点', async () => {
  const workspace = temporary();
  await initBoard(workspace, { title: 'Agent chain', goal: 'parentAgentId constraints' });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'lead', kind: 'group', role: 'leader' }) });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'plain', kind: 'group' }) });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'worker-1', parentId: 'lead', parentAgentId: 'lead' }) });
  await assert.rejects(
    mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'worker-2', parentId: 'plain', parentAgentId: 'plain' }) }),
    /parentAgentId must reference a leader parent/,
  );
  await assert.rejects(
    mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'worker-3', parentAgentId: 'ghost' }) }),
    error => error instanceof DashboardError && /parentAgentId must reference a leader parent/.test(error.message),
  );
});

test('validateBoard 拒绝 parentAgentId 指向非 leader 父节点（落盘数据层兜底）', async () => {
  const workspace = temporary();
  await initBoard(workspace, { title: 'Guard', goal: 'Board-level guard' });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'plain', kind: 'group' }) });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'kid', parentId: 'plain' }) });
  const boardPath = path.join(workspace, '.ctbz-record', 'dashboard.json');
  const board = JSON.parse(fs.readFileSync(boardPath, 'utf8'));
  board.nodes.find(node => node.id === 'kid').parentAgentId = 'plain';
  fs.writeFileSync(boardPath, JSON.stringify(board, null, 2));
  await assert.rejects(readBoard(workspace), /parentAgentId must reference a leader parent/);
});

test('leader group 可绑定执行身份，普通汇总 group 拒绝且错误信息说明原因', async () => {
  const workspace = temporary();
  await initBoard(workspace, { title: 'Binding', goal: 'Leader group execution binding' });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'lead', kind: 'group', role: 'leader' }) });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'summary', kind: 'group' }) });
  await assert.rejects(
    syncTask(workspace, { taskId: 'sum-run', nodeId: 'summary', title: 'sum run', status: 'running' }, { runId: 'run-2', sessionId: 'sess', scopeEpoch: 1 }),
    /An execution task cannot bind a summary group; only role=leader groups can carry execution identity/,
  );
  const bound = await syncTask(workspace, { taskId: 'lead-run', nodeId: 'lead', title: 'lead run', status: 'running' }, { runId: 'run-1', sessionId: 'sess', scopeEpoch: 1 });
  const lead = bound.nodes.find(node => node.id === 'lead');
  assert.ok(lead.execution, 'leader group 绑定了执行身份');
  assert.equal(lead.execution.taskId, 'lead-run');
  await assert.rejects(
    mutateBoard(workspace, 'node.upsert', { node: { id: 'lead', kind: 'task' } }),
    /Cannot change the kind of a bound execution node/,
  );
  const board = await readBoard(workspace);
  assert.equal(board.nodes.find(node => node.id === 'summary').execution, undefined);
});

test('rankBoard：leader group 带可执行后代进入候选，空 leader 与普通 group 不进入', async () => {
  const workspace = temporary();
  await initBoard(workspace, { title: 'Dispatch', goal: 'Derived dispatch' });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'lead', kind: 'group', role: 'leader' }) });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'empty-lead', kind: 'group', role: 'leader' }) });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'summary', kind: 'group' }) });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'child', parentId: 'lead', status: 'planned' }) });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'done-child', parentId: 'summary', status: 'completed', result: '结论', evidence: ['证据'] }) });
  const ranking = rankBoard(await readBoard(workspace));
  const lead = ranking.find(node => node.id === 'lead');
  const empty = ranking.find(node => node.id === 'empty-lead');
  const summary = ranking.find(node => node.id === 'summary');
  assert.ok(lead, 'leader group 进入排序队列');
  assert.equal(lead.eligible, true);
  assert.equal(empty.eligible, false, '无可执行后代的 leader 不可调度');
  assert.match(empty.blockedReason, /no executable descendants/);
  assert.ok(!summary, '普通汇总 group 不进入排序队列');
});

test('rankBoard：blocked leader 自身与后代都不可调度，普通叶子不受 leader 引入影响', async () => {
  const workspace = temporary();
  await initBoard(workspace, { title: 'Dispatch guard', goal: 'Leader must not bypass own blocked state' });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'blocked-lead', kind: 'group', role: 'leader', status: 'blocked' }) });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'kid', parentId: 'blocked-lead' }) });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'solo', status: 'planned' }) });
  const ranking = rankBoard(await readBoard(workspace));
  const leader = ranking.find(node => node.id === 'blocked-lead');
  assert.equal(leader.eligible, false, '自身 blocked 的 leader 不可调度');
  assert.match(leader.blockedReason, /blocked/i);
  assert.equal(ranking.find(node => node.id === 'kid').eligible, false, 'blocked leader 的后代沿祖先链被挡');
  assert.equal(ranking.find(node => node.id === 'solo').eligible, true, '普通叶子任务照常可调度');
});

test('deriveParentStatus：全部完成、任一返工、受阻无进行中、其余进行中四种情况', () => {
  const child = (status, id = status) => ({ id, status });
  assert.equal(deriveParentStatus([child('completed', 'a'), child('completed', 'b')]), 'completed');
  assert.equal(deriveParentStatus([child('completed', 'a'), child('rework', 'b')]), 'rework');
  assert.equal(deriveParentStatus([child('blocked', 'a'), child('completed', 'b')]), 'blocked');
  assert.equal(deriveParentStatus([child('active', 'a'), child('blocked', 'b')]), 'active');
  assert.equal(deriveParentStatus([child('planned', 'a')]), 'active', '存在未完成子节点即非终态');
  assert.equal(deriveParentStatus([]), 'planned', '空子节点集返回 planned');
  assert.equal(deriveParentStatus([child('cancelled', 'a'), child('completed', 'b')]), 'completed', '混合终态视为完成');
});

test('deriveParentStatus 与看板约束协同：rework 子节点阻止父 group 完成', async () => {
  const workspace = temporary();
  await initBoard(workspace, { title: 'Rework gate', goal: 'Rework blocks parent completion' });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'parent', kind: 'group' }) });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'kid', parentId: 'parent', status: 'rework' }) });
  await assert.rejects(
    mutateBoard(workspace, 'node.upsert', { node: { id: 'parent', status: 'completed', result: '结论', evidence: ['证据'] } }),
    /unfinished descendants/,
  );
});

test('全 cancelled 子节点：父 group 不得被 deriveParentStatus 判为 completed（视为 blocked）', () => {
  const child = (status, id = status) => ({ id, status });
  assert.equal(deriveParentStatus([child('cancelled', 'a'), child('cancelled', 'b')]), 'blocked', '全 cancelled 不视为 completed');
  assert.equal(deriveParentStatus([child('completed', 'a'), child('cancelled', 'b')]), 'completed', '混合终态（含 completed）仍判 completed');
  assert.equal(deriveParentStatus([child('cancelled', 'a'), child('completed', 'b'), child('cancelled', 'c')]), 'completed');
});

test('deriveParentStatus 真正接线：子节点进入终态后父 group 状态被自动汇总（全 cancelled → blocked）', async () => {
  const workspace = temporary();
  await initBoard(workspace, { title: 'Rollup', goal: 'Parent status rolls up from child terminal transitions' });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'parent', kind: 'group', status: 'active' }) });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'a', parentId: 'parent', status: 'planned' }) });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'b', parentId: 'parent', status: 'planned' }) });
  let board = await readBoard(workspace);
  assert.equal(board.nodes.find(node => node.id === 'parent').status, 'active', '子节点均为 planned 时父保持 active');

  // 全部进入 cancelled → 父须滚到 blocked，而非 completed。
  await mutateBoard(workspace, 'node.upsert', { node: { id: 'a', parentId: 'parent', status: 'cancelled' } });
  await mutateBoard(workspace, 'node.upsert', { node: { id: 'b', parentId: 'parent', status: 'cancelled' } });
  board = await readBoard(workspace);
  assert.equal(board.nodes.find(node => node.id === 'parent').status, 'blocked', '全 cancelled 父 group 滚到 blocked');

  // 把 a 翻转成 completed（混合终态）→ 父须滚到 approved（自动汇总不置 completed，避免缺 result/evidence）。
  // a 当前是 cancelled（终态），须先 reopen 到非终态再置 completed。
  await mutateBoard(workspace, 'node.upsert', { node: { id: 'a', parentId: 'parent', status: 'planned' }, reopen: true, reason: '翻转测试' });
  await mutateBoard(workspace, 'node.upsert', { node: { id: 'a', parentId: 'parent', status: 'completed', result: '结论', evidence: ['证据'] } });
  board = await readBoard(workspace);
  assert.equal(board.nodes.find(node => node.id === 'parent').status, 'approved', '混合终态（completed+cancelled）父滚到 approved（自动汇总不置 completed）');
});

test('嵌套 leader 拒绝：leader 组挂在另一 leader 组之下 → node.upsert 现场 fail LEADER_DEPTH_EXCEEDED', async () => {
  const workspace = temporary();
  await initBoard(workspace, { title: 'Nested leader', goal: 'Max leader depth 2 (live)' });
  await mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'outer', kind: 'group', role: 'leader' }) });
  await assert.rejects(
    mutateBoard(workspace, 'node.upsert', { node: makeNode({ id: 'inner', kind: 'group', parentId: 'outer', role: 'leader' }) }),
    /LEADER_DEPTH_EXCEEDED/,
  );
  // validateBoard 对内存构造的嵌套 leader board 同样拒绝。
  const board = {
    schemaVersion: 2, revision: 0,
    project: { id: 'p', title: 'x', goal: '', mode: 'normal', phase: 'discussion', status: 'active', isExample: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', round: 0, budget: { maxRounds: null, minutes: null }, control: { requestedAction: null, requestedAt: null, acknowledgedAt: null, acknowledgement: '' }, owner: null, lastHeartbeat: null, planRevision: 0, checkpoint: null },
    nodes: [
      makeBoardNode({ id: 'outer', kind: 'group', role: 'leader' }),
      makeBoardNode({ id: 'inner', kind: 'group', parentId: 'outer', role: 'leader' }),
    ],
    questions: [], rounds: [], knowledge: [], requests: [], events: [],
  };
  assert.throws(() => validateBoard(structuredClone(board)), /LEADER_DEPTH_EXCEEDED/, 'validateBoard 必须拒绝嵌套 leader');
});

test('rankBoard 排除内层（嵌套）leader：仅顶层 leader 进队列', () => {
  // rankBoard 不调 validateBoard，内存构造含嵌套 leader 的 board 以验证过滤逻辑。
  const board = {
    schemaVersion: 2, revision: 0,
    project: { id: 'p', title: 'x', goal: '', mode: 'normal', phase: 'discussion', status: 'active', isExample: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', round: 0, budget: { maxRounds: null, minutes: null }, control: { requestedAction: null, requestedAt: null, acknowledgedAt: null, acknowledgement: '' }, owner: null, lastHeartbeat: null, planRevision: 0, checkpoint: null },
    nodes: [
      makeBoardNode({ id: 'outer', kind: 'group', role: 'leader' }),
      makeBoardNode({ id: 'inner', kind: 'group', parentId: 'outer', role: 'leader' }),
      makeBoardNode({ id: 'w', parentId: 'inner', status: 'planned' }),
    ],
    questions: [], rounds: [], knowledge: [], requests: [], events: [],
  };
  const ranking = rankBoard(board);
  assert.ok(!ranking.some(node => node.id === 'inner'), '内层 leader 不进入 rankBoard 队列');
  assert.ok(ranking.some(node => node.id === 'w'), '内层 leader 的执行后代照常进队列');
});
