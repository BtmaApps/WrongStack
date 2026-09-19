import type { Context } from '@wrongstack/core/agent';
import type { KanbanTask } from '@wrongstack/kanban';
import {
  assessTaskAtomicity,
  proposeTaskDecomposition,
  resolveDecompositionProposal,
  updateTask,
  verifyTaskCompletion,
} from '@wrongstack/kanban';
import { recordKanbanVerificationEvidence } from './kanban-evidence-bridge.js';
import { managementEventFence } from './kanban-management-guard.js';
import { conflict, invalidInput, notFound, okTask } from './kanban-tool-results.js';
import type { KanbanToolInput, KanbanToolOutput } from './kanban-tool-types.js';

export async function handleKanbanDecompositionAction(
  projectRoot: string,
  input: KanbanToolInput,
  ctx: Context,
): Promise<KanbanToolOutput | undefined> {
  const eventContext = {
    ...managementEventFence(ctx),
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
          : `Decomposition proposal ${result.proposal.id} recorded — awaiting approval (board policy is "propose"). Resolve it with approve_decomposition (or reject_decomposition) and proposalId "${result.proposal.id}"; approving is what actually creates the child cards.`;
      return okTask(result.board, result.task, message);
    }
    // Approving is a three-phase operation: mark the proposal, create the
    // children, then stamp `applied` with their ids. The old message here sent
    // the caller to the WebUI (unreachable for an agent) or to `update_task`,
    // which writes `task.decomposition` verbatim — recording an approval while
    // skipping the phase that creates the children, and hiding the card from
    // the pending-approval queue (it keys on status === 'proposed'). The result
    // was a card marked approved with nothing split. This is the real path.
    case 'approve_decomposition':
    case 'reject_decomposition': {
      if (!input.boardId || !input.taskId || !input.proposalId) {
        throw invalidInput(`${input.action} requires boardId, taskId, and proposalId.`);
      }
      const approve = input.action === 'approve_decomposition';
      if (!approve && input.subtasks?.length) {
        throw invalidInput(
          'subtasks are edits to a proposal being approved; a rejection takes only a note.',
          'subtasks',
        );
      }
      const resolved = await resolveDecompositionProposal(
        projectRoot,
        input.boardId,
        input.taskId,
        input.proposalId,
        {
          action: approve ? 'approve' : 'reject',
          ...(input.note !== undefined ? { reason: input.note } : {}),
          ...(approve && input.subtasks?.length ? { editedSubtasks: input.subtasks } : {}),
          ...(ctx.agentId !== undefined ? { resolvedBy: ctx.agentId } : {}),
        },
        eventContext,
      );
      // `null` covers both "no such proposal" and "already resolved" — the
      // proposal is only resolvable from the 'proposed' state.
      if (!resolved) {
        throw notFound(
          `No open decomposition proposal ${input.proposalId} on this task (it may already be resolved).`,
        );
      }
      const childCount = resolved.proposal.appliedChildTaskIds?.length ?? 0;
      return okTask(
        resolved.board,
        resolved.task,
        approve
          ? `Decomposition applied: ${childCount} child card(s) created; the parent is now a container verified through them.`
          : 'Decomposition proposal rejected; the card keeps its current shape.',
      );
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
