import {
  boardKey,
  cleanupEmptySessionKanbanBoards,
  cleanupSessionKanbanBoardIfEmpty,
  enqueueBoardWork,
  ensureSessionKanbanBoard,
  isOwnedSessionBoard,
  MIRROR_DISABLED_ENV,
  releaseActiveSessionBoard,
  retainActiveSessionBoard,
  sessionBoardTags,
  sessionIdFromTags,
} from './session-kanban-boards.js';

export {
  cleanupEmptySessionKanbanBoards,
  cleanupSessionKanbanBoard,
  cleanupSessionKanbanBoardIfEmpty,
  ensureSessionKanbanBoard,
  SESSION_KANBAN_COLUMNS,
} from './session-kanban-boards.js';

import { type FSWatcher, watch } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { Context, TodoItem } from '@wrongstack/core/agent';
import { loadPlan, loadTasks, type PlanItem } from '@wrongstack/core/storage';
import { deserializeTaskGraph } from '@wrongstack/core/tasking';
import type { SerializedTaskGraph } from '@wrongstack/core/types';
import type { TaskItem } from '@wrongstack/core/utils';
import {
  bridgeKanbanSupervisor,
  compactSessionMirrorBoard,
  getBoard,
  getKanbanOrchestrationSnapshot,
  type KanbanBoard,
  type KanbanTask,
  pruneSessionBoards,
  syncBoardFromTaskGraph,
  touchKanbanPresence,
} from '@wrongstack/kanban';
import {
  planFileToSerializedGraph,
  taskFileToSerializedGraph,
  todoListToSerializedGraph,
} from './session-kanban-graph.js';
import { deliverKanbanManagementReview } from './session-kanban-management.js';
import {
  applyManagedKanbanBoardToTodos as applyManagedKanbanBoardToTodosSync,
  applySessionKanbanBoardToTodos as applySessionKanbanBoardToTodosSync,
  applySessionKanbanTaskToSource as applySessionKanbanTaskToSourceSync,
  type SessionKanbanSourceUpdate,
  todosNeedingSessionMirror,
} from './session-kanban-sync.js';

export {
  PLAN_STATUS_TO_TASK,
  planFileToSerializedGraph,
  taskFileToSerializedGraph,
  todoListToSerializedGraph,
} from './session-kanban-graph.js';

export {
  blockingTitles,
  orderTasksForTodos,
  type SessionKanbanSourceUpdate,
  todosNeedingSessionMirror,
} from './session-kanban-sync.js';

type PendingMirror = {
  projectRoot: string;
  sessionId: string;
  graph: SerializedTaskGraph;
  reconciliationGraph?: SerializedTaskGraph | undefined;
  sourceSystem: 'session-todo' | 'session-task' | 'session-plan';
};
const pendingMirrors = new Map<string, PendingMirror>();
const activeMirrors = new Set<string>();
const mirrorFailures = new Map<
  string,
  { message: string; sourceSystem: PendingMirror['sourceSystem'] }
>();
const bindings = new WeakMap<Context, () => void>();
const suppressedTodoMirrors = new WeakSet<Context>();

function mirrorKey(
  projectRoot: string,
  sessionId: string,
  sourceSystem: PendingMirror['sourceSystem'],
): string {
  return `${boardKey(projectRoot, sessionId)}\0${sourceSystem}`;
}

function completedReconciliationGraph(
  latest: SerializedTaskGraph,
  candidates: readonly SerializedTaskGraph[],
): SerializedTaskGraph | undefined {
  const latestNodeIds = new Set(latest.nodes.map((node) => node.id));
  const carriedNodeIds = new Set<string>();
  const completedNodes = candidates.flatMap((candidate) =>
    candidate.nodes.filter((node) => {
      if (
        node.status !== 'completed' ||
        latestNodeIds.has(node.id) ||
        carriedNodeIds.has(node.id)
      ) {
        return false;
      }
      carriedNodeIds.add(node.id);
      return true;
    }),
  );
  if (completedNodes.length === 0) return undefined;

  const carriedRequirements = completedNodes.flatMap((node) =>
    node.specRequirementId ? [node.specRequirementId] : [],
  );
  return {
    ...latest,
    nodes: [...latest.nodes, ...completedNodes],
    rootNodes: [...new Set([...latest.rootNodes, ...completedNodes.map((node) => node.id)])],
    ...(latest.requiredRequirementIds
      ? {
          requiredRequirementIds: [
            ...new Set([...latest.requiredRequirementIds, ...carriedRequirements]),
          ],
        }
      : {}),
  };
}

