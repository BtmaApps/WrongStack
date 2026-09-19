import { evaluateContractGraph, evaluateContractGraphReadiness } from '../contract-graph.js';
import { summarizeBoard } from '../storage.js';
import type { KanbanBoard, KanbanBoardKind } from '../types.js';
import type {
  KanbanOrchestrationSnapshot,
  KanbanQueueHealth,
  KanbanSearchInput,
  KanbanSearchResult,
} from '../types-operations.js';
import {
  isTaskReadyForWork,
  later,
  matchesKanbanSearch,
  msUntilExpiry,
  nowIso,
} from './_internal.js';
import { collectBoardsForHealth } from './board-health.js';

import { resolveKindFilter } from './board-kind-filter.js';
import { getBoard, listBoards } from './boards.js';
import { areDependenciesMet } from './dependencies.js';
import { classifyTaskForQueue } from './task-classifier.js';

export async function getKanbanOrchestrationSnapshot(
  projectRoot: string,
  input: KanbanSearchInput & {
    includeBoardKinds?: readonly KanbanBoardKind[];
    excludeBoardKinds?: readonly KanbanBoardKind[];
  } = {},
): Promise<KanbanOrchestrationSnapshot> {
  const kindResolved = resolveKindFilter({
    ...(input.includeBoardKinds !== undefined
      ? { includeBoardKinds: input.includeBoardKinds }
      : {}),
    ...(input.excludeBoardKinds !== undefined
      ? { excludeBoardKinds: input.excludeBoardKinds }
      : {}),
  });
  const boards = input.boardId
    ? [await getBoard(projectRoot, input.boardId)].filter((board): board is KanbanBoard =>
        Boolean(board),
      )
    : await Promise.all(
        (await listBoards(projectRoot))
          .filter((summary) => {
            const kind = summary.kind ?? 'project';
            if (kindResolved.include) return kindResolved.include.has(kind);
            return !kindResolved.exclude.has(kind);
          })
          .map((board) => getBoard(projectRoot, board.id)),
      ).then((items) => items.filter((board): board is KanbanBoard => Boolean(board)));
  const snapshot: KanbanOrchestrationSnapshot = {
    generatedAt: nowIso(),
    boards: boards.map((board) => summarizeBoard(board)),
    ready: [],
    queued: [],
    running: [],
    blocked: [],
    review: [],
    failed: [],
    completed: [],
  };
  for (const board of boards) {
    const summary = summarizeBoard(board);
    for (const task of board.tasks) {
      if (!matchesKanbanSearch(board, task, input)) continue;
      const readiness =
        board.kind === 'session_mirror'
          ? undefined
          : evaluateContractGraphReadiness(board, task.id);
      const completion =
        board.kind === 'session_mirror' ? undefined : evaluateContractGraph(board, task.id);
      const result: KanbanSearchResult = {
        board: summary,
        task,
        ...(readiness && completion
          ? {
              contractStatus: {
                enforcement: completion.enforcement,
                startReady: readiness.ready,
                setupGaps: readiness.issues.length,
                completionOpen: completion.issues.length,
                closed: readiness.ready && completion.issues.length === 0,
              },
            }
          : {}),
      };
      if (isTaskReadyForWork(board, task)) snapshot.ready.push(result);
      if (task.assignment?.status === 'queued' || task.assignment?.status === 'assigned') {
        snapshot.queued.push(result);
      }
      if (task.assignment?.status === 'running' || task.status === 'in_progress') {
        snapshot.running.push(result);
      }
      if (task.status === 'blocked' || !areDependenciesMet(board, task.id)) {
        snapshot.blocked.push(result);
      }
      if (task.status === 'review') snapshot.review.push(result);
      if (task.status === 'failed' || task.assignment?.status === 'failed')
        snapshot.failed.push(result);
      if (task.status === 'completed') snapshot.completed.push(result);
    }
  }
  return snapshot;
}

