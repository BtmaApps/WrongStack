import { touchKanbanPresence } from '@wrongstack/kanban';
import type { KanbanToolInput, KanbanToolOutput } from './kanban-tool-types.js';
import { KANBAN_READ_ONLY_ACTIONS } from './kanban-tool-types.js';

interface KanbanPresenceContext {
  session?: { id?: string | undefined } | undefined;
  agentId?: string | undefined;
  agentName?: string | undefined;
}

const READ_ONLY = new Set<string>(KANBAN_READ_ONLY_ACTIONS);

/**
 * Presence is itself a board mutation (`mutateBoard` bumps the revision), so
 * it runs only after MUTATING actions. Touching presence on reads turned every
 * get_board / events poll into a write, bumping revisions and creating
 * stale-write contention with the agents actually changing the board.
 */
export function createKanbanPresenceWrapper(
  projectRoot: string,
  input: KanbanToolInput,
  ctx: KanbanPresenceContext,
) {
  return async (result: KanbanToolOutput): Promise<KanbanToolOutput> => {
    if (READ_ONLY.has(input.action)) return result;
    const boardId = result.board?.id ?? input.boardId;
    if (!result.ok || !boardId || !ctx.session?.id || !ctx.agentId) return result;
    try {
      const board = await touchKanbanPresence(projectRoot, boardId, {
        sessionId: ctx.session.id,
        agentId: ctx.agentId,
        agentName: ctx.agentName,
        taskId: input.taskId ?? result.task?.id,
        runTaskId: input.runTaskId,
      });
      return board && result.board ? { ...result, board } : result;
    } catch {
      return result;
    }
  };
}