async function projectGraph(
  projectRoot: string | undefined,
  sessionId: string,
  graph: SerializedTaskGraph,
  sourceSystem: 'session-todo' | 'session-task' | 'session-plan',
): Promise<KanbanBoard | null> {
  if (!projectRoot || !sessionId || process.env[MIRROR_DISABLED_ENV] === '0') return null;
  return enqueueBoardWork(projectRoot, sessionId, async () => {
    const board = await ensureSessionKanbanBoard(projectRoot, sessionId);
    if (!board) return null;
    const result = await syncBoardFromTaskGraph(
      projectRoot,
      board.id,
      deserializeTaskGraph(graph),
      {
        sourceSystem,
        tags: [...new Set([...(board.tags ?? []), ...sessionBoardTags(sessionId)])],
        archiveMissingTasks: true,
        includeCompletedTasks: true,
        allowRequirementScopeShrink: true,
      },
    );
    if (!result) return null;
    const compacted = await compactSessionMirrorBoard(projectRoot, board.id);
    if (compacted?.removedTaskIds.length) {
      return (await getBoard(projectRoot, board.id)) ?? result.board;
    }
    return result.board;
  });
}

function queueLatestMirror(
  projectRoot: string | undefined,
  sessionId: string,
  graph: SerializedTaskGraph,
  sourceSystem: PendingMirror['sourceSystem'],
): void {
  if (!projectRoot || !sessionId || process.env[MIRROR_DISABLED_ENV] === '0') return;
  const key = mirrorKey(projectRoot, sessionId, sourceSystem);
  const previous = pendingMirrors.get(key);
  const reconciliationGraph = previous
    ? completedReconciliationGraph(
        graph,
        [previous.reconciliationGraph, previous.graph].filter(
          (candidate): candidate is SerializedTaskGraph => candidate !== undefined,
        ),
      )
    : undefined;
  pendingMirrors.set(key, {
    projectRoot,
    sessionId,
    graph,
    ...(reconciliationGraph ? { reconciliationGraph } : {}),
    sourceSystem,
  });
  if (activeMirrors.has(key)) return;
  activeMirrors.add(key);
  const pump = (async () => {
    try {
      for (;;) {
        const pending = pendingMirrors.get(key);
        if (!pending) break;
        pendingMirrors.delete(key);
        try {
          if (pending.reconciliationGraph) {
            await projectGraph(
              pending.projectRoot,
              pending.sessionId,
              pending.reconciliationGraph,
              pending.sourceSystem,
            );
          }
          await projectGraph(
            pending.projectRoot,
            pending.sessionId,
            pending.graph,
            pending.sourceSystem,
          );
          mirrorFailures.delete(boardKey(pending.projectRoot, pending.sessionId));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          mirrorFailures.set(boardKey(pending.projectRoot, pending.sessionId), {
            message,
            sourceSystem: pending.sourceSystem,
          });
          console.warn(
            JSON.stringify({
              level: 'warn',
              event: 'session-kanban.mirror-failed',
              sessionId: pending.sessionId,
              sourceSystem: pending.sourceSystem,
              message,
              timestamp: new Date().toISOString(),
            }),
          );
        }
      }
    } finally {
      activeMirrors.delete(key);
      const pending = pendingMirrors.get(key);
      if (pending) {
        pendingMirrors.delete(key);
        // Re-queue through the same coalescing path, but do NOT lose the
        // carried completed nodes. `projectGraph` runs with
        // `archiveMissingTasks: true`, so a graph that has shed the completed
        // work archives those cards — which is exactly the "finished task
        // disappeared, then came back as a new card" report. `queueLatestMirror`
        // rebuilds the reconciliation set from the pending entry it finds, so
        // the carried nodes have to be folded back into the graph here rather
        // than dropped on the floor.
        const carried = pending.reconciliationGraph
          ? completedReconciliationGraph(pending.graph, [pending.reconciliationGraph])
          : undefined;
        queueLatestMirror(
          pending.projectRoot,
          pending.sessionId,
          carried ?? pending.graph,
          pending.sourceSystem,
        );
      }
    }
  })();
  trackBackgroundWork(pump);
}

