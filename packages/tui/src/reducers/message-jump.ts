import type { Action } from '../app-action-type.js';
import type { State } from '../app-state.js';

type MessageJumpAction = Extract<Action, { type: 'messageJump' }>;

/**
 * Alt+↑ / Alt+↓: step through the user's own messages in the transcript.
 * The first Alt+↑ lands on the newest one; further steps stop at either end.
 * `seq` increments on every step so the view scrolls even when the target
 * entry is the same one (the user may have scrolled away since).
 */
export function reduceMessageJump(state: State, action: MessageJumpAction): State {
  const userIds = state.entries.filter((e) => e.kind === 'user').map((e) => e.id);
  if (userIds.length === 0) return state;
  const current = state.messageJump.entryId;
  const at = current === null ? -1 : userIds.indexOf(current);
  let next: number;
  if (at === -1) next = action.direction < 0 ? userIds.length - 1 : 0;
  else next = Math.min(userIds.length - 1, Math.max(0, at + action.direction));
  return {
    ...state,
    messageJump: { entryId: userIds[next] ?? null, seq: state.messageJump.seq + 1 },
  };
}
