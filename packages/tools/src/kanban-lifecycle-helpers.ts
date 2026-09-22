import type { Context } from '@wrongstack/core/agent';

import type { KanbanAgentAssignment } from '@wrongstack/kanban';

import { getTask, releaseTaskClaim, updateTaskAssignment } from '@wrongstack/kanban';

import { conflict, notFound } from './kanban-tool-results.js';

import { applySessionKanbanTaskToSource } from './session-kanban.js';

export async function syncContextTask(
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
export async function rollbackStartedAssignment(
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

export function joinCommitted(...notes: Array<string | undefined>): string | undefined {
  const present = notes.filter((note): note is string => Boolean(note));
  return present.length ? present.join(' ') : undefined;
}

/** A null from a lease-fenced write means "task missing" OR "lease no longer ours". */
export async function missingOrFenced(
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