export function takeSessionMirrorFailure(
  projectRoot: string | undefined,
  sessionId: string,
): string | undefined {
  if (!projectRoot || !sessionId) return undefined;
  const key = boardKey(projectRoot, sessionId);
  const failure = mirrorFailures.get(key);
  if (!failure) return undefined;
  mirrorFailures.delete(key);
  return `Kanban mirror (${failure.sourceSystem}) failed and the board may be stale: ${failure.message}`;
}

function hasInFlightTodoMirror(projectRoot: string | undefined, sessionId: string): boolean {
  if (!projectRoot || !sessionId) return false;
  const key = mirrorKey(projectRoot, sessionId, 'session-todo');
  return pendingMirrors.has(key) || activeMirrors.has(key);
}

export function projectSessionTodosToKanban(
  projectRoot: string | undefined,
  todos: readonly TodoItem[],
  sessionId: string,
): Promise<KanbanBoard | null> {
  return projectGraph(
    projectRoot,
    sessionId,
    todoListToSerializedGraph(todos, sessionId),
    'session-todo',
  );
}

export function projectSessionTasksToKanban(
  projectRoot: string | undefined,
  tasks: readonly TaskItem[],
  sessionId: string,
): Promise<KanbanBoard | null> {
  return projectGraph(
    projectRoot,
    sessionId,
    taskFileToSerializedGraph(tasks, sessionId),
    'session-task',
  );
}

export function projectSessionPlanToKanban(
  projectRoot: string | undefined,
  items: readonly PlanItem[],
  sessionId: string,
): Promise<KanbanBoard | null> {
  return projectGraph(
    projectRoot,
    sessionId,
    planFileToSerializedGraph(items, sessionId),
    'session-plan',
  );
}

/**
 * Every background pass this module starts — presence touches, board
 * refreshes, the mirror pump — outlives the call that started it. Nothing
 * held a handle on that work, so a caller that had finished with a session
 * (a test tearing down its temp dir, a surface closing a session) could not
 * wait for it: the writes landed on a directory that was already gone and
 * reported the ENOENT as a warning long after anyone was listening.
 *
 * The set is the handle. It holds settled-or-not promises that never reject,
 * so tracking can never itself become an unhandled rejection.
 */
const backgroundWork = new Set<Promise<void>>();

function trackBackgroundWork(work: Promise<unknown>): void {
  const tracked = work.then(
    () => undefined,
    () => undefined,
  );
  backgroundWork.add(tracked);
  void tracked.then(() => {
    backgroundWork.delete(tracked);
  });
}

/**
 * Waits for background work started so far to finish. Background work can
 * start more background work (the mirror pump re-queues itself), so this
 * drains in passes until a full pass adds nothing; the pass cap keeps a
 * pathological re-queue loop from hanging a caller forever.
 */
export async function settleSessionKanbanBackgroundWork(maxPasses = 25): Promise<void> {
  for (let pass = 0; pass < maxPasses && backgroundWork.size > 0; pass += 1) {
    await Promise.all([...backgroundWork]);
  }
}

function fireAndForget(context: string, work: Promise<unknown>): void {
  trackBackgroundWork(
    work.catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'session-kanban',
          context,
          message,
          timestamp: new Date().toISOString(),
        }),
      );
    }),
  );
}

export function mirrorSessionTodosToKanban(
  projectRoot: string | undefined,
  todos: readonly TodoItem[],
  sessionId: string,
): void {
  queueLatestMirror(
    projectRoot,
    sessionId,
    todoListToSerializedGraph(todos, sessionId),
    'session-todo',
  );
}

export function mirrorSessionTasksToKanban(
  projectRoot: string | undefined,
  tasks: readonly TaskItem[],
  sessionId: string,
): void {
  queueLatestMirror(
    projectRoot,
    sessionId,
    taskFileToSerializedGraph(tasks, sessionId),
    'session-task',
  );
}

export function mirrorSessionPlanToKanban(
  projectRoot: string | undefined,
  items: readonly PlanItem[],
  sessionId: string,
): void {
  queueLatestMirror(
    projectRoot,
    sessionId,
    planFileToSerializedGraph(items, sessionId),
    'session-plan',
  );
}

