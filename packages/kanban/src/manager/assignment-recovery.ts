import { randomUUID } from 'node:crypto';
import { mutateBoard } from '../storage.js';
import type { KanbanEvent, KanbanEventContext, KanbanRecoveryMode, KanbanTask } from '../types.js';
import type {
  RecoverStaleKanbanAssignmentsInput,
  RecoverStaleKanbanAssignmentsResult,
} from '../types-operations.js';
import { isAssignmentStale } from './assignment-staleness.js';
import { nowIso } from './basic-helpers.js';
import { createKanbanEvent, emitKanbanEvent } from './board-events.js';
import { transitionTask } from './lifecycle/task-transition.js';
import { isAssignmentHeartbeatDue, selectRecoveryMode } from './recovery.js';
import { syncTaskColumnForStatus } from './task-column-helpers.js';
import { areDependenciesMet } from './task-readiness.js';

export { isAssignmentStale, STAMPLESS_ASSIGNMENT_STALE_MS } from './assignment-staleness.js';

export async function recoverStaleTaskAssignments(
  projectRoot: string,
  boardId: string,
  input: RecoverStaleKanbanAssignmentsInput = {},
  eventContext: KanbanEventContext,
): Promise<RecoverStaleKanbanAssignmentsResult | null> {
  const recoveredTasks: KanbanTask[] = [];
  const events: KanbanEvent[] = [];
  /**
   * Managed cards whose lifecycle stage must be walked back after the board
   * mutation commits. The recovery below clears the assignment but leaves the
   * stage alone (the stage is authoritative on a managed board and a raw
   * status→column sync would corrupt it). That left the card in Running with
   * no assignment — which `classifyTaskForQueue` reads as `running_no_lease`,
   * i.e. NOT claimable. The card was recovered into a state nothing could pick
   * up again without a human running repair_managed_projection.
   *
   * `transitionTask` is itself a `mutateBoard` call and cannot be nested inside
   * this closure, so the ids are collected here and walked back afterwards —
   * the same sequential shape `completeKanbanDispatch` uses in dispatch.ts.
   *
   * Related: on a managed board the release/retry branches below clear
   * `assignedAgent` but keep `assignee`. `assignee` is a REQUIRED card detail
   * there — `validateRequiredCardDetails` demands it before Todo → Running —
   * so deleting it walked the card back into a Todo it could never leave.
   * (What survives is whatever last claimed the card: `assignTask` overwrites
   * `assignee` with the worker's name when the caller does not pass one. That
   * conflation of owner and worker predates this code; the point here is only
   * that a required field must not be emptied by recovery.) On a legacy board
   * `assignee` is purely the worker record, so there it is still cleared.
   */
  const managedNeedingRequeue: Array<{ taskId: string; mode: KanbanRecoveryMode }> = [];
  const requestedMode = input.mode ?? 'retry';
  const checkedAt = input.now ?? nowIso();
  const updated = await mutateBoard(projectRoot, boardId, (board) => {
    const isManaged = board.lifecycle?.mode === 'managed';
    for (const task of board.tasks) {
      const assignment = task.assignment;
      // A task with no assignment is never stale (`isAssignmentStale` returns
      // false for undefined), so skip it explicitly and narrow `assignment`
      // before the stale check and every use below. Without this, every
      // `assignment.…` below is `KanbanAgentAssignment | undefined` and the
      // declaration emit fails.
      if (!assignment) continue;
      if (!isAssignmentStale(assignment, checkedAt)) continue;
      const previousColumnId = task.columnId;
      const beforeAssignment = { ...assignment };
      const isHeartbeatDueNow = isAssignmentHeartbeatDue(assignment, checkedAt);
      const mode = selectRecoveryMode({
        requested: requestedMode,
        task,
        isHeartbeatDue: isHeartbeatDueNow,
        policy: input.policy,
      });
      const reason = input.reason ?? `Stale assignment recovered at ${checkedAt}`;
      const now = nowIso();
      task.notes = [
        ...(task.notes ?? []),
        {
          id: randomUUID(),
          author: 'system',
          content: `Stale assignment recovered (${mode}): ${reason}`,
          createdAt: now,
        },
      ];

      if (mode === 'fail') {
        assignment.status = 'failed';
        assignment.error = reason;
        delete assignment.completedAt;
        // Managed boards: preserve lifecycle stage. Only the assignment
        // status changes — the card's lifecycle column is authoritative and
        // must not be overridden by a raw status→column sync. A reviewer
        // or repair_managed_projection can correct the stage if needed.
        if (!isManaged) task.status = 'failed';
        delete task.completedAt;
      } else if (mode === 'release') {
        delete task.assignment;
        if (input.clearAssignee !== false) {
          delete task.assignedAgent;
          if (!isManaged) delete task.assignee;
        }
        // Managed boards: keep the card in its current lifecycle stage
        // (e.g. 'running'). The lifecycle transition todo→running is
        // irreversible on managed boards — releasing a claim does not move
        // the card backward. Use repair_managed_projection or manual
        // transition to correct the stage if rollback is desired.
        if (!isManaged) {
          task.status = areDependenciesMet(board, task.id) ? 'ready' : 'blocked';
        }
        delete task.completedAt;
      } else {
        const nextAttempt = (assignment.attempt ?? 0) + 1;
        if (assignment.maxAttempts !== undefined && nextAttempt > assignment.maxAttempts) {
          assignment.status = 'failed';
          assignment.error = `${reason}; max attempts exceeded (${assignment.maxAttempts})`;
          delete assignment.completedAt;
          if (!isManaged) task.status = 'failed';
          delete task.completedAt;
        } else {
          task.assignment = {
            ...assignment,
            status: 'assigned',
            attempt: nextAttempt,
          };
          delete task.assignment.subagentId;
          delete task.assignment.runTaskId;
          delete task.assignment.completedAt;
          delete task.assignment.lastResult;
          delete task.assignment.error;
          delete task.assignment.leaseId;
          delete task.assignment.heartbeatAt;
          delete task.assignment.leaseExpiresAt;
          // The dead agent no longer owns this task. Keeping its agentId
          // made the retried record look OWNED, and an owned 'assigned'
          // assignment blocks claiming (isTaskReadyForWork) — the retry
          // would strand. Dropping the identity turns it into the same
          // ownerless configuration template assignTask-without-agentId
          // produces: routing/skills survive, the next claimer fills in
          // its own identity.
          delete task.assignment.agentId;
          if (input.clearAssignee !== false) {
            delete task.assignedAgent;
            if (!isManaged) delete task.assignee;
          }
          // Managed boards: retry keeps the card in its current lifecycle
          // stage. The task is re-queued for dispatch but does not move
          // backward in the lifecycle.
          if (!isManaged) {
            task.status = areDependenciesMet(board, task.id) ? 'ready' : 'blocked';
          }
          delete task.completedAt;
        }
      }

      // Only sync column for non-managed boards. Managed boards have
      // lifecycle-authoritative columns that must not be overridden by
      // status-based projection.
      if (!isManaged) {
        syncTaskColumnForStatus(board, task, previousColumnId);
      }
      task.updatedAt = now;
      board.updatedAt = now;
      board.lastStaleRecoveredAt = now;
      // Only a card sitting in Running needs walking back, and only when the
      // work is actually going to be attempted again. Read that from the state
      // the branches above just produced, not from the requested mode: `retry`
      // with an exhausted budget lands in exactly the same terminal `failed`
      // state as `fail`, and keying on the mode walked those cards back to Todo
      // — straight into the next claimer, which fails them again. A loop.
      //
      // Claimable-again means: the assignment was released (gone), or it was
      // re-queued for another attempt ('assigned'). Anything else stays in
      // Running for a human.
      const requeueable = task.assignment === undefined || task.assignment.status === 'assigned';
      if (isManaged && requeueable && task.lifecycle?.currentStage === 'running') {
        managedNeedingRequeue.push({ taskId: task.id, mode });
      }
      recoveredTasks.push({
        ...task,
        assignment: task.assignment ? { ...task.assignment } : undefined,
      });
      events.push(
        createKanbanEvent(board.id, task, 'task.stale_recovered', {
          ...eventContext,
          before: beforeAssignment,
          after: task.assignment ? { ...task.assignment } : undefined,
          note: reason,
        }),
      );
    }
    return recoveredTasks.length ? recoveredTasks : null;
  });
  if (updated) {
    for (const staleEvent of events) await emitKanbanEvent(projectRoot, staleEvent);
  }
  if (!updated?.result) return null;

  // Walk recovered managed cards back to Todo so the queue can serve them
  // again. Running → Todo is a legal single step backwards, and backward
  // transitions skip the card-detail guard, so this cannot fail on a card that
  // was already good enough to be dispatched. Best-effort: the recovery itself
  // has already committed, and a failed walk-back leaves exactly the state that
  // existed before this fix — recoverable with repair_managed_projection.
  let board = updated.board;
  for (const { taskId, mode } of managedNeedingRequeue) {
    try {
      const walked = await transitionTask(projectRoot, boardId, taskId, {
        to: 'todo',
        sessionId: eventContext.sessionId,
        actor: 'kanban-supervisor',
        comment: `Stale assignment recovered (${mode}); card returned to the work queue.`,
      });
      if (walked) board = walked.board;
    } catch (error) {
      process.stderr.write(
        `[kanban] recoverStaleTaskAssignments: could not return task ${taskId} to Todo: ` +
          `${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }
  return { board, tasks: updated.result };
}
