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
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { type AcpSessionSetup, findAgentDescriptor, REGISTRY_ID_ALIASES } from '@wrongstack/acp';
import type { Config, SubagentRunContext, TaskSpec } from '@wrongstack/core/types';
import { cliSpawnArgs, isStandaloneBinary } from '@wrongstack/core/utils';

export type BridgeServer = 'sage' | 'mailbox' | 'kanban' | 'codebase-index' | 'requirement-intake';

export const DEFAULT_BRIDGE_AGENTS: readonly string[] = ['claude-code'];
export const DEFAULT_BRIDGE_SERVERS: readonly BridgeServer[] = [
  'codebase-index',
  'sage',
  'mailbox',
  'kanban',
];

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

const SERVER_NOTES: Record<BridgeServer, (delegated: boolean) => string> = {
  sage: () =>
    "- wrongstack-sage: the project's shared memory. Recall what is relevant before you " +
    'start; when you learn something durable (a decision, a gotcha, a convention), propose ' +
    'it with memory_candidates (WrongStack reviews proposals).',
  mailbox: (delegated) =>
    "- wrongstack-mailbox: the project's agent mailbox, already signed in as you. Send progress, " +
    'blockers and questions to ' +
    (delegated
      ? '"@session" (the WrongStack session that delegated this task), '
      : '"all" (the agents working in this project), ') +
    '(a send needs a type, e.g. "note"), check unread mail during long work, and acknowledge ' +
    'what you handle.',
  kanban: () =>
    "- wrongstack-kanban: the project's board. If the task names a card, keep its status " +
    'current. Lists return only the most recently updated (pass limit for more); use the ' +
    'stats action for totals and workbench for what is in flight.',
  'codebase-index': () =>
    '- wrongstack-index: a prebuilt, ranked symbol index of this repository, kept fresh by ' +
    'WrongStack. Prefer it over grep/glob and whole-file reads for code navigation: ' +
    'codebase_search (where something is defined), codebase_incoming_calls / ' +
    "codebase_outgoing_calls (callers, callees), codebase_read_symbol (one symbol's source), " +
    'codebase_skeleton (a file or folder outline), codebase_impact_analysis (what a change ' +
    'affects), codebase_context (files relevant to a task), codebase_repo_map (overview). ' +
    'Use grep for literal text such as strings, comments and config values.',
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
      // Read-only for the worker, but kept fresh: it edits outside WrongStack.
      return [...base, '--watch'];
    case 'requirement-intake':
      return [...base, '--writable'];
  }
}

/**
 * The note appended to the worker's system prompt. It must not vary per task
 * or per worker: the system prompt is the head of the agent's prompt cache, so
 * a task id or worker id in it made every worker rewrite ~25k cached tokens
 * (measured: $0.21 per one-line task, against $0.008 with a stable prompt).
 * Per-worker identity lives in the MCP servers' arguments instead.
 */
export function bridgeNote(servers: readonly BridgeServer[], delegated = true): string {
  return [
    'You are working as a delegated worker inside a WrongStack project.',
    'WrongStack is the orchestrator the user runs: it sent you this task and receives your',
    'final reply, so end with a clear summary of what you did and what is left.',
    ...(delegated
      ? [
          'While you work, the WrongStack session can steer you: such a message arrives as a',
          'user message starting with "[WrongStack <kind> from <agent>]". Treat it as coming',
          'from the user who delegated the task, and answer what it asks.',
        ]
      : []),
    '',
    "WrongStack's project services are available as MCP servers:",
    ...servers.map((s) => SERVER_NOTES[s](delegated)),
    '',
    'Use your own tools for code and files; these servers are for coordination. If one is',
    'unavailable, carry on without it.',
    '',
    "WrongStack applies the user's rules to your edits and commands. A refused permission",
    'comes from them (a deny rule the user wrote, a history-rewriting git command, a',
    'credential read): do not retry it or work around it; finish what you can and name what',
    'was refused in your final reply.',
  ].join('\n');
}

/** True when `command` resolves to a file on PATH (PATHEXT-aware on Windows). */
export function onPath(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const pathVar = env.PATH ?? env.Path ?? '';
  const exts =
    platform === 'win32' ? ['', ...(env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';')] : [''];
  const sep = platform === 'win32' ? ';' : ':';
  for (const dir of pathVar.split(sep)) {
    if (!dir) continue;
    for (const ext of exts) {
      try {
        if (statSync(join(dir, command + ext)).isFile()) return true;
      } catch {
        // not here
      }
    }
  }
  return false;
}

/**
 * Bridged agents the leader can hand a task to on this machine: listed in
 * `acp.bridge.agents` (by catalog or registry id) and either configured by
 * the user in `acp.agents` or with their CLI on PATH. Catalog ids, in order.
 */
export function installedBridgeAgents(
  acp: Config['acp'] | undefined,
  isOnPath: (command: string) => boolean = (c) => onPath(c),
): string[] {
  if ((acp?.bridge?.servers ?? DEFAULT_BRIDGE_SERVERS).length === 0) return [];
  const toCatalogId = new Map(Object.entries(REGISTRY_ID_ALIASES).map(([c, r]) => [r, c]));
  const out: string[] = [];
  for (const listed of acp?.bridge?.agents ?? DEFAULT_BRIDGE_AGENTS) {
    const id = findAgentDescriptor(listed) ? listed : (toCatalogId.get(listed) ?? listed);
    if (out.includes(id)) continue;
    const probe = findAgentDescriptor(id)?.probe.command;
    if (acp?.agents?.[id] || acp?.agents?.[listed] || (probe && isOnPath(probe))) out.push(id);
  }
  return out;
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
  return (_task, ctx) => ({
    mcpServers: servers.map((server): StdioServer => {
      const launch = wstackLaunch(serverArgs(server, projectRoot, ctx));
      return { name: SERVER_NAMES[server], ...launch, env: [] };
    }),
    meta: {
      systemPrompt: {
        // `@session` only reaches someone when a WrongStack session delegated the task.
        append: bridgeNote(servers, ctx.sessionId !== undefined),
      },
    },
  });
}
