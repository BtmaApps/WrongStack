import type { MCPToolAnnotations } from '@wrongstack/mcp';

export const KANBAN_READ_ACTIONS = [
  'list_boards',
  'get_board',
  'export_markdown',
  'export_task_graph',
  'search_tasks',
  'ready_tasks',
  'snapshot',
  'workbench',
  'get_task',
  'get_chain',
  'events',
  'queue_health',
  'board_history',
  'get_contract_graph',
] as const;

export const KANBAN_MANAGE_ACTIONS = [
  'create_board',
  'duplicate_board',
  'update_board',
  'adopt_managed_lifecycle',
  'release_managed_lifecycle',
  'generate_board',
  'sync_task_graph',
  'create_from_graph',
  'import_session_tasks',
  'add_task',
  'split_task',
  'copy_task',
  'start_task',
  'update_task',
  'transition_task',
  'repair_managed_projection',
  'move_task',
  'set_chain',
  'claim_task',
  'release_task',
  'assign_task',
  'mark_assignment',
  'heartbeat_assignment',
  'recover_stale',
  'add_dependency',
  'add_goal_metric',
  'update_goal_metric',
  'add_check',
  'update_check',
  'remove_check',
  'add_note',
  // Requires a host-issued management lease in the calling context.
  'review_task',
  'add_link',
  'record_activity',
  'verify_completion',
  'split_atomic',
  'assess_atomicity',
  'propose_decomposition',
  // Resolving a proposal creates child cards (approve) or closes the proposal
  // (reject). Neither removes durable work, so both belong with split_task in
  // the manage tier rather than behind --destructive.
  'approve_decomposition',
  'reject_decomposition',
  // Contract-map editing, removals included. The map is advisory metadata
  // about a card rather than the card itself, and the same tier that can add
  // a node should be able to take it back — requiring `--destructive` to undo
  // an annotation you just made would be the wrong shape. Task and board
  // deletion stay destructive.
  'configure_contract_graph',
  'upsert_contract_node',
  'remove_contract_node',
  'add_contract_edge',
  'remove_contract_edge',
] as const;

/** Operations that remove or absorb durable task/board state. */
export const KANBAN_DESTRUCTIVE_ACTIONS = [
  'delete_board',
  'delete_task',
  'merge_tasks',
  'transfer_task',
] as const;

export type KanbanReadAction = (typeof KANBAN_READ_ACTIONS)[number];
export type KanbanManageAction = (typeof KANBAN_MANAGE_ACTIONS)[number];
export type KanbanDestructiveAction = (typeof KANBAN_DESTRUCTIVE_ACTIONS)[number];
export type KanbanMcpAction = KanbanReadAction | KanbanManageAction | KanbanDestructiveAction;
export type KanbanMcpToolName =
  | 'kanban_read'
  | 'kanban_manage'
  | 'kanban_destructive'
  | 'kanban_watch';

export interface KanbanMcpPolicyOptions {
  writable?: boolean;
  destructive?: boolean;
}

export interface KanbanMcpToolPolicy {
  name: KanbanMcpToolName;
  actions?: readonly KanbanMcpAction[];
}

/**
 * MCP `ToolAnnotations` — the five optional hint fields from the Model Context
 * Protocol schema (byte-identical in the 2025-03-26 and 2026-07-28 revisions,
 * verified against the per-revision schema). `@wrongstack/mcp` publishes this exact
 * shape as `MCPToolAnnotations` on `MCPServerTool.annotations`, so this is an
 * alias rather than a local restatement: one source of truth for the wire type,
 * and a new upstream hint becomes visible here automatically. The name is kept
 * because the tier mapping below reads it locally.
 *
 * Spec semantics: `destructiveHint` and `idempotentHint` are meaningful only
 * when `readOnlyHint` is false. Spec defaults are readOnly=false,
 * destructive=true, idempotent=false, openWorld=true. Annotations are
 * UNTRUSTED hints for clients (UI affordances, approval prompts) — nothing
 * here gates execution; the tier enforcement in the adapter's `callTool`
 * remains the authority.
 */
export type KanbanToolAnnotations = MCPToolAnnotations;

/**
 * Tier → published MCP annotations. The hints mirror the tier semantics the
 * action lists in this file already encode:
 *
 * - `kanban_read` and `kanban_watch` never mutate board state — watch only
 *   long-polls the daemon's event stream — so both publish `readOnlyHint:
 *   true` and leave the mutation-only hints unset (they are meaningless
 *   under a read-only tool).
 * - `kanban_manage` mutates but never removes durable work: every action
 *   that deletes or absorbs task/board state (delete/merge/transfer) lives
 *   in the destructive tier. The removals manage does carry
 *   (`remove_check`, `remove_contract_node`/`edge`) strip advisory metadata,
 *   which is exactly why the action lists classify them as manage — they are
 *   recoverable by re-adding and do not destroy the card or board.
 * - `kanban_destructive` is the delete/merge/transfer tier.
 *
 * `openWorldHint: false` on every tier: these tools act on the local
 * project's own board store through the project IPC owner — a closed,
 * self-owned set of entities — not the unpredictable third-party systems
 * (web search, external APIs) the spec's `true` default is about.
 *
 * `idempotentHint` is deliberately unset everywhere: the spec default
 * (false) is honest. Manage actions are generative (retrying `add_task`
 * duplicates the card), destructive deletes of a missing id throw
 * NOT_FOUND instead of succeeding, and merge/transfer move state between
 * boards. None is idempotent, and an affirmative hint would invite unsafe
 * client retries.
 *
 * `destructiveHint` is published explicitly even where it matches the spec
 * default: stating the semantics is the point of the field, and an explicit
 * value survives a client that applies defaults sloppily.
 */
export const KANBAN_TOOL_ANNOTATIONS: Readonly<Record<KanbanMcpToolName, KanbanToolAnnotations>> = {
  kanban_read: { readOnlyHint: true, openWorldHint: false },
  kanban_watch: { readOnlyHint: true, openWorldHint: false },
  kanban_manage: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  kanban_destructive: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
};

export function selectKanbanMcpTools(opts: KanbanMcpPolicyOptions = {}): KanbanMcpToolPolicy[] {
  const tools: KanbanMcpToolPolicy[] = [
    { name: 'kanban_read', actions: KANBAN_READ_ACTIONS },
    { name: 'kanban_watch' },
  ];
  if (opts.writable === true || opts.destructive === true) {
    tools.push({ name: 'kanban_manage', actions: KANBAN_MANAGE_ACTIONS });
  }
  if (opts.destructive === true) {
    tools.push({ name: 'kanban_destructive', actions: KANBAN_DESTRUCTIVE_ACTIONS });
  }
  return tools;
}
