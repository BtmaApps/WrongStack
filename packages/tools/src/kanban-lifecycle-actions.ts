import { randomUUID } from 'node:crypto';
import type { Context } from '@wrongstack/core/agent';
import {
  addTask,
  assignTask,
  claimReadyTask,
  copyTaskToBoard,
  evaluateContractGraphReadiness,
  getBoard,
  getTask,
  getTaskChain,
  mergeTasks,
  moveTask,
  releaseTaskClaim,
  removeTask,
  repairManagedTaskProjection,
  setTaskChain,
  transferTaskToBoard,
  transitionTask,
  updateTask,
  updateTaskAssignment,
  verifyTaskCompletion,
} from '@wrongstack/kanban';
import { handleKanbanAssignmentAction } from './kanban-assignment-actions.js';
import { recordKanbanVerificationEvidence } from './kanban-evidence-bridge.js';
import {
  joinCommitted,
  rollbackStartedAssignment,
  syncContextTask,
} from './kanban-lifecycle-helpers.js';
import { managementEventFence } from './kanban-management-guard.js';
import { handleSplitTask } from './kanban-split-task-handler.js';
import { assignmentInput, taskInput, taskPatch } from './kanban-task-inputs.js';
import {
  atomicityNudge,
  conflict,
  invalidInput,
  notFound,
  okBoard,
  okTask,
  refused,
  resolveTaskRef,
  toKanbanToolError,
} from './kanban-tool-results.js';
import type { KanbanToolInput, KanbanToolOutput } from './kanban-tool-types.js';

export async function handleKanbanLifecycleAction(
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
    case 'mark_assignment':
    case 'heartbeat_assignment':
    case 'recover_stale':
      return handleKanbanAssignmentAction(projectRoot, input, ctx, eventContext);

    default:
      return undefined;
  }
}