export function attachSessionKanbanMirror(context: Context): () => void {
  const existing = bindings.get(context);
  if (existing) return existing;

  let detached = false;
  let watcherGeneration = 0;
  const attachedProjectRoot = context.projectRoot ?? '';
  let registeredSessionId = '';
  const syncActiveSessionRegistration = () => {
    if (!attachedProjectRoot) return;
    const currentSessionId = context.session?.id ?? '';
    if (currentSessionId === registeredSessionId) return;
    if (registeredSessionId) {
      releaseActiveSessionBoard(attachedProjectRoot, registeredSessionId);
      fireAndForget(
        'cleanup-board',
        cleanupSessionKanbanBoardIfEmpty(attachedProjectRoot, registeredSessionId),
      );
    }
    registeredSessionId = currentSessionId;
    if (registeredSessionId) {
      retainActiveSessionBoard(attachedProjectRoot, registeredSessionId);
    }
  };
  syncActiveSessionRegistration();

  let watcher: FSWatcher | null = null;
  let watchedDir = '';
  let timer: NodeJS.Timeout | null = null;
  let unsubscribeBoardEvents: (() => void) | null = null;
  let watchedBoardId = '';
  let boardTimer: NodeJS.Timeout | null = null;
  let presenceTimer: NodeJS.Timeout | null = null;

  const sessionId = () => context.session?.id ?? '';
  const activeManagedBoardId = () => {
    const metaKanban = context.meta['kanban'];
    const metaBoardId =
      metaKanban && typeof metaKanban === 'object'
        ? (metaKanban as Record<string, unknown>)['boardId']
        : undefined;
    return (
      context.currentKanbanBoardId ??
      (typeof metaBoardId === 'string' && metaBoardId ? metaBoardId : '')
    );
  };
  const isCurrent = (id: string, boardId: string, generation: number) =>
    !detached &&
    generation === watcherGeneration &&
    sessionId() === id &&
    activeManagedBoardId() === boardId &&
    (context.projectRoot ?? '') === attachedProjectRoot;
  const stopBoardWatcher = () => {
    unsubscribeBoardEvents?.();
    unsubscribeBoardEvents = null;
    if (boardTimer) clearTimeout(boardTimer);
    boardTimer = null;
    if (presenceTimer) clearInterval(presenceTimer);
    presenceTimer = null;
    watchedBoardId = '';
  };
  const refreshFiles = async () => {
    const id = sessionId();
    const generation = watcherGeneration;
    const managedBoardId = activeManagedBoardId();
    if (!id || detached) return;
    const planPath = context.meta['plan.path'];
    const taskPath = context.meta['task.path'];
    if (typeof planPath === 'string' && planPath) {
      const plan = await loadPlan(planPath);
      if (!isCurrent(id, managedBoardId, generation) || context.meta['plan.path'] !== planPath)
        return;
      if (plan) await projectSessionPlanToKanban(attachedProjectRoot, plan.items, id);
    }
    if (!isCurrent(id, managedBoardId, generation)) return;
    if (typeof taskPath === 'string' && taskPath) {
      const tasks = await loadTasks(taskPath);
      if (!isCurrent(id, managedBoardId, generation) || context.meta['task.path'] !== taskPath)
        return;
      if (tasks) await projectSessionTasksToKanban(attachedProjectRoot, tasks.tasks, id);
    }
  };

  const refreshBoard = async () => {
    const boardId = watchedBoardId;
    const id = sessionId();
    const managedBoardId = activeManagedBoardId();
    const generation = watcherGeneration;
    if (!boardId || detached) return;
    const board = await getBoard(attachedProjectRoot, boardId);
    if (!board || !isCurrent(id, managedBoardId, generation) || watchedBoardId !== boardId) return;
    deliverKanbanManagementReview(context, board);
    if (board.lifecycle?.mode === 'managed') applyManagedKanbanBoardToTodos(context, board);
    else applySessionKanbanBoardToTodos(context, board);
  };

  const configureBoardWatcher = async () => {
    if (detached) return;
    const generation = ++watcherGeneration;
    const id = sessionId();
    const managedBoardId = activeManagedBoardId();
    stopBoardWatcher();
    const board = managedBoardId
      ? await getBoard(attachedProjectRoot, managedBoardId)
      : id
        ? await ensureSessionKanbanBoard(attachedProjectRoot, id)
        : null;
    if (!board || !isCurrent(id, managedBoardId, generation)) return;
    watchedBoardId = board.id;
    try {
      unsubscribeBoardEvents = bridgeKanbanSupervisor(
        attachedProjectRoot,
        (event) => {
          if (!isCurrent(id, managedBoardId, generation)) return;
          const data = event.data as { boardId?: string } | undefined;
          if (data?.boardId !== board.id) return;
          if (boardTimer) clearTimeout(boardTimer);
          boardTimer = setTimeout(() => fireAndForget('refresh-board', refreshBoard()), 60);
        },
        { autoReconnect: true, reconnectDelayMs: 1_000 },
      );
      const touchPresence = () =>
        isCurrent(id, managedBoardId, generation)
          ? touchKanbanPresence(attachedProjectRoot, board.id, {
              sessionId: id,
              agentId: context.agentId,
              agentName: context.agentName,
            })
          : Promise.resolve(null);
      fireAndForget('touch-presence', touchPresence());
      if (presenceTimer) clearInterval(presenceTimer);
      presenceTimer = setInterval(() => fireAndForget('touch-presence', touchPresence()), 60_000);
      presenceTimer.unref?.();
      if (board.lifecycle?.mode === 'managed') applyManagedKanbanBoardToTodos(context, board);
    } catch {
      unsubscribeBoardEvents = null;
      watchedBoardId = '';
    }
  };

  const configureWatcher = () => {
    if (detached) return;
    const planPath = context.meta['plan.path'];
    const taskPath = context.meta['task.path'];
    const candidate =
      typeof planPath === 'string' && planPath
        ? dirname(planPath)
        : typeof taskPath === 'string' && taskPath
          ? dirname(taskPath)
          : '';
    if (candidate === watchedDir) return;
    watcher?.close();
    watcher = null;
    watchedDir = candidate;
    if (!candidate) return;
    try {
      watcher = watch(candidate, { persistent: false }, (_event, filename) => {
        if (detached || watchedDir !== candidate) return;
        const name = filename?.toString();
        const currentPlanPath = context.meta['plan.path'];
        const currentTaskPath = context.meta['task.path'];
        const planName = typeof currentPlanPath === 'string' ? basename(currentPlanPath) : '';
        const taskName = typeof currentTaskPath === 'string' ? basename(currentTaskPath) : '';
        if (name && name !== planName && name !== taskName) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fireAndForget('refresh-files', refreshFiles()), 60);
      });
      watcher.on('error', () => watcher?.close());
    } catch {
      watcher = null;
      watchedDir = '';
    }
  };

  const unsubscribe = context.state.onChange((change) => {
    if (detached) return;
    if (change.kind === 'todos_replaced' && !suppressedTodoMirrors.has(context)) {
      const snapshot = change.completedSnapshot ?? change.todos;
      const unbound = todosNeedingSessionMirror(snapshot, activeManagedBoardId());
      if (snapshot.length > 0 && unbound.length === 0) return;
      mirrorSessionTodosToKanban(context.projectRoot, unbound, sessionId());
      return;
    }
    if (
      change.kind === 'meta_set' &&
      (change.key === 'plan.path' || change.key === 'task.path' || change.key === 'kanban')
    ) {
      syncActiveSessionRegistration();
      configureWatcher();
      if (!activeManagedBoardId()) {
        fireAndForget('ensure-board', ensureSessionKanbanBoard(context.projectRoot, sessionId()));
      }
      fireAndForget('configure-watcher', configureBoardWatcher());
      fireAndForget('refresh-board', refreshBoard());
      fireAndForget('refresh-files', refreshFiles());
    }
  });

  configureWatcher();
  fireAndForget('configure-watcher', configureBoardWatcher());

  const detach = () => {
    if (detached) return;
    detached = true;
    watcherGeneration++;
    unsubscribe();
    if (timer) clearTimeout(timer);
    watcher?.close();
    stopBoardWatcher();
    bindings.delete(context);
    if (attachedProjectRoot && registeredSessionId) {
      releaseActiveSessionBoard(attachedProjectRoot, registeredSessionId);
      fireAndForget(
        'cleanup-board',
        cleanupSessionKanbanBoardIfEmpty(attachedProjectRoot, registeredSessionId),
      );
      registeredSessionId = '';
    }
  };
  bindings.set(context, detach);
  return detach;
}

