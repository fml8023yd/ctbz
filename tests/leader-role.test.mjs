import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {validateTask, taskMessage} from '../skills/ctbz/scripts/lib/native-runtime.mjs';
import {roleMethods} from '../skills/ctbz/scripts/lib/methods.mjs';
import {initialize} from '../adapters/zcode/scripts/lib/初始化.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const core = path.join(repo, 'skills/ctbz');
const registry = JSON.parse(fs.readFileSync(path.join(core, '角色清单.json'), 'utf8'));
const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-leader-')));
const models = ['custom:test:design', 'custom:test:economy'];
const catalog = {candidates: models.map(key => ({key, reasoningVariants: ['high']}))};
const bundle = initialize(registry, catalog, models);
const profileOf = role => bundle.profiles.find(p => p.role === role);
// leader 已绑定共享方法（methods/index.json: dispatching-parallel-agents + verification-before-completion），
// 但空 methods 仍然合法；需要方法的用例显式传入，避免默认值掩盖索引缺失。
const brief = (role, writeSet, methods = role === 'leader' ? [] : ['verification-before-completion']) => ({taskId: 'leader_task', role, phase: 'implement', workspace, objective: 'Dispatch workers and relay their evidence', context: 'Parent authorized a two-level fan-out for this module.', authorization: 'Parent authorized the leader fan-out; writeSet stays empty.', inputs: [], writeSet, acceptance: ['Workers report real agentIds'], stopConditions: ['Permission denial or depth exceeded'], budget: {maxRepairRounds: 0}, methods});

test('role registry declares leader with the Agent tool and no write tools', () => {
  const leader = registry.roles.find(role => role.id === 'leader');
  assert.ok(leader, '角色清单缺少 leader 角色');
  assert.equal(leader.name, '组长');
  assert.ok(leader.tools.includes('Agent'), 'leader 必须带 Agent 工具');
  assert.equal(leader.tools.includes('Write'), false, 'leader 不得带 Write');
  assert.equal(leader.tools.includes('Edit'), false, 'leader 不得带 Edit');
  assert.equal(leader.instructions.includes('不写交付文件'), true, 'leader 指令必须声明不写交付文件');
  assert.equal(registry.roles.filter(role => role.tools.includes('Agent')).length, 1, '只有 leader 可以带 Agent 工具');
  assert.equal(bundle.profiles.length, registry.roles.length * models.length, 'leader 应参与批量生成');
});

test('validateTask accepts role=leader', () => {
  const task = validateTask(brief('leader', []));
  assert.equal(task.role, 'leader');
  assert.equal(task.coreVersion, '0.2.1');
  assert.deepEqual(task.writeSet, []);
  assert.equal(task.methods.length, 0);
  // leader 已登记 verification-before-completion，故此处改为验证它被接受；
  // 越界方法仍必须被共享角色索引拒绝（换成 leader 未绑定的 test-driven-development）。
  assert.deepEqual(validateTask({...brief('leader', []), methods: ['verification-before-completion']}).methods.map(method => method.id), ['verification-before-completion']);
  assert.throws(() => validateTask({...brief('leader', []), methods: ['test-driven-development']}), /shared role index/);
});

test('validateTask rejects a nonempty writeSet for leader with the leader-specific reason', () => {
  assert.throws(() => validateTask(brief('leader', [path.join(workspace, 'deliverable.txt')])), /leader 只派发与聚合，不写交付文件/);
});

test('validateTask still lets implementer write inside its authorized writeSet', () => {
  const writeSet = [path.join(workspace, 'module.txt')];
  const task = validateTask(brief('implementer', writeSet));
  assert.equal(task.role, 'implementer');
  assert.deepEqual(task.writeSet, writeSet);
  assert.equal(profileOf('implementer').tools.includes('Write'), true);
});

test('existing read-only roles keep the original rejection message', () => {
  assert.throws(() => validateTask(brief('planner', [path.join(workspace, 'plan.txt')])), /read-only role requires an empty writeSet/);
  for (const role of ['reviewer', 'explorer', 'researcher', 'reporter']) {
    assert.throws(() => validateTask(brief(role, [path.join(workspace, role + '.txt')])), /read-only role requires an empty writeSet/);
    assert.equal(profileOf(role).tools.includes('Write'), false, `${role} 仍不得带 Write`);
  }
});

