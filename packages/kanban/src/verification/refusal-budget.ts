/**
 * The refusal-budget record on a card, and the one rule for clearing it.
 *
 * This is a LEAF module on purpose: it imports nothing but types. The budget
 * has to be cleared from the paths that re-scope a card — `applyTaskPatch` in
 * `manager/task-factory.ts` and the acceptance-criteria mutators in
 * `manager/tasks.ts` — and `manager/_internal.ts` re-exports `task-factory.ts`,
 * so importing `completion-park.ts` (which imports `_internal.js`) from there
 * would close a cycle: task-factory → completion-park → _internal →
 * task-factory. Keeping the rule here lets every caller share one definition
 * instead of repeating two `delete` statements in four places.
 *
 * `completion-park.ts` re-exports both functions, so existing importers are
 * unaffected.
 */
import type { KanbanTask } from '../types.js';

/**
 * Start the refusal budget over.
 *
 * Called when a card genuinely passes, and — this is the part that was
 * documented but never wired — from every path that materially re-scopes a
 * card. `verificationAttempts` only ever counted up, and nothing but a pass
 * reset it, so a card that parked stayed at or above its budget forever: the
 * next single refusal re-parked it immediately, no matter how thoroughly the
 * work had been fixed in between. A park earned against acceptance criteria
 * that no longer exist is a verdict about a card that no longer exists.
 *
 * Clearing the park without clearing the counter would be worse than leaving
 * both: the card would look live and re-park on its first refusal.
 */
export function clearGateRefusals(task: KanbanTask): void {
  delete task.verificationAttempts;
  delete task.park;
}

/** Whether retrying this card unchanged is known to be pointless. */
export function isParked(task: KanbanTask): boolean {
  return task.park !== undefined;
}
