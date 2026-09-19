import { assertManagementWrite, managementTaskVersion } from '../management-fence.js';
import { mutateBoard } from '../storage.js';
import type { KanbanEventContext, KanbanManagementReview } from '../types.js';

const LEASE_MS = 120_000;

export async function recordTaskManagementReview(
  projectRoot: string,
  boardId: string,
  taskId: string,
  input: { disposition: KanbanManagementReview['disposition']; reason: string },
  eventContext: KanbanEventContext,
) {
  if (!eventContext.expectedManagementToken)
    throw new Error('A task review requires an active management lease.');
  if (
    !['adequate', 'enriched', 'needs_leader'].includes(input.disposition) ||
    !input.reason?.trim()
  )
    throw new Error('A task review requires a valid disposition and a nonblank reason.');
  const updated = await mutateBoard(projectRoot, boardId, (board) => {
    const task = board.tasks.find((candidate) => candidate.id === taskId);
    if (!task) return false;
    assertManagementWrite(board, [task], eventContext, 'note');
    const lease = board.management!.lease!;
    lease.reviews ??= {};
    lease.reviews[task.id] = {
      taskVersion: managementTaskVersion(board, task),
      disposition: input.disposition,
      reason: input.reason.trim(),
      reviewedAt: Date.now(),
      reviewedBy: eventContext.actor ?? eventContext.sessionId,
    };
    board.management!.pendingTaskIds = board.tasks
      .filter(
        (candidate) =>
          candidate.status !== 'completed' &&
          candidate.status !== 'archived' &&
          !candidate.mergedIntoTaskId &&
          lease.reviews?.[candidate.id]?.taskVersion !== managementTaskVersion(board, candidate),
      )
      .map((candidate) => candidate.id);
    return true;
  });
  return updated?.result ? updated.board : null;
}

/** Serialized by the project owner: multiple UI/CLI hosts share one manager. */
export async function claimBoardManagement(
  projectRoot: string,
  boardId: string,
  input: { token: string; fingerprint: string; cooldownMs: number },
): Promise<boolean> {
  const result = await mutateBoard(projectRoot, boardId, (board) => {
    const now = Date.now();
    const state = board.management;
    if (
      board.supervisor?.enabled === false ||
      board.supervisor?.mode === 'deterministic' ||
      board.completedAt ||
      board.kind === 'archive' ||
      board.retention?.archivedAt
    )
      return false;
    if (state?.lease && state.lease.expiresAt > now) return false;
    if (state?.reviewCoverageVersion === 1 && state.reviewedFingerprint === input.fingerprint)
      return false;
    if (state?.lastAttemptAt && now - state.lastAttemptAt < input.cooldownMs) return false;
    const active = board.tasks.filter(
      (task) => task.status !== 'completed' && task.status !== 'archived' && !task.mergedIntoTaskId,
    );
    const reviews: Record<string, KanbanManagementReview> = {};
    for (const task of active) {
      const version = managementTaskVersion(board, task);
      const prior = [state?.lease?.reviews?.[task.id], state?.reviews?.[task.id]].find(
        (review) => review?.taskVersion === version,
      );
      if (prior) reviews[task.id] = { ...prior };
    }
    board.management = {
      ...state,
      status: 'running',
      lastAttemptAt: now,
      pendingTaskIds: active.filter((task) => !reviews[task.id]).map((task) => task.id),
      lease: {
        token: input.token,
        fingerprint: input.fingerprint,
        expiresAt: now + LEASE_MS,
        reviews,
      },
    };
    return true;
  });
  return result?.result ?? false;
}

export async function renewBoardManagement(
  projectRoot: string,
  boardId: string,
  token: string,
): Promise<boolean> {
  const result = await mutateBoard(projectRoot, boardId, (board) => {
    const lease = board.management?.lease;
    if (
      !lease ||
      lease.token !== token ||
      lease.expiresAt <= Date.now() ||
      board.supervisor?.enabled === false ||
      board.supervisor?.mode === 'deterministic' ||
      board.completedAt ||
      board.kind === 'archive' ||
      board.retention?.archivedAt
    )
      return false;
    lease.expiresAt = Date.now() + LEASE_MS;
    return true;
  });
  return result?.result ?? false;
}

export async function finishBoardManagement(
  projectRoot: string,
  boardId: string,
  token: string,
  result: {
    status: 'completed' | 'failed';
    result?: string | undefined;
    error?: string | undefined;
  },
): Promise<boolean> {
  const mutation = await mutateBoard(projectRoot, boardId, (board) => {
    const state = board.management;
    if (!state?.lease || state.lease.token !== token || state.lease.expiresAt <= Date.now())
      return false;
    const active = board.tasks.filter(
      (task) => task.status !== 'completed' && task.status !== 'archived' && !task.mergedIntoTaskId,
    );
    const reviews = state.lease.reviews ?? {};
    const pending = active
      .filter((task) => reviews[task.id]?.taskVersion !== managementTaskVersion(board, task))
      .map((task) => task.id);
    const complete = result.status === 'completed' && pending.length === 0;
    if (complete) {
      state.reviewedFingerprint = state.lease.fingerprint;
      state.reviewCoverageVersion = 1;
    }
    state.status = complete ? 'completed' : 'failed';
    state.reviews = reviews;
    state.pendingTaskIds = pending;
    state.lastCompletedAt = Date.now();
    const decisions = active.flatMap((task) =>
      reviews[task.id]?.disposition === 'needs_leader' && !pending.includes(task.id)
        ? [`${task.id}: ${reviews[task.id]!.reason}`]
        : [],
    );
    state.summary = [
      ...(!complete && result.status === 'completed'
        ? [`Management review incomplete: ${pending.length} active cards lack a current review.`]
        : []),
      result.result ??
        (complete ? `Reviewed ${active.length} active cards.` : 'Management review incomplete.'),
      ...(decisions.length ? ['Leader decisions required:', ...decisions] : []),
    ].join('\n');
    state.error =
      result.error ??
      (!complete && result.status === 'completed'
        ? `Missing or stale card reviews: ${pending.join(', ')}`
        : undefined);
    delete state.lease;
    return true;
  });
  return mutation?.result ?? false;
}
