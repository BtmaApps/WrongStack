import type { Context } from '@wrongstack/core/agent';
import type { KanbanTask } from '@wrongstack/kanban';
import {
  assessTaskAtomicity,
  proposeTaskDecomposition,
  updateTask,
  verifyTaskCompletion,
} from '@wrongstack/kanban';
import { recordKanbanVerificationEvidence } from './kanban-evidence-bridge.js';
import { conflict, invalidInput, notFound, okTask } from './kanban-tool-results.js';
import type { KanbanToolInput, KanbanToolOutput } from './kanban-tool-types.js';

export async function handleKanbanDecompositionAction(
  projectRoot: string,
  input: KanbanToolInput,
  ctx: Context,
): Promise<KanbanToolOutput | undefined> {
  const eventContext = {
    sessionId: ctx.eventSessionId?.() ?? ctx.session?.id ?? 'default-session',
    ...(ctx.agentId !== undefined ? { actor: ctx.agentId } : {}),
  };
  switch (input.action) {
    case 'assess_atomicity': {
      if (!input.boardId || !input.taskId) {
        throw invalidInput('assess_atomicity requires boardId and taskId.');
      }
      const result = await assessTaskAtomicity(projectRoot, input.boardId, input.taskId, {
        assessedBy: 'agent',
        eventContext,
      });
      if (!result) throw notFound('Task not found.');
      const failing = result.assessment.criteria
        .filter((entry) => entry.score < 1)
        .map((entry) => entry.reason);
      const guidance =
        result.assessment.verdict === 'needs_decomposition'
          ? ` This task should be split before dispatch — call propose_decomposition with 2+ subtasks (each with one verifiable success criterion). Reasons: ${failing.join(' | ')}`
          : result.assessment.verdict === 'composite'
            ? ' Container task: work happens in its children; it is verified via subtask aggregation.'
            : '';
      return okTask(
        result.board,
        result.task,
        `Atomicity verdict: ${result.assessment.verdict} (score ${result.assessment.score}).${guidance}`,
      );
    }
    case 'propose_decomposition': {
      if (!input.boardId || !input.taskId || !input.subtasks?.length) {
        throw invalidInput('propose_decomposition requires boardId, taskId, and subtasks (2+).');
      }
      if (input.subtasks.length < 2) {
        throw invalidInput('propose_decomposition requires at least two subtasks.', 'subtasks');
      }
      const invalid = input.subtasks.find(
        (subtask) => typeof subtask?.title !== 'string' || !subtask.title.trim(),
      );
      if (invalid)
        throw invalidInput('Every proposed subtask needs a non-blank title.', 'subtasks');
      const result = await proposeTaskDecomposition(
        projectRoot,
        input.boardId,
        input.taskId,
        {
          subtasks: input.subtasks,
          ...(input.note !== undefined ? { rationale: input.note } : {}),
          ...(ctx.agentId !== undefined ? { proposedBy: ctx.agentId } : {}),
        },
        eventContext,
      );
      if (!result) throw notFound('Task not found.');
      const message =
        result.proposal.status === 'applied'
          ? `Decomposition applied: ${result.proposal.appliedChildTaskIds?.length ?? 0} child tasks created (parent marked atomic).`
          : 'Decomposition proposal recorded — awaiting approval (board policy is "propose"). It can be approved from the WebUI or via update_task.';
      return okTask(result.board, result.task, message);
    }
    case 'verify_completion': {
      if (!input.boardId || !input.taskId) {
        throw invalidInput('verify_completion requires boardId and taskId.');
      }
      let verResult: Awaited<ReturnType<typeof verifyTaskCompletion>>;
      try {
        // The report is persisted exactly once, by the updateTask below — one
        // revision, one event.
        verResult = await verifyTaskCompletion(projectRoot, input.boardId, input.taskId, {
          persist: false,
        });
      } catch (err) {
        if (err instanceof Error && /^(Board|Task) not found\b/.test(err.message)) {
          throw notFound(err.message, { cause: err });
        }
        throw err;
      }
      const persistedBoard = await updateTask(
        projectRoot,
        input.boardId,
        input.taskId,
        {
          verificationReport: verResult.report,
          successCriteria: verResult.task.successCriteria,
        },
        eventContext,
      );
      if (!persistedBoard) {
        throw conflict(
          `Verification ran (verdict: ${verResult.report.verdict}) but its report could not be saved: the task is no longer on the board. Nothing was written; re-run verify_completion.`,
          { retryable: true },
        );
      }
      recordKanbanVerificationEvidence(ctx, verResult.report);
      const freshTask = persistedBoard.tasks?.find((t: KanbanTask) => t.id === verResult.task.id);
      // The verdict (passed / failed / needs_human / incomplete) is a data
      // outcome of a verification that ran — it is returned, never thrown.
      return {
        ok: true,
        verdict: verResult.report.verdict,
        message: verResult.report.markdownSummary,
        board: persistedBoard,
        task: freshTask ?? verResult.task,
      };
    }
    default:
      return undefined;
  }
}
