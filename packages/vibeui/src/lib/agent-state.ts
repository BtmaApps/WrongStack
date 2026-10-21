// Structural view of AgentEntry: importing the type from ./session closes a module cycle.
interface AgentWorkSignals {
  hasWorked?: boolean;
  partialText: string;
  entries: readonly unknown[];
  iterations: number;
  toolCalls: number;
  status: string;
}

/**
 * Whether an `error` frame's phase ends the run: the server's prompt/run phases
 * and core's terminal `error` events. Refusals of other requests (rate limit,
 * parse, queue, ...) also arrive as `error` while the run goes on.
 */
export const endsRun = (phase: unknown) =>
  ['user_message', 'agent.run', 'abort', 'agent', 'provider', 'tool'].includes(String(phase));

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
