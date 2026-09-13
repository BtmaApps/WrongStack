import { randomUUID } from 'node:crypto';
import type { Context } from '@wrongstack/core/agent';
import {
  addTask,
  assignTask,
  claimReadyTask,
  copyTaskToBoard,
  evaluateContractGraphReadiness,
  finalizeTaskCompletion,
  getBoard,
  getTask,
  getTaskChain,
  heartbeatTaskAssignment,
  mergeTasks,
  moveTask,
  recoverStaleTaskAssignments,
  releaseTaskClaim,
  removeTask,
  repairManagedTaskProjection,
  resolveAutoAccept,
  setTaskChain,
  stripLifecycleIssues,
  transferTaskToBoard,
  transitionTask,
  updateTask,
  updateTaskAssignment,
  verifyTaskCompletion,
} from '@wrongstack/kanban';
import { recordKanbanVerificationEvidence } from './kanban-evidence-bridge.js';
import { handleSplitTask } from './kanban-split-task-handler.js';
import { assignmentInput, taskInput, taskPatch } from './kanban-task-inputs.js';
import {
  atomicityNudge,
  conflict,
  invalidInput,
  notFound,
  okBoard,
  okTask,
  readEnvGateEnforcement,
  refused,
  resolveTaskRef,
  toKanbanToolError,
} from './kanban-tool-results.js';
import type { KanbanToolInput, KanbanToolOutput } from './kanban-tool-types.js';
import type { KanbanAgentAssignment } from '@wrongstack/kanban';
import { applySessionKanbanTaskToSource } from './session-kanban.js';

async function syncContextTask(
  ctx: Context,
  task: import('@wrongstack/kanban').KanbanTask | undefined,
  options: { remove?: boolean } = {},
): Promise<void> {
  if (!ctx?.state || !task) return;
  try {
    await applySessionKanbanTaskToSource(ctx, task, options);
  } catch {
    // best-effort sync
  }
}

/**
 * Undo the running assignment start_task wrote when the Running transition
 * that should follow it is refused, so a refusal leaves no live lease behind.
 * Fenced on the lease we just wrote. Returns a sentence describing anything
 * that could NOT be undone (for the error's "Already committed" note), or
 * undefined when the rollback was clean.
 */
async function rollbackStartedAssignment(
  projectRoot: string,
  boardId: string,
  taskId: string,
  prior: KanbanAgentAssignment | undefined,
  leaseId: string,
  eventContext: { sessionId: string; actor?: string },
): Promise<string | undefined> {
  try {
    const restored = prior
      ? await updateTaskAssignment(projectRoot, boardId, taskId, prior, {
          ...eventContext,
          expectedLeaseId: leaseId,
        })
      : await releaseTaskClaim(
          projectRoot,
          boardId,
          taskId,
          { clearAssignee: false, expectedLeaseId: leaseId },
          eventContext,
        );
    if (restored) return undefined;
    return `the running assignment (lease ${leaseId}) could not be rolled back — the lease changed or the task is gone; release it with release_task.`;
  } catch (err) {
    return `the running assignment (lease ${leaseId}) could not be rolled back (${
      err instanceof Error ? err.message : String(err)
    }); release it with release_task.`;
  }
}

function joinCommitted(...notes: Array<string | undefined>): string | undefined {
  const present = notes.filter((note): note is string => Boolean(note));
  return present.length ? present.join(' ') : undefined;
}

/** A null from a lease-fenced write means "task missing" OR "lease no longer ours". */
async function missingOrFenced(
  projectRoot: string,
  boardId: string,
  taskId: string,
  expectedLeaseId: string | undefined,
  what: string,
): Promise<never> {
  if (expectedLeaseId !== undefined && (await getTask(projectRoot, boardId, taskId))) {
    throw conflict(
      `${what}: the task's current lease no longer matches expectedLeaseId "${expectedLeaseId}" (it was recovered or reassigned). Nothing was written.`,
      { retryable: false },
    );
  }
  throw notFound(`${what}: task not found.`);
}

