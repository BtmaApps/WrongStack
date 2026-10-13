/**
 * The host services an ACP leader gets from the CLI (see acp-leader-host.ts),
 * bound to the agent that runs each session: the leader in the REPL and TUI,
 * and on the WebUI each tab's own agent, so the workers a tab's agent starts
 * belong to that tab.
 */
import { randomUUID } from 'node:crypto';
import type { Agent } from '@wrongstack/core/agent';
import type { EventBus } from '@wrongstack/core/kernel';
import type { Config, ConfirmAwaiter, Tool } from '@wrongstack/core/types';
import {
  type AcpLeaderHost,
  type AcpLeaderSessionAgent,
  acpLeaderSessionAgent,
} from './acp-leader-host.js';

export interface AcpLeaderHostOptions {
  /** The leader: the agent of any session the host does not run itself. */
  agent: Agent;
  events: EventBus;
  projectRoot: string;
  getConfig(): Config;
  getTool(name: string): Tool | undefined;
  confirmAwaiter?: ConfirmAwaiter | undefined;
}

export function createAcpLeaderHost(opts: AcpLeaderHostOptions): AcpLeaderHost {
  const agentFor = (sessionId: string | undefined): AcpLeaderSessionAgent =>
    (sessionId ? acpLeaderSessionAgent(sessionId) : undefined) ?? opts.agent;
  return {
    events: opts.events,
    projectRoot: opts.projectRoot,
    getConfig: opts.getConfig,
    permission: (sessionId) => agentFor(sessionId).permission,
    context: (sessionId) => agentFor(sessionId).ctx,
    getTool: opts.getTool,
    runTool: async (name, input, run = {}) => {
      const agent = agentFor(run.sessionId);
      const use = { type: 'tool_use' as const, id: `acp_fleet_${randomUUID()}`, name, input };
      const batch = await agent.toolExecutor.executeBatch([use], agent.ctx, 'sequential');
      let result = batch.outputs[0]?.result;
      if (result?.type === 'tool_confirm_pending') {
        // The policy wants this call confirmed. The permission request the
        // agent sent for it was usually asked already; `approve` knows.
        const tool = opts.getTool(name);
        const approved = { ...use, input: result.input as Record<string, unknown> };
        if (!tool || !(await run.approve?.(tool, approved.input))) {
          return { content: `${name} was not approved by the user.`, isError: true };
        }
        result = (
          await agent.toolExecutor.executeTool(
            tool,
            approved,
            agent.ctx,
            agent.perIterationOutputCapBytes,
          )
        ).block;
      }
      if (!result) return { content: `${name} returned no result.`, isError: true };
      const content =
        typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
      return { content, isError: Boolean(result.is_error) };
    },
    confirmAwaiter: opts.confirmAwaiter,
  };
}
