import type { KanbanBoard, KanbanTask } from '../../types.js';
import { taskInputFingerprint } from '../../verification/task-inputs.js';
import { KanbanLifecycleError } from '../lifecycle-error.js';
import { validateDefinitionOfDone } from './definition-of-done.js';

/** Done is an accepted contract. Rescoping requires a new follow-up card. */
export function assertAcceptedContractUnchanged(
  board: KanbanBoard,
  before: KanbanTask,
  after: KanbanTask,
): void {
  if (board.lifecycle?.mode !== 'managed' || before.lifecycle?.currentStage !== 'done') return;
  const outcomes = (task: KanbanTask) =>
    (task.successCriteria ?? []).map((check) => [check.id, check.status]);
  if (
    taskInputFingerprint(before) === taskInputFingerprint(after) &&
    JSON.stringify(outcomes(before)) === JSON.stringify(outcomes(after)) &&
    (after.verificationReport === before.verificationReport ||
      JSON.stringify(after.verificationReport) === JSON.stringify(before.verificationReport) ||
      (after.verificationReport !== undefined &&
        validateDefinitionOfDone(after, after.verificationReport, { board, requireCriteria: false })
          .length === 0))
  )
    return;
  throw new KanbanLifecycleError(
    'Done acceptance contract is immutable; create a follow-up card for changed work.',
    [
      {
        code: 'transition-skipped',
        field: 'successCriteria',
        message: 'Done acceptance contract is immutable; create a follow-up card for changed work.',
      },
    ],
  );
}