export async function rebindSessionKanbanTask(
  context: Context,
): Promise<{ boardId: string; taskId: string } | null> {
  const sessionId = context.session?.id;
  if (!sessionId || !context.projectRoot) return null;
  if (context.currentKanbanTaskId) return null;
  const projectRoot = context.projectRoot;
  const initialBoardId = context.currentKanbanBoardId;

  let best: { boardId: string; taskId: string; lastSeenAt: string } | undefined;
  try {
    const snapshot = await getKanbanOrchestrationSnapshot(projectRoot);
    const nowMs = Date.now();
    for (const result of snapshot.running) {
      const assignment = result.task.assignment;
      if (assignment?.status !== 'running') continue;
      const expiresAt = assignment.leaseExpiresAt
        ? Date.parse(assignment.leaseExpiresAt)
        : Number.NaN;
      if (Number.isFinite(expiresAt) && expiresAt <= nowMs) continue;
      const entry = result.board.presence?.find(
        (candidate) => candidate.sessionId === sessionId && candidate.taskId === result.task.id,
      );
      if (!entry) continue;
      if (!best || entry.lastSeenAt > best.lastSeenAt) {
        best = { boardId: result.board.id, taskId: result.task.id, lastSeenAt: entry.lastSeenAt };
      }
    }
  } catch {
    return null;
  }
  if (!best) return null;
  if (
    context.session?.id !== sessionId ||
    context.projectRoot !== projectRoot ||
    context.currentKanbanTaskId ||
    context.currentKanbanBoardId !== initialBoardId
  )
    return null;
  context.setCurrentKanbanTask?.(best.taskId, best.boardId);
  return { boardId: best.boardId, taskId: best.taskId };
}