/**
 * Operational health summary. See `KanbanQueueHealth` for the full contract.
 *
 * Implementation notes:
 *   * Per-status counts are computed against the current state of every
 *     queried board (the same source `getKanbanOrchestrationSnapshot`
 *     consumes).
 *   * `dependencyBlocked` deduplicates `counts.ready` — a task ready but
 *     blocked by dependencies only appears in the blocked bucket.
 *   * `counts.ready` tallies the stored `status` field; `counts.startable` is
 *     the derived "can be started now" count that agrees with
 *     `listReadyTasks`. Display surfaces want `startable`.
 *   * `staleAssignments` and `heartbeatDue` use `now ?? real-wall-clock`;
 *     callers (notably the recovery loop) should pass an explicit
 *     timestamp so time is deterministic.
 *   * `lastDispatchedAt` / `lastStaleRecoveredAt` come from the append-only
 *     event log so dashboards do not need to rescan tasks.
 */
export async function getKanbanQueueHealth(
  projectRoot: string,
  input: {
    boardId?: string;
    now?: string;
    heartbeatIntervalMs?: number;
    includeBoardKinds?: readonly KanbanBoardKind[];
    excludeBoardKinds?: readonly KanbanBoardKind[];
    /**
     * `classifications.diagnostics` carries one entry per non-clean task, which
     * is the only channel telling an agent *why* a card is unclaimable — so it
     * stays on by default. Pass `false` from surfaces that render counts and
     * never read the reasons (the WebUI polls health every five seconds); the
     * diagnostics array is the bulk of the payload.
     */
    includeClassifications?: boolean;
  } = {},
): Promise<KanbanQueueHealth> {
  const heartbeatIntervalMs = input.heartbeatIntervalMs ?? 60_000;
  const now = input.now ?? nowIso();
  const boards = await collectBoardsForHealth(projectRoot, input.boardId, {
    ...(input.includeBoardKinds !== undefined
      ? { includeBoardKinds: input.includeBoardKinds }
      : {}),
    ...(input.excludeBoardKinds !== undefined
      ? { excludeBoardKinds: input.excludeBoardKinds }
      : {}),
  });
  const boardIds = boards.map((board) => board.id);

  const counts = {
    ready: 0,
    startable: 0,
    queued: 0,
    running: 0,
    review: 0,
    failed: 0,
    completed: 0,
    pending: 0,
    archived: 0,
    blocked: 0,
  };
  const dependencyBlocked: KanbanSearchResult[] = [];
  const staleAssignments: KanbanSearchResult[] = [];
  const failedRetryable: KanbanSearchResult[] = [];
  const heartbeatDue: KanbanSearchResult[] = [];
  const parked: KanbanSearchResult[] = [];
  const classificationCounts = {
    claimable: 0,
    stage_blocked: 0,
    detail_incomplete: 0,
    dependency_blocked: 0,
    queued: 0,
    queued_expired: 0,
    running_live: 0,
    running_expired: 0,
    running_no_lease: 0,
    review: 0,
    failed_retryable: 0,
    failed_terminal: 0,
    completed: 0,
    archived: 0,
    not_dispatchable: 0,
  };
  const classificationDiagnostics: NonNullable<
    KanbanQueueHealth['classifications']
  >['diagnostics'] = [];

  for (const board of boards) {
    const summary = summarizeBoard(board);
    for (const task of board.tasks) {
      const assignment = task.assignment;
      const result = { board: summary, task };
      const classification = classifyTaskForQueue(board, task, { now, heartbeatIntervalMs });
      classificationCounts[classification.bucket] += 1;
      if (input.includeClassifications !== false && classification.reasons.length > 0) {
        classificationDiagnostics.push({
          boardId: board.id,
          taskId: task.id,
          bucket: classification.bucket,
          reasons: [...classification.reasons],
          ...(classification.managedStage !== undefined
            ? { managedStage: classification.managedStage }
            : {}),
        });
      }
      const dependencyUnmet = !areDependenciesMet(board, task.id);
      const isRunning =
        task.status === 'in_progress' ||
        (assignment !== undefined && assignment.status === 'running');
      const isQueued =
        assignment !== undefined &&
        (assignment.status === 'queued' || assignment.status === 'assigned');
      // Each task is counted exactly once. The semantic priority for the
      // canonical bucket is: running > queued/assigned > raw task status.
      // Previously running/queued were additive extras on top of the raw
      // status count, which inflated totals (a running-assignment task with
      // ready status showed in both ready and running).
      if (isRunning) {
        counts.running += 1;
      } else if (isQueued) {
        counts.queued += 1;
      } else {
        counts[task.status as keyof typeof counts] += 1;
      }
      // Derived readiness, computed with the same predicate `listReadyTasks`
      // uses, so the two surfaces cannot disagree about the same board.
      if (isTaskReadyForWork(board, task)) counts.startable += 1;
      const readyButBlocked = task.status === 'ready' && dependencyUnmet;
      const pendingButBlocked = task.status === 'pending' && dependencyUnmet;
      if (readyButBlocked || pendingButBlocked) {
        dependencyBlocked.push(result);
      }
      const expiredLease =
        assignment !== undefined &&
        (assignment.status === 'queued' || assignment.status === 'running') &&
        assignment.leaseExpiresAt !== undefined &&
        assignment.leaseExpiresAt <= now;
      if (expiredLease) {
        staleAssignments.push(result);
      }
      if (
        assignment &&
        assignment.status === 'running' &&
        assignment.leaseExpiresAt !== undefined &&
        msUntilExpiry(assignment.leaseExpiresAt, now) <= heartbeatIntervalMs
      ) {
        heartbeatDue.push(result);
      }
      if (
        task.status === 'failed' &&
        assignment &&
        assignment.maxAttempts !== undefined &&
        (assignment.attempt ?? 0) < assignment.maxAttempts
      ) {
        failedRetryable.push(result);
      }
      // A parked card has spent its verification budget: it will not clear
      // itself and nothing will retry it. Terminal cards are excluded because
      // a passing verification calls `clearGateRefusals`, so a completed card
      // carrying a park record is stale data rather than live attention.
      if (task.park !== undefined && task.status !== 'completed' && task.status !== 'archived') {
        parked.push(result);
      }
    }
  }

  // Read cached timestamps from the persisted board record instead of scanning
  // the full event log. These are set atomically by updateTaskAssignment
  // (for lastDispatchedAt) and recoverStaleTaskAssignments (for lastStaleRecoveredAt).
  let lastDispatchedAt: string | undefined;
  let lastStaleRecoveredAt: string | undefined;
  for (const board of boards) {
    if (board.lastDispatchedAt !== undefined) {
      lastDispatchedAt = later(lastDispatchedAt, board.lastDispatchedAt);
    }
    if (board.lastStaleRecoveredAt !== undefined) {
      lastStaleRecoveredAt = later(lastStaleRecoveredAt, board.lastStaleRecoveredAt);
    }
  }

  return {
    generatedAt: now,
    boardIds,
    counts,
    dependencyBlocked: { count: dependencyBlocked.length, tasks: dependencyBlocked },
    staleAssignments: { count: staleAssignments.length, tasks: staleAssignments },
    failedRetryable: { count: failedRetryable.length, tasks: failedRetryable },
    heartbeatDue: { count: heartbeatDue.length, tasks: heartbeatDue },
    parked: { count: parked.length, tasks: parked },
    ...(input.includeClassifications === false
      ? {}
      : {
          classifications: {
            counts: classificationCounts,
            diagnostics: classificationDiagnostics,
          },
        }),
    ...(lastDispatchedAt !== undefined ? { lastDispatchedAt } : {}),
    ...(lastStaleRecoveredAt !== undefined ? { lastStaleRecoveredAt } : {}),
  };
}
