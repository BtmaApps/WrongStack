import type { Context } from '@wrongstack/core/agent';

import {
  finalizeTaskCompletion,
  getBoard,
  heartbeatTaskAssignment,
  recoverStaleTaskAssignments,
  resolveAutoAccept,
  stripLifecycleIssues,
  transitionTask,
  updateTask,
  updateTaskAssignment,
  verifyTaskCompletion,
} from '@wrongstack/kanban';

import { recordKanbanVerificationEvidence } from './kanban-evidence-bridge.js';

import type { managementEventFence } from './kanban-management-guard.js';

import {
  invalidInput,
  notFound,
  okBoard,
  okTask,
  readEnvGateEnforcement,
} from './kanban-tool-results.js';

import type { KanbanToolInput, KanbanToolOutput } from './kanban-tool-types.js';

export async function handleKanbanAssignmentAction(
  projectRoot: string,
  input: KanbanToolInput,
  ctx: Context,
  eventContext: ReturnType<typeof managementEventFence> & {
    sessionId: string;
    actor?: string | undefined;
  },
): Promise<KanbanToolOutput | undefined> {
  switch (input.action) {
    case 'mark_assignment': {
      if (!input.boardId || !input.taskId)
        throw invalidInput('mark_assignment requires boardId and taskId.');
      const assignmentStatus =
        input.assignmentStatus ??
        (input.status === 'completed' ? 'completed' : input.error ? 'failed' : undefined);
      const board = await updateTaskAssignment(
        projectRoot,
        input.boardId,
        input.taskId,
        {
          ...(assignmentStatus !== undefined ? { status: assignmentStatus } : {}),
          ...(input.subagentId !== undefined ? { subagentId: input.subagentId } : {}),
          ...(input.runTaskId !== undefined ? { runTaskId: input.runTaskId } : {}),
          ...(input.lastResult !== undefined ? { lastResult: input.lastResult } : {}),
          ...(input.error !== undefined ? { error: input.error } : {}),
          ...(input.agentId !== undefined ? { agentId: input.agentId } : {}),
          ...(input.leaseId !== undefined ? { leaseId: input.leaseId } : {}),
          ...(input.claimedAt !== undefined ? { claimedAt: input.claimedAt } : {}),
          ...(input.heartbeatAt !== undefined ? { heartbeatAt: input.heartbeatAt } : {}),
          ...(input.leaseExpiresAt !== undefined ? { leaseExpiresAt: input.leaseExpiresAt } : {}),
          ...(input.attempt !== undefined ? { attempt: input.attempt } : {}),
          ...(input.maxAttempts !== undefined ? { maxAttempts: input.maxAttempts } : {}),
        },
        {
          ...eventContext,
          ...(input.expectedLeaseId !== undefined
            ? { expectedLeaseId: input.expectedLeaseId }
            : {}),
        },
      );
      if (!board) {
        return missingOrFenced(
          projectRoot,
          input.boardId,
          input.taskId,
          input.expectedLeaseId,
          'Assignment not updated',
        );
      }

      if (assignmentStatus === 'completed' && board.lifecycle?.mode !== 'managed') {
        const envGate = readEnvGateEnforcement();
        const finalized = await finalizeTaskCompletion(projectRoot, board.id, input.taskId, {
          ...(board.completionGate === undefined && envGate !== undefined
            ? { enforcement: envGate }
            : {}),
          eventContext,
        });
        if (finalized) {
          if (finalized.gate.report) {
            recordKanbanVerificationEvidence(ctx, finalized.gate.report);
          }
          const gateSummary = {
            enforcement: finalized.gate.enforcement,
            allowed: finalized.gate.allowed,
            verdict: finalized.gate.verdict,
            issues: finalized.gate.issues.map((issue) => issue.message),
          };
          const gateMessage = finalized.gate.allowed
            ? `Completion gate ${finalized.gate.verdict === 'skipped' ? 'passed' : 'passed'}; task completed.`
            : finalized.gate.enforcement === 'strict'
              ? `Completion gate BLOCKED (verdict: ${finalized.gate.verdict}); task parked in review. Issues: ${gateSummary.issues.join(' | ')}`
              : `Completion gate failed softly (verdict: ${finalized.gate.verdict}); task completed with warnings. Issues: ${gateSummary.issues.join(' | ')}`;
          await syncContextTask(ctx, finalized.task);
          return {
            ...okTask(finalized.board, finalized.task, `Assignment updated. ${gateMessage}`),
            gate: gateSummary,
          };
        }
      } else if (board.lifecycle?.mode === 'managed') {
        const managedTask = board.tasks.find((candidate) => candidate.id === input.taskId);
        const stage = managedTask?.lifecycle?.currentStage;
        const actor = ctx.agentId ?? 'kanban-agent';
        let transitionResult: Awaited<ReturnType<typeof transitionTask>> = null;
        const lifecycleWarnings: string[] = [];

        if (assignmentStatus === 'running' && stage === 'todo') {
          try {
            transitionResult = await transitionTask(projectRoot, board.id, input.taskId, {
              to: 'running',
              sessionId: eventContext.sessionId,
              actor,
              comment: 'Work started.',
            });
          } catch (err: unknown) {
            lifecycleWarnings.push(
              `Lifecycle transition to Running deferred: ${stripLifecycleIssues(err instanceof Error ? err.message : String(err))}`,
            );
          }
        }
        if (assignmentStatus === 'completed' && stage === 'running') {
          const comment =
            typeof input.lastResult === 'string' && input.lastResult.trim().length > 0
              ? input.lastResult.trim().slice(0, 1000)
              : 'Work completed.';
          try {
            transitionResult = await transitionTask(projectRoot, board.id, input.taskId, {
              to: 'review',
              sessionId: eventContext.sessionId,
              actor,
              comment,
              attachment: {
                url: `kanban://task/${input.taskId}/result`,
                title: 'Worker completion result',
                type: 'file',
              },
              patch: {
                ...(input.agentId !== undefined ? { assignedAgent: input.agentId } : {}),
              },
            });
          } catch (err: unknown) {
            lifecycleWarnings.push(
              `Lifecycle transition to Review failed: ${stripLifecycleIssues(err instanceof Error ? err.message : String(err))}`,
            );
          }

          if (transitionResult) {
            const hasCriteria =
              (transitionResult.task.successCriteria?.length ?? 0) > 0 ||
              transitionResult.task.atomic === true;

            if (hasCriteria) {
              try {
                const verResult = await verifyTaskCompletion(projectRoot, board.id, input.taskId, {
                  persist: false,
                });
                if (verResult.report) {
                  recordKanbanVerificationEvidence(ctx, verResult.report);
                }
                await updateTask(
                  projectRoot,
                  board.id,
                  input.taskId,
                  {
                    verificationReport: verResult.report,
                    successCriteria: verResult.task.successCriteria,
                  },
                  eventContext,
                );

                const verdict = verResult.report.verdict;
                if (verdict === 'passed' && !resolveAutoAccept(board)) {
                  lifecycleWarnings.push(
                    'Verification passed, but this board does not auto-accept. ' +
                      'The card is in Review awaiting an explicit transition_task to done.',
                  );
                } else if (verdict === 'passed') {
                  try {
                    const doneResult = await transitionTask(projectRoot, board.id, input.taskId, {
                      to: 'done',
                      sessionId: eventContext.sessionId,
                      actor,
                      action: 'Automated acceptance after verification',
                      comment: 'Auto-accepted: verification passed.',
                      attachment: {
                        url: `kanban://task/${input.taskId}/verification`,
                        title: 'Auto-verification result',
                        type: 'file',
                      },
                    });
                    transitionResult = doneResult;
                  } catch (acceptErr: unknown) {
                    lifecycleWarnings.push(
                      `Auto-accept to Done deferred: ${acceptErr instanceof Error ? acceptErr.message : String(acceptErr)}`,
                    );
                  }
                } else {
                  lifecycleWarnings.push(
                    `Verification verdict: ${verdict} — card left in Review for manual acceptance.`,
                  );
                }
              } catch (verifyErr: unknown) {
                lifecycleWarnings.push(
                  `Auto-verification error: ${verifyErr instanceof Error ? verifyErr.message : String(verifyErr)}`,
                );
              }
            } else {
              lifecycleWarnings.push(
                'No automatic success criteria — card left in Review for manual verification.',
              );
            }
          }
        }

        const responseBoard = transitionResult?.board ?? board;
        const responseTask = transitionResult?.task ?? managedTask!;
        const msgParts = ['Assignment updated.'];
        if (transitionResult) {
          msgParts.push(`Card advanced to ${transitionResult.transition.to}.`);
        }
        for (const w of lifecycleWarnings) msgParts.push(`Warning: ${w}`);
        await syncContextTask(ctx, responseTask);
        return okTask(responseBoard, responseTask, msgParts.join(' '));
      }
      return okBoard(board, 'Assignment updated.');
    }
    case 'heartbeat_assignment': {
      if (!input.boardId || !input.taskId) {
        throw invalidInput('heartbeat_assignment requires boardId and taskId.');
      }
      const board = await heartbeatTaskAssignment(
        projectRoot,
        input.boardId,
        input.taskId,
        {
          ...(input.heartbeatAt !== undefined ? { heartbeatAt: input.heartbeatAt } : {}),
          ...(input.leaseExpiresAt !== undefined ? { leaseExpiresAt: input.leaseExpiresAt } : {}),
          ...(input.expectedLeaseId !== undefined
            ? { expectedLeaseId: input.expectedLeaseId }
            : {}),
        },
        eventContext,
      );
      if (!board) {
        return missingOrFenced(
          projectRoot,
          input.boardId,
          input.taskId,
          input.expectedLeaseId,
          'Heartbeat not recorded',
        );
      }
      return okBoard(board, 'Assignment heartbeat updated.');
    }
    case 'recover_stale': {
      if (!input.boardId) throw invalidInput('recover_stale requires boardId.');
      const policyFields = [
        input.recoveryPolicyFailOnCostCeiling !== undefined,
        input.recoveryPolicyReleaseOnFailureKinds !== undefined,
        input.recoveryPolicyReleaseOnHeartbeatDue !== undefined,
        input.recoveryPolicyRetryPolicyOverride !== undefined,
      ].some(Boolean);
      const result = await recoverStaleTaskAssignments(
        projectRoot,
        input.boardId,
        {
          ...(input.recoveryMode !== undefined ? { mode: input.recoveryMode } : {}),
          ...(input.recoveryNow !== undefined ? { now: input.recoveryNow } : {}),
          ...(input.releaseReason !== undefined ? { reason: input.releaseReason } : {}),
          ...(input.clearAssignee !== undefined ? { clearAssignee: input.clearAssignee } : {}),
          ...(policyFields
            ? {
                policy: {
                  ...(input.recoveryPolicyFailOnCostCeiling !== undefined
                    ? { failWhenCostCeilingSet: input.recoveryPolicyFailOnCostCeiling }
                    : {}),
                  ...(input.recoveryPolicyReleaseOnFailureKinds !== undefined
                    ? {
                        releaseOnFailureKinds: input.recoveryPolicyReleaseOnFailureKinds,
                      }
                    : {}),
                  ...(input.recoveryPolicyReleaseOnHeartbeatDue !== undefined
                    ? {
                        releaseOnHeartbeatDue: input.recoveryPolicyReleaseOnHeartbeatDue,
                      }
                    : {}),
                  ...(input.recoveryPolicyRetryPolicyOverride !== undefined
                    ? {
                        retryPolicyOverride: input.recoveryPolicyRetryPolicyOverride,
                      }
                    : {}),
                },
              }
            : {}),
        },
        eventContext,
      );
      if (!result) {
        // The domain answers null both for "no such board" and "nothing stale".
        if (!(await getBoard(projectRoot, input.boardId))) throw notFound('Board not found.');
        return { ok: true, message: 'No stale assignment matched.', recoveredTasks: [] };
      }
      return {
        ok: true,
        message: `Recovered ${result.tasks.length} stale assignment(s).`,
        board: result.board,
        recoveredTasks: result.tasks,
      };
    }
  }

  return undefined;
}

import { missingOrFenced, syncContextTask } from './kanban-lifecycle-helpers.js';
