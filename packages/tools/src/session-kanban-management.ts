import type { Context } from '@wrongstack/core/agent';
import type { KanbanBoard } from '@wrongstack/kanban';

const delivered = new WeakMap<Context, Map<string, number>>();

/** Board mutations carry the review to its leader without creating another turn. */
export function deliverKanbanManagementReview(context: Context, board: KanbanBoard): void {
  const review = board.management;
  if (review?.status !== 'completed' || !review.lastCompletedAt || !review.summary) return;
  const owner = board.tags?.find((tag) => tag.startsWith('session:'))?.slice(8);
  if (owner && owner !== context.session?.id) return;
  const key = `${context.session?.id ?? ''}:${board.id}`;
  const seen = delivered.get(context) ?? new Map<string, number>();
  if ((seen.get(key) ?? 0) >= review.lastCompletedAt) return;
  const text = `[KANBAN TODO UPDATE]\nThe background task manager reviewed board ${board.id}.\n${review.summary}\nRead the current cards before acting. Preserve blockers and evidence requirements; the manager's review does not complete the work.`;
  // Do not append a new user message and wake an idle/completed leader. The
  // next active request can consume the durable board summary instead.
  if (!context.state.appendBlockToLastUserMessage?.({ type: 'text', text })) return;
  seen.set(key, review.lastCompletedAt);
  delivered.set(context, seen);
}
