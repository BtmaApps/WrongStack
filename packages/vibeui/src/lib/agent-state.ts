// Structural view of AgentEntry: importing the type from ./session closes a module cycle.
interface AgentWorkSignals {
  hasWorked?: boolean;
  partialText: string;
  entries: readonly unknown[];
  iterations: number;
  toolCalls: number;
  status: string;
}

export const isActiveAgent = (status: string) =>
  ['running', 'busy', 'working', 'active', 'starting', 'spawned'].includes(status);

export const hasAgentWork = (agent: AgentWorkSignals) =>
  Boolean(
    agent.hasWorked ||
      agent.partialText ||
      agent.entries.length ||
      agent.iterations ||
      agent.toolCalls ||
      [
        'done',
        'completed',
        'failed',
        'error',
        'stopped',
        'interrupted',
        'cancelled',
        'aborted',
      ].includes(agent.status),
  );