let degradationReason: string | undefined;

export function sessionKanbanDegradation(): string | undefined {
  return degradationReason;
}

export async function hydrateSessionKanban(context: Context): Promise<KanbanBoard | null> {
  const id = context.session?.id ?? '';
  if (!id) return null;
  try {
    const board = await hydrateSessionKanbanBoard(context, id);
    degradationReason = undefined;
    return board;
  } catch (error) {
    degradationReason = error instanceof Error ? error.message : String(error);
    fireAndForget('hydrate', Promise.reject(error));
    return null;
  }
}

async function hydrateSessionKanbanBoard(
  context: Context,
  id: string,
): Promise<KanbanBoard | null> {
  await rebindSessionKanbanTask(context);
  await cleanupEmptySessionKanbanBoards(context.projectRoot, id);
  if (context.projectRoot) {
    fireAndForget('prune-session-boards', pruneSessionBoards(context.projectRoot));
  }
  let board = await ensureSessionKanbanBoard(context.projectRoot, id);
  if (context.todos?.length) {
    board = await projectSessionTodosToKanban(context.projectRoot, context.todos, id);
  }
  const planPath = context.meta?.['plan.path'];
  if (typeof planPath === 'string' && planPath) {
    const plan = await loadPlan(planPath);
    if (plan) board = await projectSessionPlanToKanban(context.projectRoot, plan.items, id);
  }
  const taskPath = context.meta?.['task.path'];
  if (typeof taskPath === 'string' && taskPath) {
    const tasks = await loadTasks(taskPath);
    if (tasks) board = await projectSessionTasksToKanban(context.projectRoot, tasks.tasks, id);
  }
  return board;
}

export function applySessionKanbanBoardToTodos(context: Context, board: KanbanBoard): TodoItem[] {
  return applySessionKanbanBoardToTodosSync(context, board, {
    sessionIdFromTags,
    isOwnedSessionBoard,
    hasInFlightTodoMirror,
    suppressedTodoMirrors,
  });
}

export function applyManagedKanbanBoardToTodos(
  context: Context,
  board: KanbanBoard,
  sourceTodos: readonly TodoItem[] = context.todos,
): TodoItem[] {
  return applyManagedKanbanBoardToTodosSync(context, board, suppressedTodoMirrors, {
    sessionOwnerFromTags: sessionIdFromTags,
    sourceTodos,
  });
}

export function applySessionKanbanTaskToSource(
  context: Context,
  task: KanbanTask,
  options: { remove?: boolean | undefined } = {},
): Promise<SessionKanbanSourceUpdate> {
  return applySessionKanbanTaskToSourceSync(context, task, suppressedTodoMirrors, options);
}