export async function handleKanbanLifecycleAction(
  projectRoot: string,
  input: KanbanToolInput,
  ctx: Context,
): Promise<KanbanToolOutput | undefined> {
  const eventContext = {
    sessionId: ctx.eventSessionId?.() ?? ctx.session?.id ?? 'default-session',
    ...(ctx.agentId !== undefined ? { actor: ctx.agentId } : {}),
  };
  switch (input.action) {
    case 'add_task': {
      if (!input.boardId || !input.title)
        throw invalidInput('add_task requires boardId and title.');
      const childTitles = input.childTitles;
      if (
        childTitles !== undefined &&
        (!Array.isArray(childTitles) ||
          childTitles.some((title) => typeof title !== 'string' || !title.trim()))
      ) {
        throw invalidInput('add_task childTitles must be non-blank strings.', 'childTitles');
      }
      const result = await addTask(projectRoot, input.boardId, taskInput(input), eventContext);
      if (!result) throw notFound('Board not found.');
      if (childTitles?.length) {
        let split: KanbanToolOutput;
        try {
          split = await handleSplitTask(
            projectRoot,
            { action: 'split_task', boardId: result.board.id, taskId: result.task.id, childTitles },
            {},
            eventContext,
          );
        } catch (err) {
          // Compensate: a parent whose requested children could not be created
          // is not what was asked for. Remove it rather than leave half a card.
          const removed = await removeTask(
            projectRoot,
            result.board.id,
            result.task.id,
            eventContext,
          ).catch(() => null);
          throw toKanbanToolError(
            err,
            removed
              ? undefined
              : `task ${result.task.id} was created but its children were not, and removing it failed; delete it with delete_task.`,
          );
        }
        const parent = split.task ?? result.task;
        await syncContextTask(ctx, parent);
        return {
          ok: true,
          message: `Task added with ${split.children?.length ?? 0} child task(s).${atomicityNudge(parent)}`,
          board: split.board ?? result.board,
          task: parent,
          children: split.children,
        };
      }
      await syncContextTask(ctx, result.task);
      return okTask(result.board, result.task, `Task added.${atomicityNudge(result.task)}`);
    }
    case 'split_task': {
      if (!input.boardId || !input.taskId || !input.childTitles?.length) {
        throw invalidInput('split_task requires boardId, taskId, and childTitles.');
      }
      return handleSplitTask(projectRoot, input, {}, eventContext);
    }
    case 'merge_tasks': {
      if (!input.boardId || !input.taskIds?.length || !input.title) {
        throw invalidInput('merge_tasks requires boardId, taskIds, and title.');
      }
      const result = await mergeTasks(
        projectRoot,
        input.boardId,
        {
          taskIds: input.taskIds,
          title: input.title,
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.targetColumnId !== undefined ? { targetColumnId: input.targetColumnId } : {}),
          ...(input.preserveAssignment !== undefined
            ? { preserveAssignment: input.preserveAssignment }
            : {}),
          ...(input.closeSourceTasks !== undefined
            ? { closeSourceTasks: input.closeSourceTasks }
            : {}),
        },
        eventContext,
      );
      if (!result) throw notFound('Board or task not found.');
      return okTask(result.board, result.task, 'Tasks merged.');
    }
    case 'copy_task': {
      if (!input.boardId || !input.taskId || !input.targetBoardId) {
        throw invalidInput('copy_task requires boardId, taskId, and targetBoardId.');
      }
      const result = await copyTaskToBoard(
        projectRoot,
        input.boardId,
        input.taskId,
        input.targetBoardId,
        {
          ...(input.targetColumnId !== undefined ? { targetColumnId: input.targetColumnId } : {}),
          ...(input.order !== undefined ? { targetOrder: input.order } : {}),
          ...(input.preserveAssignment !== undefined
            ? { preserveAssignment: input.preserveAssignment }
            : {}),
          ...(input.preserveDependencies !== undefined
            ? { preserveDependencies: input.preserveDependencies }
            : {}),
          eventContext,
        },
      );
      if (!result) throw notFound('Board or task not found.');
      return okTask(result.targetBoard, result.task, 'Task copied to target board.');
    }
    case 'transfer_task': {
      if (!input.boardId || !input.taskId || !input.targetBoardId) {
        throw invalidInput('transfer_task requires boardId, taskId, and targetBoardId.');
      }
      const result = await transferTaskToBoard(
        projectRoot,
        input.boardId,
        input.taskId,
        input.targetBoardId,
        {
          ...(input.targetColumnId !== undefined ? { targetColumnId: input.targetColumnId } : {}),
          ...(input.order !== undefined ? { targetOrder: input.order } : {}),
          ...(input.preserveAssignment !== undefined
            ? { preserveAssignment: input.preserveAssignment }
            : {}),
          ...(input.preserveDependencies !== undefined
            ? { preserveDependencies: input.preserveDependencies }
            : {}),
          eventContext,
        },
      );
      if (!result) throw notFound('Board or task not found.');
      return okTask(result.targetBoard, result.task, 'Task transferred to target board.');
    }
    case 'get_task': {
      if (!input.boardId || !input.taskId)
        throw invalidInput('get_task requires boardId and taskId.');
      const task = await getTask(projectRoot, input.boardId, input.taskId);
      if (!task) throw notFound('Task not found.');
      return { ok: true, message: 'Task loaded.', task };
    }
    case 'start_task': {
      if (!input.boardId || !input.taskId || !input.author || !input.transitionComment) {
        throw invalidInput('start_task requires boardId, taskId, author, and transitionComment.');
      }
      let board = await getBoard(projectRoot, input.boardId);
      if (!board) throw notFound('Board not found.');
      // Same id semantics as every other action: full id or unique prefix.
      let task = resolveTaskRef(board, input.taskId);
      if (!task) throw notFound('Task not found.');
      const readiness = evaluateContractGraphReadiness(board, task.id);
      if (!readiness.ready) {
        throw refused(
          `Task is not implementation-ready: ${readiness.issues.map((issue) => issue.message).join(' | ')}`,
        );
      }
      if (board.lifecycle?.mode !== 'managed') {
        const now = new Date();
        const assigned = await updateTaskAssignment(
          projectRoot,
          board.id,
          task.id,
          {
            status: 'running',
            agentId: input.agentId ?? input.author,
            leaseId: input.leaseId ?? randomUUID(),
            claimedAt: input.claimedAt ?? now.toISOString(),
            heartbeatAt: input.heartbeatAt ?? now.toISOString(),
            leaseExpiresAt:
              input.leaseExpiresAt ?? new Date(now.getTime() + 15 * 60_000).toISOString(),
            attempt: input.attempt ?? 1,
            maxAttempts: input.maxAttempts ?? 3,
          },
          eventContext,
        );
        if (!assigned) throw notFound('Task assignment could not be started: task not found.');
        const started = await updateTask(
          projectRoot,
          board.id,
          task.id,
          { status: 'in_progress' },
          eventContext,
        );
        const current = started ?? assigned;
        const claimed = task;
        const currentTask =
          current.tasks.find((candidate) => candidate.id === claimed.id) ?? claimed;
        ctx.setCurrentKanbanTask?.(currentTask.id, current.id);
        return okTask(
          current,
          currentTask,
          'Task is active and bound to this run for attribution. This board is not in managed lifecycle mode, so runtime Kanban governance was not bound to it.',
        );
      }
      let stage = task.lifecycle?.currentStage;
      let movedToTodo = false;
      if (stage === 'backlog') {
        const moved = await transitionTask(projectRoot, board.id, task.id, {
          to: 'todo',
          sessionId: eventContext.sessionId,
          actor: input.author,
          comment: input.transitionComment,
        });
        if (!moved) throw notFound('Task could not enter Todo: board or task not found.');
        movedToTodo = true;
        board = moved.board;
        task = moved.task;
        stage = task.lifecycle?.currentStage;
      }
      if (stage === 'todo' || stage === 'review') {
        const now = new Date();
        const leaseId = input.leaseId ?? randomUUID();
        const priorAssignment = task.assignment ? { ...task.assignment } : undefined;
        const todoNote = movedToTodo ? 'the card was moved Backlog → Todo.' : undefined;
        const assigned = await updateTaskAssignment(
          projectRoot,
          board.id,
          task.id,
          {
            status: 'running',
            agentId: input.agentId ?? input.author,
            leaseId,
            claimedAt: input.claimedAt ?? now.toISOString(),
            heartbeatAt: input.heartbeatAt ?? now.toISOString(),
            leaseExpiresAt:
              input.leaseExpiresAt ?? new Date(now.getTime() + 15 * 60_000).toISOString(),
            attempt: input.attempt ?? 1,
            maxAttempts: input.maxAttempts ?? 3,
          },
          eventContext,
        );
        if (!assigned) {
          throw notFound('Task assignment could not be started: task not found.', {
            committed: todoNote,
          });
        }
        const startedTaskId = task.id;
        const startedBoardId = board.id;
        let moved: Awaited<ReturnType<typeof transitionTask>>;
        try {
          moved = await transitionTask(projectRoot, startedBoardId, startedTaskId, {
            to: 'running',
            sessionId: eventContext.sessionId,
            actor: input.author,
            comment: input.transitionComment,
          });
        } catch (err) {
          const rollback = await rollbackStartedAssignment(
            projectRoot,
            startedBoardId,
            startedTaskId,
            priorAssignment,
            leaseId,
            eventContext,
          );
          throw toKanbanToolError(err, joinCommitted(todoNote, rollback));
        }
        if (!moved) {
          const rollback = await rollbackStartedAssignment(
            projectRoot,
            startedBoardId,
            startedTaskId,
            priorAssignment,
            leaseId,
            eventContext,
          );
          throw conflict('Task could not enter Running: the board or task disappeared.', {
            committed: joinCommitted(todoNote, rollback),
          });
        }
        board = moved.board;
        task = moved.task;
        stage = task.lifecycle?.currentStage;
      }
      if (stage !== 'running' || task.assignment?.status !== 'running') {
        throw refused(
          `start_task only accepts Backlog, Todo, Review repair, or live Running cards (current: ${stage ?? 'unknown'}).`,
          { committed: movedToTodo ? 'the card was moved Backlog → Todo.' : undefined },
        );
      }
      ctx.setCurrentKanbanTask?.(task.id, board.id);
      await syncContextTask(ctx, task);
      return okTask(
        board,
        task,
        'Task is active; runtime Kanban governance is now bound to this run.',
      );
    }
    case 'update_task': {
      if (!input.boardId || !input.taskId)
        throw invalidInput('update_task requires boardId and taskId.');
      const board = await updateTask(
        projectRoot,
        input.boardId,
        input.taskId,
        taskPatch(input),
        eventContext,
      );
      if (!board) throw notFound('Task not found.');
      await syncContextTask(ctx, resolveTaskRef(board, input.taskId));
      return okBoard(board, 'Task updated.');
    }
    case 'transition_task': {
      if (
        !input.boardId ||
        !input.taskId ||
        !input.lifecycleStage ||
        !input.author ||
        !input.transitionComment
      ) {
        throw invalidInput(
          'transition_task requires boardId, taskId, lifecycleStage, author, and transitionComment.',
        );
      }
      if (input.tickChecks?.length && input.lifecycleStage !== 'done') {
        throw invalidInput(
          `tickChecks only applies to transition_task with lifecycleStage "done" (got "${input.lifecycleStage}"). Tick criteria with update_check instead.`,
          'tickChecks',
        );
      }
      let preGateSaved = false;
      if (input.lifecycleStage === 'done') {
        const boardBefore = await getBoard(projectRoot, input.boardId);
        const taskBefore = boardBefore
          ? await getTask(projectRoot, input.boardId, input.taskId)
          : null;
        if (
          boardBefore &&
          taskBefore &&
          !taskBefore.verificationReport &&
          (taskBefore.atomic || Boolean(taskBefore.successCriteria?.length))
        ) {
          const preGate = await verifyTaskCompletion(projectRoot, input.boardId, taskBefore.id, {
            persist: false,
          });
          preGateSaved = Boolean(
            await updateTask(
              projectRoot,
              input.boardId,
              taskBefore.id,
              {
                verificationReport: preGate.report,
                successCriteria: preGate.task.successCriteria,
              },
              eventContext,
            ),
          );
        }
      }
      const preGateNote = preGateSaved
        ? 'the pre-gate verification report was saved on the card (evidence only; the card did not move).'
        : undefined;
      let result: Awaited<ReturnType<typeof transitionTask>>;
      try {
        result = await transitionTask(projectRoot, input.boardId, input.taskId, {
          to: input.lifecycleStage,
          sessionId: eventContext.sessionId,
          actor: input.author,
          comment: input.transitionComment,
          ...(input.transitionAction !== undefined ? { action: input.transitionAction } : {}),
          ...(input.tickChecks !== undefined ? { tickChecks: input.tickChecks } : {}),
          ...(input.attachmentUrl !== undefined
            ? {
                attachment: {
                  url: input.attachmentUrl,
                  type: input.attachmentType ?? 'url',
                  ...(input.attachmentTitle !== undefined ? { title: input.attachmentTitle } : {}),
                },
              }
            : {}),
          patch: taskPatch(input),
        });
      } catch (err) {
        throw toKanbanToolError(err, preGateNote);
      }
      if (!result) throw notFound('Board or task not found.', { committed: preGateNote });
      if (input.lifecycleStage === 'done' && result.task.verificationReport) {
        recordKanbanVerificationEvidence(ctx, result.task.verificationReport);
      }
      await syncContextTask(ctx, result.task);
      return okTask(result.board, result.task, `Task advanced to ${result.transition.to}.`);
    }
    case 'repair_managed_projection': {
      if (!input.boardId || !input.taskId || !input.author || !input.transitionComment) {
        throw invalidInput(
          'repair_managed_projection requires boardId, taskId, author, and transitionComment.',
        );
      }
      const result = await repairManagedTaskProjection(projectRoot, input.boardId, input.taskId, {
        actor: input.author,
        comment: input.transitionComment,
      });
      if (result?.task) {
        await syncContextTask(ctx, result.task);
      }
      if (!result) throw notFound('Board or task not found.');
      return okTask(
        result.board,
        result.task,
        'Managed card projection repaired from lifecycle history.',
      );
    }
    case 'move_task': {
      if (!input.boardId || !input.taskId || !input.targetColumnId) {
        throw invalidInput('move_task requires boardId, taskId, and targetColumnId.');
      }
      const board = await moveTask(
        projectRoot,
        input.boardId,
        input.taskId,
        input.targetColumnId,
        input.order,
        eventContext,
      );
      if (!board) throw notFound('Move failed: board or task not found.');
      await syncContextTask(ctx, resolveTaskRef(board, input.taskId));
      return okBoard(board, 'Task moved.');
    }
    case 'delete_task': {
      if (!input.boardId || !input.taskId)
        throw invalidInput('delete_task requires boardId and taskId.');
      const boardBefore = await getBoard(projectRoot, input.boardId);
      const taskToDelete = boardBefore ? resolveTaskRef(boardBefore, input.taskId) : undefined;
      const board = await removeTask(projectRoot, input.boardId, input.taskId, eventContext);
      if (board && taskToDelete && ctx.currentKanbanTaskId === taskToDelete.id) {
        ctx.setCurrentKanbanTask?.(undefined, ctx.currentKanbanBoardId);
      }
      if (board && taskToDelete) {
        await syncContextTask(ctx, taskToDelete, { remove: true });
      }
      if (!board) throw notFound('Task not found.');
      return okBoard(board, 'Task deleted.');
    }
    case 'set_chain': {
      if (!input.boardId || !input.taskIds?.length) {
        throw invalidInput('set_chain requires boardId and taskIds.');
      }
      const result = await setTaskChain(
        projectRoot,
        input.boardId,
        {
          taskIds: input.taskIds,
          ...(input.chainId !== undefined ? { chainId: input.chainId } : {}),
          ...(input.enforceDependencies !== undefined
            ? { enforceDependencies: input.enforceDependencies }
            : {}),
        },
        eventContext,
      );
      if (!result) throw notFound('Board or task not found.');
      return {
        ok: true,
        message: `Chain set: ${result.chainId}`,
        board: result.board,
        chain: result.tasks,
      };
    }
    case 'get_chain': {
      if (!input.boardId || !(input.taskId || input.chainId)) {
        throw invalidInput('get_chain requires boardId and taskId or chainId.');
      }
      const result = await getTaskChain(
        projectRoot,
        input.boardId,
        input.taskId ?? input.chainId ?? '',
      );
      if (!result) throw notFound('Chain not found.');
      return {
        ok: true,
        message: `Chain loaded: ${result.chainId}`,
        board: result.board,
        chain: result.tasks,
      };
    }
    case 'claim_task': {
      const result = await claimReadyTask(
        projectRoot,
        {
          ...(input.boardId !== undefined ? { boardId: input.boardId } : {}),
          ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
          ...assignmentInput(input),
          status: input.assignmentStatus ?? 'queued',
        },
        eventContext,
      );
      if (!result) {
        return { ok: true, claimed: false, message: 'No ready kanban task matched the claim.' };
      }
      return { ...okTask(result.board, result.task, 'Task claimed.'), claimed: true };
    }
    case 'release_task': {
      if (!input.boardId || !input.taskId) {
        throw invalidInput('release_task requires boardId and taskId.');
      }
      const board = await releaseTaskClaim(
        projectRoot,
        input.boardId,
        input.taskId,
        {
          ...(input.releaseStatus !== undefined ? { status: input.releaseStatus } : {}),
          ...(input.releaseReason !== undefined ? { reason: input.releaseReason } : {}),
          ...(input.clearAssignee !== undefined ? { clearAssignee: input.clearAssignee } : {}),
        },
        eventContext,
      );
      if (!board) throw notFound('Task not found.');
      return okBoard(board, 'Task claim released.');
    }
    case 'assign_task': {
      if (!input.boardId || !input.taskId)
        throw invalidInput('assign_task requires boardId and taskId.');
      const board = await assignTask(
        projectRoot,
        input.boardId,
        input.taskId,
        assignmentInput(input),
        eventContext,
      );
      if (!board) throw notFound('Task not found.');
      return okBoard(board, 'Task assigned.');
    }
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
    default:
      return undefined;
  }
}
