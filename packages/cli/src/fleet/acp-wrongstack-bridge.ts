/**
 * The WrongStack bridge for delegated ACP workers.
 *
 * When WrongStack hands a task to an external agent (Claude Code over ACP by
 * default), the agent keeps its own identity, tools and sign-in; it only
 * needs to know it is working inside this project and how to reach it. Each
 * session therefore gets:
 *   - the project's MCP servers, each launched as `wstack mcp serve <name>`
 *     with an explicit `--project-root` (works in the standalone binary, and
 *     attaches only to this project's running owner);
 *   - a short note appended to the agent's own system prompt, through the
 *     `_meta.systemPrompt.append` extension the Claude ACP adapter reads.
 *
 * Mailbox identity is per worker (`--actor` = subagent id) and `@session`
 * resolves to the WrongStack session that delegated the task.
 */
import { type AcpSessionSetup, REGISTRY_ID_ALIASES } from '@wrongstack/acp';
import type { Config, SubagentRunContext, TaskSpec } from '@wrongstack/core/types';
import { cliSpawnArgs, isStandaloneBinary } from '@wrongstack/core/utils';

export type BridgeServer = 'sage' | 'mailbox' | 'kanban' | 'codebase-index' | 'requirement-intake';

export const DEFAULT_BRIDGE_AGENTS: readonly string[] = ['claude-code'];
export const DEFAULT_BRIDGE_SERVERS: readonly BridgeServer[] = ['sage', 'mailbox', 'kanban'];

type BridgeConfig = NonNullable<NonNullable<Config['acp']>['bridge']>;

interface StdioServer {
  name: string;
  command: string;
  args: string[];
  env: { name: string; value: string }[];
}

/** How to start this same `wstack`: the binary itself, or node/bun + the CLI entry. */
export function wstackLaunch(
  args: string[],
  entry: string | undefined = process.argv[1],
): { command: string; args: string[] } {
  if (isStandaloneBinary() || (entry && /wstack|wrongstack|index\.(js|ts|mjs|cjs)$/.test(entry))) {
    return { command: process.execPath, args: cliSpawnArgs(entry ?? '', args) };
  }
  return { command: 'wstack', args };
}

const SERVER_NAMES: Record<BridgeServer, string> = {
  sage: 'wrongstack-sage',
  mailbox: 'wrongstack-mailbox',
  kanban: 'wrongstack-kanban',
  'codebase-index': 'wrongstack-index',
  'requirement-intake': 'wrongstack-intake',
};

const SERVER_NOTES: Record<BridgeServer, (actor: string, delegated: boolean) => string> = {
  sage: () =>
    "- wrongstack-sage: the project's shared memory. Recall what is relevant before you " +
    'start; when you learn something durable (a decision, a gotcha, a convention), propose ' +
    'it with memory_candidates (WrongStack reviews proposals).',
  mailbox: (actor, delegated) =>
    `- wrongstack-mailbox: the project's agent mailbox. You are "${actor}". Send progress, ` +
    'blockers and questions to ' +
    (delegated
      ? '"@session" (the WrongStack session that delegated this task), '
      : '"all" (the agents working in this project), ') +
    '(a send needs a type, e.g. "note"), check unread mail during long work, and acknowledge ' +
    'what you handle.',
  kanban: () =>
    "- wrongstack-kanban: the project's board. If the task names a card, keep its status current.",
  'codebase-index': () =>
    "- wrongstack-index: the project's code index, for symbol and reference lookups.",
  'requirement-intake': () =>
    "- wrongstack-intake: the project's requirements intake. List open requests; file a new " +
    'one when you are handed an unrecorded software request.',
};

function serverArgs(server: BridgeServer, projectRoot: string, ctx: SubagentRunContext): string[] {
  const actor = ctx.subagentId;
  const base = ['mcp', 'serve', server, `--project-root=${projectRoot}`];
  switch (server) {
    case 'sage':
      return [...base, `--origin=${actor}`];
    case 'mailbox': {
      const name = ctx.config.name ?? actor;
      return [
        ...base,
        `--actor=${actor}`,
        `--name=${name}`,
        ...(ctx.config.role ? [`--role=${ctx.config.role}`] : []),
        ...(ctx.sessionId ? [`--session-id=${ctx.sessionId}`] : []),
        // Switch last: the global parser would read a following word as its value.
        '--writable',
      ];
    }
    case 'kanban':
      return [...base, `--actor=${actor}`, '--writable'];
    case 'codebase-index':
      return base;
    case 'requirement-intake':
      return [...base, '--writable'];
  }
}

export function bridgeNote(
  servers: readonly BridgeServer[],
  actor: string,
  taskId: string,
  delegated = true,
): string {
  return [
    `You are working as a delegated worker inside a WrongStack project (task ${taskId}).`,
    'WrongStack is the orchestrator the user runs: it sent you this task and receives your',
    'final reply, so end with a clear summary of what you did and what is left.',
    '',
    "WrongStack's project services are available as MCP servers:",
    ...servers.map((s) => SERVER_NOTES[s](actor, delegated)),
    '',
    'Use your own tools for code and files; these servers are for coordination. If one is',
    'unavailable, carry on without it.',
  ].join('\n');
}

/**
 * The per-session setup for `agentId`, or undefined when the bridge does not
 * apply to it (not listed, turned off, or no servers).
 */
export function wrongstackBridgeSetup(
  agentId: string,
  projectRoot: string,
  config: BridgeConfig | undefined,
): ((task: TaskSpec, ctx: SubagentRunContext) => AcpSessionSetup) | undefined {
  const agents = config?.agents ?? DEFAULT_BRIDGE_AGENTS;
  // `claude-code` is also reachable by its registry id, `claude-acp`.
  if (!agents.some((a) => a === agentId || REGISTRY_ID_ALIASES[a] === agentId)) return undefined;
  const servers = [...new Set(config?.servers ?? DEFAULT_BRIDGE_SERVERS)].filter(
    (s): s is BridgeServer => Object.hasOwn(SERVER_NAMES, s),
  );
  if (servers.length === 0) return undefined;
  return (task, ctx) => ({
    mcpServers: servers.map((server): StdioServer => {
      const launch = wstackLaunch(serverArgs(server, projectRoot, ctx));
      return { name: SERVER_NAMES[server], ...launch, env: [] };
    }),
    meta: {
      systemPrompt: {
        // `@session` only reaches someone when a WrongStack session delegated the task.
        append: bridgeNote(servers, ctx.subagentId, task.id, ctx.sessionId !== undefined),
      },
    },
  });
}
