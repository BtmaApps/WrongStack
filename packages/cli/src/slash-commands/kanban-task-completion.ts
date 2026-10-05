import { color } from '@wrongstack/core/utils';
import { decodeLifecycleIssues, getBoard, transitionTask, updateTask } from '@wrongstack/kanban';
import { preflightManagedTransition } from '@wrongstack/kanban/manager/lifecycle';
import {
  formatLifecycleDiagnosis,
  parseTaskEvidenceFlags,
} from './kanban-lifecycle-diagnostics.js';

interface CompleteKanbanTaskInput {
  sub: string;
  rest: string[];
  board: import('@wrongstack/kanban').KanbanBoard;
  eventContext: import('@wrongstack/kanban').KanbanEventContext;
  projectRoot: string;
  boardId: string;
  syncTaskToContext: (
    opts: import('./command-context.js').SlashCommandContext,
    task: import('@wrongstack/kanban').KanbanTask | undefined,
    options?: { remove?: boolean },
  ) => Promise<void>;
  opts: import('./command-context.js').SlashCommandContext;
}

export async function completeKanbanTask({
  sub,
  rest,
  board,
  eventContext,
  projectRoot,
  boardId,
  syncTaskToContext,
  opts,
}: CompleteKanbanTaskInput): Promise<{ message: string } | undefined> {
  if (sub === 'done') {
    const taskId = rest[0];
    if (!taskId) {
      return {
        message: color.red(
          'Usage: /kanban task done <boardId> <taskId> [--attachment <url>] [--note <text>]',
        ),
      };
    }
    const { attachment, note, tickChecks, positional, warnings } = parseTaskEvidenceFlags(
      rest.slice(1),
    );
    if (positional.length > 0) {
      return {
        message: color.red(
          'Usage: /kanban task done <boardId> <taskId> [--attachment <url>] [--note <text>]',
        ),
      };
    }
    if (warnings.length > 0) {
      return {
        message: color.yellow(
          '⚠️  /kanban task done flag parse warnings:\n' +
            warnings.map((w) => `  - ${w}`).join('\n') +
            '\nRe-run with the flags positioned correctly before the board/task ids.',
        ),
      };
    }
    if (board.lifecycle?.mode === 'managed') {
      const stageToColumn = board.lifecycle?.columns ?? {};
      const currentTask = board.tasks.find((t) => t.id === taskId);
      // Resolve the card before deriving a path: a missing card has no column,
      // which used to surface as the misleading "unrecognized lifecycle column".
      if (!currentTask) {
        return { message: color.red('Task not found') };
      }
      const currentStage = Object.entries(stageToColumn).find(
        ([, columnId]) => columnId === currentTask.columnId,
      )?.[0];
      if (currentStage === 'done') {
        return { message: color.yellow('Task is already in Done — nothing to do.') };
      }
      const path: readonly ('backlog' | 'todo' | 'running' | 'review' | 'done')[] | null =
        currentStage === 'backlog'
          ? (['todo', 'running', 'review', 'done'] as const)
          : currentStage === 'todo'
            ? (['running', 'review', 'done'] as const)
            : currentStage === 'running'
              ? (['review', 'done'] as const)
              : currentStage === 'review'
                ? (['done'] as const)
                : null;
      if (path === null) {
        return {
          message: color.red(
            `❌ /kanban task done could not derive a sequential path for the card's current stage (\`${currentStage ?? 'unknown'}\`). The card may be in an unrecognized lifecycle column; move it to \`review\` with \`/kanban task move\` and retry.`,
          ),
        };
      }
      const preflightIssues: string[] = [];
      if (!note?.trim()) {
        return {
          message: color.red(
            `Refusing /kanban task ${currentStage ?? 'unknown'} → done without a reviewer note. ` +
              `Re-run with --note "<what proves the work is ready>".`,
          ),
        };
      }
      const noteText = note.trim();
      const sharedAttachment = attachment
        ? {
            url: attachment,
            type: 'url' as const,
            title: 'Reviewer evidence (kanban-slash:done)',
          }
        : undefined;
      for (const to of path) {
        const transitionInput = {
          to,
          sessionId: eventContext.sessionId,
          actor: 'kanban-slash:done',
          action: `${noteText} (${to})`,
          comment: `${noteText} (${to})`,
          ...(sharedAttachment ? { attachment: sharedAttachment } : {}),
          ...(tickChecks ? { tickChecks } : {}),
        };
        const issues = preflightManagedTransition(board, currentTask, transitionInput);
        for (const issue of issues) {
          preflightIssues.push(issue.message);
        }
      }
      if (preflightIssues.length > 0) {
        return {
          message: color.red(
            `❌ /kanban task ${currentStage ?? 'unknown'} → done needs attention:\n` +
              preflightIssues.map((issue) => `  - ${issue}`).join('\n'),
          ),
        };
      }
      try {
        for (const to of path) {
          await transitionTask(projectRoot, boardId, taskId, {
            sessionId: eventContext.sessionId,
            to: to as 'backlog' | 'todo' | 'running' | 'review' | 'done',
            actor: 'kanban-slash:done',
            action: noteText ? `${noteText} (${to})` : '',
            comment: noteText ? `${noteText} (${to})` : '',
            ...(attachment
              ? {
                  attachment: {
                    url: attachment,
                    type: 'url' as const,
                    title: 'Reviewer evidence (kanban-slash:done)',
                  },
                }
              : {}),
            ...(tickChecks.length > 0 ? { tickChecks } : {}),
          });
        }
        const finalBoard = await getBoard(projectRoot, boardId);
        await syncTaskToContext(
          opts,
          finalBoard?.tasks.find((t) => t.id === taskId),
        );
        return { message: color.green('✅ Task marked completed.') };
      } catch (err) {
        if (decodeLifecycleIssues(err).length > 0) {
          return { message: formatLifecycleDiagnosis(err, 'done') };
        }
        throw err;
      }
    }
    const completedCol = board.columns.find((c) =>
      ['done', 'completed', 'finished'].includes(c.id),
    );
    const updated = await updateTask(
      projectRoot,
      boardId,
      taskId,
      {
        status: 'completed',
        ...(completedCol?.id ? { columnId: completedCol.id } : {}),
      },
      eventContext,
    );
    if (!updated) return { message: color.red('Task not found') };
    await syncTaskToContext(
      opts,
      updated.tasks.find((t) => t.id === taskId),
    );
    return {
      message: color.green('✅ Task marked completed.'),
    };
  }
  return undefined;
}
