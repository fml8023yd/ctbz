import {createHash} from 'node:crypto';

// 宿主实测：Agent 异步返回真实内部 agentId；对外回执只允许派生短引用。
const requiredTools = Object.freeze(['Agent', 'TaskStop', 'SendMessage']);
const requiredFunctions = Object.freeze(['dispatchAgent', 'agentResult', 'stopAgent']);
const roleTypes = Object.freeze({
  planner: 'Plan',
  reviewer: 'Explore',
  explorer: 'Explore',
  researcher: 'Explore',
  reporter: 'Explore',
  implementer: 'general-purpose',
  debugger: 'general-purpose',
  tester: 'general-purpose',
});
const statusAliases = Object.freeze({
  completed: 'completed',
  success: 'completed',
  ok: 'completed',
  failed: 'failed',
  failure: 'failed',
  error: 'failed',
  'permission-denied': 'permission-denied',
  permission_denied: 'permission-denied',
  denied: 'permission-denied',
});

// 宿主强制：原始 agentId 不得直接展示给最终用户，只能暴露确定性不可逆短引用。
export function receiptRef(agentId) {
  if (typeof agentId !== 'string' || !agentId.trim()) throw Error('agentId is required');
  return createHash('sha256').update(agentId, 'utf8').digest('hex').slice(0, 8);
}

function normalizeStatus(status) {
  const normalized = statusAliases[status];
  if (!normalized) throw Error(`Claude Code receipt has unsupported status: ${status}`);
  return normalized;
}

export function createPort(tools, evidence) {
  if (evidence?.harness !== 'claude-code') throw Error('Claude Code adapter selected for a different harness');
  if (!Array.isArray(evidence.tools) || requiredTools.some(name => !evidence.tools.includes(name))) throw Error('Claude Code native tools unavailable');
  for (const key of requiredFunctions) if (typeof tools?.[key] !== 'function') throw Error(`Claude Code wrapper missing ${key}`);
  return {
    async start(selection, message) {
      const subagent_type = roleTypes[selection?.role];
      if (!subagent_type) throw Error(`Claude Code has no subagent route for role: ${selection?.role}`);
      const result = await tools.dispatchAgent({subagent_type, description: `ctbz ${selection.taskName || selection.role}`, prompt: message});
      const agentId = result?.agentId || result?.agent_id;
      if (typeof agentId !== 'string' || !agentId.trim()) throw Error('Claude Code start omitted actual agentId');
      return {agentId};
    },
    async wait(handle) {
      const result = await tools.agentResult(handle.agentId);
      // 身份必须来自宿主回执，不能用 handle 回填冒充真实身份。
      const agentId = result?.agentId || result?.agent_id;
      if (typeof agentId !== 'string' || !agentId.trim()) throw Error('Claude Code receipt omitted actual agentId');
      if (agentId !== handle.agentId) throw Error('Claude Code receipt identity mismatch');
      const status = normalizeStatus(result.status);
      const evidence = result.evidence;
      if (!Array.isArray(evidence) || !evidence.length || evidence.some(item => typeof item !== 'string' || !item.trim())) throw Error('Claude Code receipt requires actual evidence');
      return {agentId, status, evidence};
    },
    // 只有 wrapper 确认子任务已停止才返回 true，避免重复写。
    async stop(handle) {
      return (await tools.stopAgent(handle.agentId)) === true;
    },
  };
}
