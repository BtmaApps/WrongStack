import type { Context } from '@wrongstack/core/agent';
import {
  getBoard,
  type KanbanBoard,
  type KanbanEventContext,
  managementTaskVersion,
} from '@wrongstack/kanban';
import { KanbanToolError } from './kanban-tool-results.js';
import { KANBAN_READ_ONLY_ACTIONS, type KanbanToolInput } from './kanban-tool-types.js';

const EDIT_ACTIONS = new Set([
  'update_task',
  'add_check',
  'add_note',
  'review_task',
  'add_link',
  'add_dependency',
  'set_chain',
  'assess_atomicity',
  'propose_decomposition',
]);
const DETAIL_FIELDS = new Set(['action', 'boardId', 'taskId', 'description', 'priority']);

export function managementEventFence(
  ctx: Context,
): Pick<KanbanEventContext, 'expectedManagementToken' | 'expectedManagementTaskVersions'> {
  const identity = ctx.meta?.['kanban'] as { managementToken?: string } | undefined;
  if (!identity?.managementToken) return {};
  return {
    expectedManagementToken: identity.managementToken,
    expectedManagementTaskVersions: ctx.meta['kanbanManagementTaskVersions'] as
      | Record<string, string>
      | undefined,
  };
}

export function rememberManagementRead(ctx: Context, board: KanbanBoard | undefined): void {
  const identity = ctx.meta?.['kanban'] as
    | { managementToken?: string; boardId?: string }
    | undefined;
  if (!identity?.managementToken || !board || board.id !== identity.boardId) return;
  ctx.meta['kanbanManagementTaskVersions'] = Object.fromEntries(
    board.tasks.map((task) => [task.id, managementTaskVersion(board, task)]),
  );
}

/** A manager can document work, but cannot take over the leader's execution. */
export async function guardKanbanManagement(input: KanbanToolInput, ctx: Context): Promise<void> {
  const identity = ctx.meta?.['kanban'] as
    | { boardId?: string; managementToken?: string }
    | undefined;
  if (!identity?.managementToken) return;
  const refuse = (message: string): never => {
    throw new KanbanToolError('REFUSED', message);
  };
  if (input.boardId !== identity.boardId)
    refuse('The task manager is restricted to its assigned board.');
  const board = await getBoard(ctx.projectRoot, identity.boardId!);
  if (
    !board ||
    board.management?.lease?.token !== identity.managementToken ||
    board.management.lease.expiresAt <= Date.now()
  ) {
    refuse('The task manager no longer owns a live management lease.');
  }
  if (
    board!.supervisor?.enabled === false ||
    board!.supervisor?.mode === 'deterministic' ||
    board!.completedAt ||
    board!.kind === 'archive' ||
    board!.retention?.archivedAt
  )
    refuse('Task management is disabled for this board.');
  if ((KANBAN_READ_ONLY_ACTIONS as readonly string[]).includes(input.action)) return;
  if (!EDIT_ACTIONS.has(input.action))
    refuse(
      'Task managers may only enrich cards and propose decomposition; execution and lifecycle changes belong to the leader.',
    );
  const ids = input.action === 'set_chain' ? (input.taskIds ?? []) : [input.taskId];
  if (!ids.length) refuse('At least one active card is required.');
  for (const id of ids) {
    const task = board!.tasks.find((candidate) => candidate.id === id);
    if (!task || task.status === 'archived' || task.status === 'completed')
      refuse('Only active cards can be enriched.');
    if (
      input.action !== 'add_note' &&
      input.action !== 'review_task' &&
      (task!.status === 'in_progress' ||
        task!.status === 'review' ||
        task!.assignment ||
        task!.assignee ||
        task!.assignedAgent ||
        task!.park)
    ) {
      refuse(
        'This card is owned by a worker. Add a proposal note instead of changing its contract.',
      );
    }
    const version = managementEventFence(ctx).expectedManagementTaskVersions?.[task!.id];
    if (version !== managementTaskVersion(board!, task!))
      refuse(
        'The card changed or has not been read. Read the live board and reassess before writing.',
      );
  }
  if (input.action === 'add_note') input.author = 'kanban-manager';
  if (
    input.action === 'update_task' &&
    Object.keys(input).some(
      (key) => input[key as keyof KanbanToolInput] !== undefined && !DETAIL_FIELDS.has(key),
    )
  ) {
    refuse('A manager may update only the description and priority of an unassigned card.');
  }
  if (input.action === 'add_check' && input.checkStatus && input.checkStatus !== 'pending')
    refuse('New acceptance checks must remain pending until independently verified.');
}
