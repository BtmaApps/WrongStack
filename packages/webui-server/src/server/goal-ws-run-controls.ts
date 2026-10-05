import {
  GoalRunLeaseBusyError,
  type GoalRunPersistence,
  type PhaseGraph,
  type PhaseOrchestrator,
  type PhaseStore,
  prepareGoalGraphForResume,
} from '@wrongstack/core/goal';
import { toErrorMessage } from '@wrongstack/core/utils';
import { WorktreeManager } from '@wrongstack/core/worktree';
import { isGitWorkTree } from './git-process.js';
import { commitsSince } from './goal-ws-run-controls-contracts.js';
export interface GoalWsRunControlsHost {
  startInFlight: boolean;
  orchestrator: PhaseOrchestrator | null;
  stopping: boolean;
  runPromise: Promise<void> | null;
  broadcast(msg: { type: string; payload: unknown }): void;
  runStatus: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped';
  releaseRunLease: (() => Promise<void>) | null;
  store: PhaseStore;
  startRun(payload?: Record<string, unknown>, resumeGraph?: PhaseGraph): Promise<void>;
  releaseActiveRunLease(): Promise<void>;
  graph: PhaseGraph | null;
  projectRoot: string | undefined;
  broadcastState(activePhaseId?: string): void;
  abort: AbortController | null;
  assessAbort: AbortController | null;
  stopBroadcast(): void;
  persistence: GoalRunPersistence;
  handleStop(): Promise<void>;
  worktrees: WorktreeManager | null;
  runBase: { branch: string; sha: string } | null;
  usedNicknames: Set<string>;
  buildState(activePhaseId?: string): Record<string, unknown>;
}

export async function handleStart(
  host: GoalWsRunControlsHost,
  payload?: Record<string, unknown>,
): Promise<void> {
  if (host.startInFlight || host.orchestrator?.isRunning() || (host.stopping && host.runPromise)) {
    host.broadcast({
      type: 'goal.error',
      payload: { message: 'A Goal run is already in progress. Stop it before starting another.' },
    });
    return;
  }
  host.startInFlight = true;
  // Cleared here, before the first await, not in startRun: a stop that lands
  // while the lease is being acquired must still be seen by startRun.
  host.stopping = false;
  host.runStatus = 'running';
  try {
    host.releaseRunLease = await host.store.acquireRunLease(
      `webui:${process.pid}:${crypto.randomUUID()}`,
    );
    await host.startRun(payload);
  } catch (err) {
    host.runStatus = 'failed';
    host.broadcast({
      type: 'goal.error',
      payload: {
        message:
          err instanceof GoalRunLeaseBusyError
            ? err.message
            : `Goal start failed: ${toErrorMessage(err)}`,
      },
    });
  } finally {
    host.startInFlight = false;
    if (!host.orchestrator) await host.releaseActiveRunLease();
  }
}

export async function handleResumeGraph(
  host: GoalWsRunControlsHost,
  graphId: string,
): Promise<void> {
  if (
    host.startInFlight ||
    host.runStatus === 'running' ||
    host.runStatus === 'paused' ||
    (host.stopping && host.runPromise)
  ) {
    host.broadcast({
      type: 'goal.error',
      payload: { message: 'Stop the active Goal run before resuming a saved board.' },
    });
    return;
  }
  host.startInFlight = true;
  host.stopping = false;
  let releaseRunLease: (() => Promise<void>) | undefined;
  try {
    releaseRunLease = await host.store.acquireRunLease(
      `webui-resume:${process.pid}:${crypto.randomUUID()}`,
    );
    const graph = host.graph?.id === graphId ? host.graph : await host.store.load(graphId);
    if (!graph) throw new Error(`Saved Goal not found: ${graphId}`);
    if (host.stopping) return;
    const worktrees =
      graph.worktrees !== false && host.projectRoot && (await isGitWorkTree(host.projectRoot))
        ? new WorktreeManager({ projectRoot: host.projectRoot })
        : undefined;
    await prepareGoalGraphForResume(graph, worktrees);
    host.graph = graph;
    host.orchestrator = null;
    host.runStatus = 'running';
    host.releaseRunLease = releaseRunLease;
    releaseRunLease = undefined;
    await host.startRun(undefined, graph);
    if (!host.stopping && host.orchestrator) {
      host.broadcast({ type: 'goal.resumed', payload: { graphId: graph.id } });
      host.broadcastState();
    }
  } catch (err) {
    host.runStatus = host.graph ? 'stopped' : 'idle';
    host.abort = null;
    host.broadcast({
      type: 'goal.error',
      payload: {
        message:
          err instanceof GoalRunLeaseBusyError
            ? err.message
            : `Goal resume failed: ${toErrorMessage(err)}`,
      },
    });
    await host.releaseActiveRunLease();
  } finally {
    host.startInFlight = false;
    await releaseRunLease?.();
    // startRun returned without launching (stopped mid-setup): the lease
    // handed to this.releaseRunLease above is not the run's to keep.
    if (!host.orchestrator) await host.releaseActiveRunLease();
  }
}

export async function handleStop(host: GoalWsRunControlsHost): Promise<void> {
  host.stopping = true;
  host.abort?.abort();
  host.assessAbort?.abort();
  host.assessAbort = null;
  const orchestrator = host.orchestrator;
  const runPromise = host.runPromise;
  orchestrator?.stop();
  host.orchestrator = null;
  host.runStatus = 'stopped';
  host.stopBroadcast();
  await runPromise?.catch(() => undefined);
  if (host.graph) await host.persistence.save(host.graph).catch(() => undefined);
  if (host.runPromise === runPromise) host.runPromise = null;
  host.abort = null;
  await host.releaseActiveRunLease();
  host.broadcast({ type: 'goal.stopped', payload: { title: host.graph?.title } });
}

export async function handleClear(host: GoalWsRunControlsHost): Promise<void> {
  await host.handleStop();
  if (host.worktrees) await host.worktrees.cleanupAllManaged().catch(() => undefined);
  host.orchestrator = null;
  host.graph = null;
  host.runStatus = 'idle';
  host.runBase = null;
  host.usedNicknames.clear();
  host.broadcast({ type: 'goal.cleared', payload: {} });
  // Empty state → board/wizard falls back to the goal-entry screen.
  host.broadcast({ type: 'goal.state', payload: host.buildState() });
}

export async function handleRevert(host: GoalWsRunControlsHost): Promise<void> {
  await host.handleStop();
  if (!host.worktrees || !host.runBase || !host.projectRoot) {
    host.broadcast({
      type: 'goal.reverted',
      payload: { ok: false, reverted: 0, reason: 'no git baseline was captured for this run' },
    });
    return;
  }
  await host.worktrees.cleanupAllManaged().catch(() => undefined);
  const shas = await commitsSince(host.projectRoot, host.runBase.sha, host.runBase.branch);
  const res = await host.worktrees.revertCommits(host.runBase.branch, shas);
  host.broadcast({ type: 'goal.reverted', payload: res });
  if (res.ok) {
    host.orchestrator = null;
    host.graph = null;
    host.runStatus = 'idle';
    host.runBase = null;
    host.broadcast({ type: 'goal.cleared', payload: {} });
    host.broadcast({ type: 'goal.state', payload: host.buildState() });
  }
}
