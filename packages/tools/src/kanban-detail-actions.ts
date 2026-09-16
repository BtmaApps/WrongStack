import type { Context } from '@wrongstack/core/agent';
import {
  addCheckToTask,
  addDependency,
  addGoalMetricToTask,
  addLinkToTask,
  addNoteToTask,
  getKanbanWorkbench,
  recordTaskActivity,
  removeCheckFromTask,
  updateCheckOnTask,
  updateGoalMetricOnTask,
} from '@wrongstack/kanban';
import { handleSplitTask } from './kanban-split-task-handler.js';
import { invalidInput, notFound, okBoard } from './kanban-tool-results.js';
import type { KanbanToolInput, KanbanToolOutput } from './kanban-tool-types.js';

export async function handleKanbanDetailAction(
  projectRoot: string,
  input: KanbanToolInput,
  ctx: Context,
): Promise<KanbanToolOutput | undefined> {
  const eventContext = {
    sessionId: ctx.eventSessionId?.() ?? ctx.session?.id ?? 'default-session',
    ...(ctx.agentId !== undefined ? { actor: ctx.agentId } : {}),
  };
  switch (input.action) {
    case 'workbench': {
      const workbench = await getKanbanWorkbench(projectRoot, {
        ...(input.limit !== undefined
          ? { limitPerLane: input.limit, alertLimit: input.limit }
          : {}),
      });
      return {
        ok: true,
        message: `${workbench.totals.now} now, ${workbench.totals.next} next, ${workbench.totals.blocked} blocked, ${workbench.totals.review} review; ${workbench.alertTotal} alert(s).`,
        workbench,
      };
    }
    case 'add_dependency': {
      if (!input.boardId || !input.taskId || !input.dependencyTaskId) {
        throw invalidInput('add_dependency requires boardId, taskId, and dependencyTaskId.');
      }
      const board = await addDependency(
        projectRoot,
        input.boardId,
        input.taskId,
        input.dependencyTaskId,
        eventContext,
      );
      if (!board) throw notFound('Task not found.');
      return okBoard(board, 'Dependency added.');
    }
    case 'add_goal_metric': {
      if (!input.boardId || !input.taskId || !input.metricName) {
        throw invalidInput('add_goal_metric requires boardId, taskId, and metricName.');
      }
      const board = await addGoalMetricToTask(
        projectRoot,
        input.boardId,
        input.taskId,
        {
          name: input.metricName,
          ...(input.metricStatus !== undefined ? { status: input.metricStatus } : {}),
          ...(input.metricTarget !== undefined ? { target: input.metricTarget } : {}),
          ...(input.metricCurrent !== undefined ? { current: input.metricCurrent } : {}),
          ...(input.metricDirection !== undefined ? { direction: input.metricDirection } : {}),
          ...(input.metricUnit !== undefined ? { unit: input.metricUnit } : {}),
          ...(input.metricNotes !== undefined ? { notes: input.metricNotes } : {}),
        },
        eventContext,
      );
      if (!board) throw notFound('Task not found.');
      return okBoard(board, 'Goal metric added.');
    }
    case 'update_goal_metric': {
      if (!input.boardId || !input.taskId || !input.metricId) {
        throw invalidInput('update_goal_metric requires boardId, taskId, and metricId.');
      }
      const board = await updateGoalMetricOnTask(
        projectRoot,
        input.boardId,
        input.taskId,
        input.metricId,
        {
          ...(input.metricName !== undefined ? { name: input.metricName } : {}),
          ...(input.metricStatus !== undefined ? { status: input.metricStatus } : {}),
          ...(input.metricTarget !== undefined ? { target: input.metricTarget } : {}),
          ...(input.metricCurrent !== undefined ? { current: input.metricCurrent } : {}),
          ...(input.metricDirection !== undefined ? { direction: input.metricDirection } : {}),
          ...(input.metricUnit !== undefined ? { unit: input.metricUnit } : {}),
          ...(input.metricNotes !== undefined ? { notes: input.metricNotes } : {}),
        },
        eventContext,
      );
      if (!board) throw notFound('Metric not found.');
      return okBoard(board, 'Goal metric updated.');
    }
    case 'add_check': {
      if (!input.boardId || !input.taskId || !input.checkDescription) {
        throw invalidInput('add_check requires boardId, taskId, and checkDescription.');
      }
      // `manual` is the fallback, not the only option — see the note in
      // kanban-task-inputs.ts on why hard-coding it made every agent-authored
      // criterion unverifiable.
      const board = await addCheckToTask(
        projectRoot,
        input.boardId,
        input.taskId,
        {
          description: input.checkDescription,
          type: input.checkType ?? 'manual',
          status: input.checkStatus,
          ...(input.checkNotes !== undefined ? { notes: input.checkNotes } : {}),
        },
        eventContext,
      );
      if (!board) throw notFound('Task not found.');
      return okBoard(board, 'Check added.');
    }
    case 'update_check': {
      if (!input.boardId || !input.taskId || !input.checkId) {
        throw invalidInput('update_check requires boardId, taskId, and checkId.');
      }
      const board = await updateCheckOnTask(
        projectRoot,
        input.boardId,
        input.taskId,
        input.checkId,
        {
          ...(input.checkDescription !== undefined ? { description: input.checkDescription } : {}),
          ...(input.checkStatus !== undefined ? { status: input.checkStatus } : {}),
          // Promoting an existing manual criterion to an executable one is the
          // common repair: the card was written before anyone knew the command.
          ...(input.checkType !== undefined ? { type: input.checkType } : {}),
          ...(input.checkNotes !== undefined ? { notes: input.checkNotes } : {}),
        },
        eventContext,
      );
      if (!board) throw notFound('Check not found.');
      return okBoard(board, 'Check updated.');
    }
    case 'remove_check': {
      if (!input.boardId || !input.taskId || !input.checkId) {
        throw invalidInput('remove_check requires boardId, taskId, and checkId.');
      }
      // The truthful way out of a criterion that turned out not to apply.
      // Done refuses to advance while any criterion is not `passed`, so
      // without this the only alternatives were marking it passed — a lie —
      // or leaving the card parked forever.
      const board = await removeCheckFromTask(
        projectRoot,
        input.boardId,
        input.taskId,
        input.checkId,
        eventContext,
      );
      if (!board) throw notFound('Check not found on this task.');
      return okBoard(board, 'Acceptance criterion removed.');
    }
    case 'record_activity': {
      // The WebUI could write this (kanban.task.activity.add) and the agent
      // could not — so the durable "what was attempted and how it went" record
      // on a card was only ever populated by a human watching the board.
      // Unlike add_note (a comment on the card) this appends a typed
      // `task.activity.<kind>` event to the card's activity stream and does not
      // change the card's content.
      if (!input.boardId || !input.taskId || !input.activityKind || !input.note) {
        throw invalidInput(
          'record_activity requires boardId, taskId, activityKind, and note (the one-line summary).',
        );
      }
      const board = await recordTaskActivity(
        projectRoot,
        input.boardId,
        input.taskId,
        {
          kind: input.activityKind,
          summary: input.note,
          ...(input.activityOutcome !== undefined ? { outcome: input.activityOutcome } : {}),
          ...(input.activityDetails !== undefined ? { details: input.activityDetails } : {}),
        },
        eventContext,
      );
      if (!board) throw notFound('Task not found.');
      return okBoard(
        board,
        `Activity recorded on the card (${input.activityKind}${
          input.activityOutcome ? `, ${input.activityOutcome}` : ''
        }).`,
      );
    }
    case 'add_note': {
      if (!input.boardId || !input.taskId || !input.note)
        throw invalidInput('add_note requires boardId, taskId, and note.');
      const board = await addNoteToTask(
        projectRoot,
        input.boardId,
        input.taskId,
        {
          author: input.author ?? 'agent',
          content: input.note,
        },
        eventContext,
      );
      if (!board) throw notFound('Task not found.');
      return okBoard(board, 'Note added.');
    }
    case 'add_link': {
      if (!input.boardId || !input.taskId || !input.url)
        throw invalidInput('add_link requires boardId, taskId, and url.');
      const board = await addLinkToTask(
        projectRoot,
        input.boardId,
        input.taskId,
        {
          url: input.url,
          type: input.linkType ?? 'url',
          ...(input.linkTitle !== undefined ? { title: input.linkTitle } : {}),
        },
        eventContext,
      );
      if (!board) throw notFound('Task not found.');
      return okBoard(board, 'Link added.');
    }
    case 'split_atomic': {
      if (!input.boardId || !input.taskId || !input.childTitles?.length) {
        throw invalidInput(
          'split_atomic requires boardId, taskId, and childTitles (at least one).',
        );
      }
      return handleSplitTask(projectRoot, input, { atomic: true }, eventContext);
    }
    default:
      return undefined;
  }
}
