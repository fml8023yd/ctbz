export function createPort(tools, evidence) {
  if (evidence.harness !== 'zcode') throw Error('ZCode harness evidence required');
  // Tool names and loaded-profile routing come from the user's current ZCode wrapper.
  const names = tools?.toolNames;
  if (!names || ['start', 'wait', 'stop'].some(key => typeof names[key] !== 'string' || !evidence.tools.includes(names[key]))) throw Error('ZCode native tools unavailable');
  for (const key of ['start', 'wait', 'stop', 'activeCount']) if (typeof tools[key] !== 'function') throw Error(`ZCode parent wrapper missing ${key}`);
  return {
    activeCount: tools.activeCount,
    async start(selection, message) {
      const handle = await tools.start({role: selection.role, phase: selection.phase, model: selection.model, taskName: selection.taskName, message});
      if (!handle || typeof handle.agentId !== 'string' || !handle.agentId.trim()) throw Error('ZCode start omitted actual agentId');
      return handle;
    },
    wait: tools.wait,
    stop: tools.stop,
  };
}
