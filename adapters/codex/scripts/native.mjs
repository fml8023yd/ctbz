const required = ['collaboration.spawn_agent', 'collaboration.wait_agent', 'collaboration.interrupt_agent'];
export function createPort(tools, evidence) {
  if (evidence.harness !== 'codex' || required.some(name => !evidence.tools.includes(name))) throw Error('Codex native tools unavailable');
  for (const key of ['spawnAgent', 'waitAgentResult', 'interruptAgent', 'activeCount']) if (typeof tools?.[key] !== 'function') throw Error(`Codex parent wrapper missing ${key}`);
  return {
    activeCount: tools.activeCount,
    async start(selection, message) {
      const result = await tools.spawnAgent({task_name: selection.taskName, fork_turns: 'none', model: selection.model, message});
      const agentId = result?.agentId || result?.agent_id || result?.task_name || result?.agent_name;
      if (typeof agentId !== 'string' || !agentId.trim()) throw Error('Codex start omitted actual agentId');
      return {agentId};
    },
    wait: handle => tools.waitAgentResult(handle.agentId),
    // interrupt_agent acknowledgment alone is insufficient: wrapper confirms the child stopped.
    stop: handle => tools.interruptAgent(handle.agentId),
  };
}