test('the generator omits the no-derivation sentence for leader', () => {
  const leader = profileOf('leader');
  assert.ok(leader, '批量生成缺少 leader profile');
  assert.equal(leader.instructions.includes('不得派生Agent'), false, 'leader 不得再被告知“不得派生Agent”');
  assert.equal(leader.instructions.includes('只派生工人，不得派生组长；最大深度 2 级；不做裁决、不写交付文件。'), true, 'leader 应获得等价边界句');
  assert.equal(taskMessage(brief('leader', [])).includes('Do not spawn agents'), false, '派给 leader 的任务载荷不得再写 Do not spawn agents');
  assert.equal(taskMessage(brief('leader', [])).includes('Dispatch only workers'), true, '派给 leader 的任务载荷应说明只派生工人');
});

test('the generator keeps the no-derivation sentence byte-for-byte for every other role', () => {
  const others = registry.roles.filter(role => role.id !== 'leader');
  assert.ok(others.length >= 8, '其余角色数量不应减少');
  for (const role of others) {
    const profile = profileOf(role.id);
    assert.ok(profile, `批量生成缺少 ${role.id} profile`);
    assert.equal(profile.instructions.includes('\n不得派生Agent。遵守任务写集合与验收要求。'), true, `${role.id} 必须逐字保留“不得派生Agent。”`);
    assert.equal(profile.instructions.includes('只派生工人，不得派生组长'), false, `${role.id} 不得获得 leader 的派生授权`);
  }
  const implementer = profileOf('implementer');
  const exact = '\n不得派生Agent。';
  assert.equal(implementer.instructions.split('Read 共享契约')[0].endsWith(exact + '遵守任务写集合与验收要求。\n'), true, 'implementer 的禁令句必须逐字紧贴原文');
  assert.equal(taskMessage(brief('implementer', [])).includes('Do not spawn agents'), true, '非 leader 角色仍保留 Do not spawn agents');
});

test('leader resolves a nonempty method set from the shared index', () => {
  const methods = roleMethods('leader');
  assert.ok(methods.length > 0, 'leader 必须至少绑定一个共享方法');
  const ids = methods.map(method => method.id);
  assert.ok(ids.includes('verification-before-completion'), 'leader 必须拿到 verification-before-completion');
  assert.ok(ids.includes('dispatching-parallel-agents'), 'leader 必须拿到 dispatching-parallel-agents');
  assert.equal(ids.includes('test-driven-development'), false, 'leader 不写代码，不应拿实现类方法');
  for (const method of methods) {
    assert.ok(path.isAbsolute(method.entry), `${method.id} 入口必须解析为绝对路径`);
    assert.ok(fs.existsSync(method.entry), `${method.id} 入口文件必须存在`);
    for (const resource of method.resources) assert.ok(fs.existsSync(resource), `${method.id} 资源必须存在: ${resource}`);
  }
  assert.equal(profileOf('leader').instructions.includes('dispatching-parallel-agents: '), true, '生成的 leader profile 必须带上方法入口行');
});

test('validateTask accepts a leader task that carries its indexed methods', () => {
  const ids = roleMethods('leader').map(method => method.id);
  const task = validateTask({...brief('leader', []), methods: ids});
  assert.equal(task.role, 'leader');
  assert.deepEqual(task.methods.map(method => method.id), ids, '合法方法必须原样保留');
  assert.equal(taskMessage({...brief('leader', []), methods: ids}).includes('verification-before-completion'), true, '任务载荷必须带出所选方法');
  assert.throws(() => validateTask({...brief('leader', []), methods: ['not-a-method']}), /shared role index/);
  assert.throws(() => validateTask({...brief('leader', []), methods: ['test-driven-development']}), /shared role index/, 'leader 不得使用未绑定的实现类方法');
});

test('cost-rules role_tier registers leader in exactly one legal tier', () => {
  const rules = JSON.parse(fs.readFileSync(path.join(core, 'cost-rules.json'), 'utf8'));
  assert.ok(rules.role_tier && typeof rules.role_tier === 'object', 'role_tier 必须存在');
  const tiers = Object.entries(rules.role_tier).filter(([, roles]) => Array.isArray(roles));
  assert.ok(tiers.length > 0, 'role_tier 必须至少有一个档位');
  for (const [tier] of tiers) assert.ok(['heavy', 'light'].includes(tier), `未知档位 ${tier}`);
  const hits = tiers.filter(([, roles]) => roles.includes('leader')).map(([tier]) => tier);
  assert.deepEqual(hits, ['heavy'], 'leader 必须且只能登记在一个档位中，且为 heavy');
  const heavy = new Set(rules.role_tier.heavy), light = new Set(rules.role_tier.light);
  assert.equal([...heavy].some(role => light.has(role)), false, '同一角色不得同时出现在 heavy 与 light');
});
