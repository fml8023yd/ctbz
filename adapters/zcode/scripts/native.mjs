export function createPort(tools, evidence) {
  if (evidence.harness !== 'zcode') throw Error('ZCode harness evidence required');
  // Tool names and loaded-profile routing come from the user's current ZCode wrapper.
  // The harness scheduler owns parallelism; this port only carries start/wait/stop.
  const names = tools?.toolNames;
  if (!names || ['start', 'stop'].some(key => typeof names[key] !== 'string' || !evidence.tools.includes(names[key]))) throw Error('ZCode native tools unavailable');
  for (const key of ['start', 'stop']) if (typeof tools[key] !== 'function') throw Error(`ZCode parent wrapper missing ${key}`);
  return {
    async start(selection, message) {
      const handle = await tools.start({role: selection.role, phase: selection.phase, model: selection.model, taskName: selection.taskName, message});
      if (!handle || typeof handle.agentId !== 'string' || !handle.agentId.trim()) throw Error('ZCode start omitted actual agentId');
      return handle;
    },
    // Synchronous harnesses (Agent returns its terminal receipt) map wait to identity.
    // An asynchronous host supplies a real wait; a synchronous one may omit it entirely.
    wait: handle => (tools.wait ? tools.wait(handle) : handle),
    stop: tools.stop,
  };
}
