/**
 * SddParallelRun
 *
 * Drives a TaskGraph through ParallelEternalEngine's infrastructure
 * (DefaultMultiAgentCoordinator + AgentSubagentRunner) but powered by
 * SddTaskDecomposer — producing dependency-aware waves instead of
 * goal-driven iterations.
 *
 * One-shot: completes when all tasks are done OR a deadlock is detected.
 * Does NOT loop — each run() call is a discrete execution.
 *
 * Usage:
 * ```
 * const run = new SddParallelRun({ tracker, graph, agent, projectRoot });
 * await run.run({ onWave });
 * // or with progress callback:
 * await run.run({ onProgress: (p) => console.log(renderProgress(p)) });
 * ```
 */
import { randomUUID } from 'node:crypto';
import type { AgentFactory } from '@wrongstack/core/coordination';
import {
  DefaultMultiAgentCoordinator,
  makeAgentSubagentRunner,
  withDisabledToolFiltering,
} from '@wrongstack/core/coordination';
import type { EventBus } from '@wrongstack/core/kernel';
import type { TaskTracker } from '@wrongstack/core/tasking';
import type {
  MultiAgentConfig,
  SubagentConfig,
  TaskNode,
  TaskResult,
} from '@wrongstack/core/types';
import type { WorktreeHandle } from '@wrongstack/core/worktree';
import { requireSessionId } from '@wrongstack/primitives';
import {
  cancelTask as cancelTaskFromHost,
  cleanupWorktrees as cleanupWorktreesFromHost,
  deleteTask as deleteTaskFromHost,
  reassignTask as reassignTaskFromHost,
  retryTask as retryTaskFromHost,
  rollback as rollbackFromHost,
  type SddParallelControlsHost,
  setTaskFallbacks as setTaskFallbacksFromHost,
  setTaskModel as setTaskModelFromHost,
  setTaskVerification as setTaskVerificationFromHost,
  splitTask as splitTaskFromHost,
} from './sdd-parallel-controls.js';
import type {
  RunResult,
  SddParallelRunOptions,
  SddProgress,
  SddSubtaskSpec,
  TaskOutcome,
  WaveResult,
} from './sdd-parallel-run-types.js';
import { SddTaskDecomposer, type TaskBatch } from './sdd-task-decomposer.js';
import type { SddTaskDispatchHost } from './sdd-task-dispatch.js';
import {
  applyTaskFailure as applyTaskFailureFromHost,
  executeOne as executeOneFromHost,
  executeWave as executeWaveFromHost,
  trySupervisorRescue as trySupervisorRescueFromHost,
} from './sdd-task-dispatch.js';
import {
  computeDeadlockChains as delegateComputeDeadlockChains,
  recoverFailedBlockers as delegateRecoverFailedBlockers,
  requeueFailedTasks as delegateRequeueFailedTasks,
  resetOrphans as delegateResetOrphans,
  restoreRetryMap as delegateRestoreRetryMap,
  type SddTaskRecoveryHost,
} from './sdd-task-recovery.js';
import {
  allocateTaskWorktrees,
  forgetTaskWorktree,
  integrateTaskWorktree,
  resolveTaskWorktrees,
} from './sdd-worktree-integration.js';

export type {
  RunResult,
  SddParallelRunOptions,
  SddProgress,
  SddSubtaskSpec,
  SddSupervisorVerdict,
  WaveResult,
} from './sdd-parallel-run-types.js';
export class SddParallelRun {
  private readonly slots: number;
  /** Opt-in hard wall-clock cap (undefined → no cap; idle reaper guards instead). */
  private readonly timeoutMs: number | undefined;
  /** Idle reaper window (ms) — resets on activity; reaps only a genuine stall. */
  private readonly idleTimeoutMs: number;
  private readonly maxRetries: number;
  /** Max supervisor rescues per task before it must terminal-fail (loop guard). */
  private readonly maxSupervisorEscalations: number;
  /** Per-task count of supervisor rescues used (resets nothing — bounds the loop). */
  private supervisorEscalations = new Map<string, number>();
  /** Max end-of-run failed-task sweeps (see `maxFailedRetrySweeps`). */
  private readonly maxFailedSweeps: number;
  /** How many failed-task sweeps have run this `run()` so far. */
  private failedSweeps = 0;
  /** Completed-count snapshot at the last sweep, to detect a no-progress sweep. */
  private lastSweepCompleted = 0;
  private decomposer: SddTaskDecomposer;
  private coordinator: DefaultMultiAgentCoordinator | null = null;
  private stopRequested = false;
  private retryMap = new Map<string, number>();
  readonly runId: string;
  private readonly events?: EventBus | undefined;
  private readonly sessionIdSource: string | (() => string | undefined) | undefined;
  private readonly maxTotalWaves: number;
  private readonly maxWallClockMs?: number | undefined;
  private readonly maxRecoveryRounds: number;
  private recoveryRounds = 0;
  /** Per-run worker identities, so the board shows "who is on what". */
  private usedNicknames = new Set<string>();
  /** Per-task git worktree cwd (Layer 2 worktree isolation; empty otherwise). */
  private taskCwds = new Map<string, string>();
  /** Per-task git worktree branch, for board display. */
  private taskBranches = new Map<string, string>();
  /** Live worktree handles keyed by task id (for commit/merge/release). */
  private taskWorktrees = new Map<string, WorktreeHandle>();
  /** Live subagent id per running task — lets cancelTask() abort exactly one. */
  private taskSubagents = new Map<string, string>();
  /** Tasks the user cancelled mid-flight — skip retry, mark terminal-cancelled. */
  private cancelledTasks = new Set<string>();
  /**
   * Base branch the run's squash commits land on (captured once at start when
   * worktrees are enabled). Anchors a later `rollback()`.
   */
  private baseBranch: string | undefined;
  /**
   * Squash-merge commits this run landed on the base branch, in landing order.
   * `rollback()` reverts these (newest → oldest). Persisted via the board
   * snapshot so a post-run rollback can read them off disk.
   */
  private mergedCommits: Array<{ taskId: string; sha: string; title: string }> = [];
  /**
   * Fatal, non-recoverable run error — set together with `stopRequested` when
   * the run hard-stops (e.g. a known-invalid merge that could not be rolled
   * back). Surfaced on `run()`'s result so the caller can see WHY it stopped.
   */
  private fatalError: string | undefined;
  /** Monotonic dispatch counter (unique subagent ids) + dispatch-round counter. */
  private dispatchSeq = 0;
  private round = 0;
  /**
   * True once `run()` has returned. A FINISHED run is not "running" even when
   * the graph is left unsettled (deadlock exit): `isRunning()` gates
   * `cleanupWorktrees()` / `rollback()` / the Ctrl+C ladders, and a returned
   * run kept reporting live, silently no-oping cleanup and refusing rollback
   * with "run still active" until the user called `stop()` on a run that had
   * already ended. Cleared again at the top of `run()` so a re-run re-arms.
   */
  private runReturned = false;

  constructor(private readonly opts: SddParallelRunOptions) {
    this.slots = Math.min(16, Math.max(1, opts.parallelSlots ?? 2));
    // Wall-clock cap is OPT-IN (undefined → none). The idle reaper is the
    // default guard: it resets on every activity signal so a productive task
    // is never killed for running long — only a genuine stall is reaped.
    this.timeoutMs = opts.taskTimeoutMs;
    this.idleTimeoutMs = Math.max(1, opts.taskIdleTimeoutMs ?? 600_000);
    this.maxRetries = Math.max(0, opts.maxRetries ?? 3);
    this.maxSupervisorEscalations = Math.max(0, opts.maxSupervisorEscalations ?? 2);
    this.maxFailedSweeps = Math.max(0, opts.maxFailedRetrySweeps ?? 2);
    this.runId = opts.runId ?? `sdd-${randomUUID().slice(0, 8)}`;
    this.events = opts.events;
    this.sessionIdSource = opts.sessionId;
    // Backstop: even with retries + recovery the loop must terminate. Derive a
    // generous ceiling from the graph size unless the caller pins one.
    this.maxTotalWaves = opts.maxTotalWaves ?? opts.graph.nodes.size * (this.maxRetries + 2) + 10;
    this.maxWallClockMs = opts.maxWallClockMs;
    this.maxRecoveryRounds = Math.max(0, opts.maxRecoveryRounds ?? 0);
    this.decomposer = new SddTaskDecomposer(opts.tracker, opts.graph, {
      parallelSlots: this.slots,
    });
  }

  /** Type-safe emit on the optional EventBus (no-op when unwired). */
  private emit<K extends keyof import('@wrongstack/core/kernel').EventMap>(
    event: K,
    payload: import('@wrongstack/core/kernel').EventMap[K],
  ): void {
    const sessionId = this.currentSessionId();
    this.events?.emit(event, {
      ...payload,
      sessionId,
    } as import('@wrongstack/core/kernel').EventMap[K]);
  }

  private currentSessionId(): string {
    const value =
      typeof this.sessionIdSource === 'function' ? this.sessionIdSource() : this.sessionIdSource;
    return requireSessionId(value, 'SDD session operation');
  }

  // -------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------

  private paused = false;
  /** Resolvers for tasks parked in `waitWhilePaused`, woken on resume/stop. */
  private pausedWaiters = new Set<() => void>();

  private notifyPausedWaiters(): void {
    for (const resolve of this.pausedWaiters) resolve();
    this.pausedWaiters.clear();
  }

  /** Trigger stop — causes run() to abort after the current wave. */
  stop(): void {
    this.stopRequested = true;
    this.paused = false;
    this.notifyPausedWaiters();
    this.coordinator?.stopAll();
  }

  /** Pause: no new wave starts until resume() (the current wave finishes). */
  pause(): void {
    this.paused = true;
  }
  resume(): void {
    this.paused = false;
    this.notifyPausedWaiters();
  }
  isPaused(): boolean {
    return this.paused;
  }
  isRunning(): boolean {
    return !this.stopRequested && !this.runReturned && !this.decomposer.isSettled();
  }

  /** Base branch the run's squash commits land on (undefined when worktrees off). */
  getBaseBranch(): string | undefined {
    return this.baseBranch;
  }

  /** Squash commits this run landed on the base branch, in landing order. */
  getMergedCommits(): ReadonlyArray<{ taskId: string; sha: string; title: string }> {
    return this.mergedCommits;
  }

  /**
   * Remove every git worktree + branch this run (and any prior run) created.
   * Refuses while the run is still live — cleaning a checkout under an active
   * worker would corrupt it. Stop first. Returns the number of worktrees removed
   * (0 when worktrees are disabled). Idempotent.
   */
  async cleanupWorktrees(): Promise<number> {
    return cleanupWorktreesFromHost(this.sddParallelControlsHost());
  }

  /**
   * Undo the run's merged commits by reverting each on the base branch (history
   * preserving). Refuses while the run is still live (stop first). Returns the
   * revert outcome; a dirty tree or revert conflict surfaces as `ok:false`.
   */
  async rollback(): Promise<{ ok: boolean; reverted: number; reason?: string }> {
    return rollbackFromHost(this.sddParallelControlsHost());
  }

  /** Requeue a task to `pending` so the scheduler re-runs it (clears retries + cancel marker). */
  retryTask(taskId: string): boolean {
    return retryTaskFromHost(this.sddParallelControlsHost(), taskId);
  }

  /** Reassign a task to a specific agent name (reflected on the board). */
  reassignTask(taskId: string, agentName: string): boolean {
    return reassignTaskFromHost(this.sddParallelControlsHost(), taskId, agentName);
  }

  /**
   * Set/override a task's worker model (and optionally provider) — applied on its
   * NEXT dispatch (a running task must be cancelled + retried to take effect). The
   * assignment lives on node metadata so it survives crash → resume.
   */
  setTaskModel(taskId: string, model: string | undefined, provider?: string | undefined): boolean {
    return setTaskModelFromHost(this.sddParallelControlsHost(), taskId, model, provider);
  }

  /** Set/override a task's fallback model chain (applied on its next dispatch). */
  setTaskFallbacks(taskId: string, fallbackModels: string[] | undefined): boolean {
    return setTaskFallbacksFromHost(this.sddParallelControlsHost(), taskId, fallbackModels);
  }

  /**
   * Set/override a task's verification command (the completion gate runs it in
   * the task's cwd and only lets the task complete on exit 0). Empty/undefined
   * clears it. Applied on the task's next verification — i.e. its next dispatch.
   */
  setTaskVerification(taskId: string, verificationCommand: string | undefined): boolean {
    return setTaskVerificationFromHost(this.sddParallelControlsHost(), taskId, verificationCommand);
  }

  /**
   * Cancel a task. If it is currently running, abort its subagent and mark the
   * node terminally failed+cancelled (so the scheduler frees the slot and does
   * NOT retry it). If it has not started, it is simply marked cancelled. Use
   * `retryTask` to bring a cancelled task back. Returns false for an unknown task.
   */
  async cancelTask(taskId: string): Promise<boolean> {
    return cancelTaskFromHost(this.sddParallelControlsHost(), taskId);
  }

  /**
   * Delete a not-yet-started task from the graph (pending/blocked/failed only —
   * never a running task; cancel it first). Removes the node and every edge
   * touching it; dependents lose this blocker. Returns false if missing or running.
   */
  deleteTask(taskId: string): boolean {
    return deleteTaskFromHost(this.sddParallelControlsHost(), taskId);
  }

  /**
   * Split a task into sub-tasks and delegate them to separate workers. The new
   * leaves inherit the parent's blockers (so they don't start before the
   * parent's dependencies are met), every existing dependent is rewired to
   * depend on ALL leaves (so downstream work waits for the whole split), and the
   * parent becomes a `completed` container. Refuses a running task (cancel it
   * first) or empty subtask list. Returns the new leaf ids (empty on refusal).
   * The scheduler picks the new pending leaves up on its next dispatch pass.
   */
  splitTask(taskId: string, subtasks: SddSubtaskSpec[]): string[] {
    return splitTaskFromHost(this.sddParallelControlsHost(), taskId, subtasks);
  }

  private async waitWhilePaused(): Promise<void> {
    // Event-driven instead of polling: park on a promise that `resume()` and
    // `stop()` resolve, so a paused run consumes zero CPU while waiting (the
    // old 100ms poll woke the loop 10×/s for nothing). A bounded fallback
    // timer guarantees progress even if a notifier is missed.
    while (this.paused && !this.stopRequested) {
      await new Promise<void>((resolve) => {
        this.pausedWaiters.add(resolve);
        const safety = setTimeout(() => {
          if (this.pausedWaiters.delete(resolve)) resolve();
        }, 1000);
        safety.unref?.();
      });
    }
  }

  /**
   * Continuous dependency-driven execution. Unlike a wave-barrier loop (where a
   * whole batch must finish before the next starts), this fills free worker
   * slots the instant a task's dependencies are satisfied: a fast task's
   * dependent starts immediately rather than waiting for a slow sibling. Truly
   * independent tasks run in parallel; dependency chains run in order. Returns
   * the final summary when the graph settles, deadlocks, stops, or hits a backstop.
   */
  async run(): Promise<RunResult> {
    this.stopRequested = false;
    this.fatalError = undefined;
    this.restoreRetryMap();
    const startTime = Date.now();
    this.round = 0;
    this.dispatchSeq = 0;
    this.runReturned = false; // re-arm: a new run() call is live again
    let totalDispatched = 0;

    this.buildCoordinator();

    // Capture the base branch once so a later rollback knows where the run's
    // squash commits landed (worktree path only; no-op without a manager).
    if (this.opts.worktrees && !this.baseBranch) {
      const base = await this.opts.worktrees.currentBase().catch(() => null);
      if (base) this.baseBranch = base.branch;
    }

    this.emit('sdd.run.started', {
      runId: this.runId,
      graphId: this.opts.graph.id,
      specId: this.opts.graph.specId,
      total: this.opts.graph.nodes.size,
      baseBranch: this.baseBranch,
    });

    this.recoveryRounds = 0;
    this.failedSweeps = 0;
    this.lastSweepCompleted = 0;
    let deadlocked = false;
    // node id → in-flight executeOne promise. size = live worker count.
    const running = new Map<string, Promise<TaskOutcome>>();

    const dispatch = (task: TaskNode): void => {
      totalDispatched++;
      const tracked = (async (): Promise<TaskOutcome> => {
        try {
          return await this.executeOne(task);
        } catch (err) {
          // A dispatch-time throw must not wedge the scheduler: mark the node
          // terminally failed (frees its dependents per failed-blocker rules).
          this.opts.tracker.updateNodeStatus(task.id, 'failed', `dispatch error: ${String(err)}`);
          this.emit('sdd.task.failed', {
            runId: this.runId,
            taskId: task.id,
            subagentId: '',
            error: String(err),
          });
          return { taskId: task.id, success: false };
        } finally {
          running.delete(task.id);
        }
      })();
      running.set(task.id, tracked);
    };

    while (!this.stopRequested) {
      // Run-level backstops — an autonomous run must always terminate.
      if (totalDispatched >= this.maxTotalWaves) {
        // The dispatch ceiling stops new work, not the promises already
        // handed to workers. Drain them before reporting run completion.
        await Promise.allSettled(running.values());
        break;
      }
      if (this.maxWallClockMs && Date.now() - startTime >= this.maxWallClockMs) {
        // A wall-clock cap must cancel active workers and use the same bounded
        // teardown path as an explicit stop instead of abandoning in-flight work.
        this.stop();
        break;
      }

      await this.waitWhilePaused();
      if (this.stopRequested) break;

      // Fill free slots with ready (dependency-satisfied) tasks not already running.
      let dispatchedThisRound = 0;
      const ready = this.decomposer.readyNodes().filter((t) => !running.has(t.id));
      for (const task of ready) {
        if (running.size >= this.slots || totalDispatched >= this.maxTotalWaves) break;
        dispatch(task);
        dispatchedThisRound++;
      }
      if (dispatchedThisRound > 0) {
        this.emit('sdd.wave', {
          runId: this.runId,
          wave: this.round,
          batchSize: dispatchedThisRound,
        });
        this.round++;
      }

      if (running.size === 0) {
        // Nothing in flight and nothing dispatched this pass.
        if (this.decomposer.isSettled()) {
          // End-of-run failed-task sweep: requeue every terminal-failed
          // (non-cancelled) task and run them again, bounded by
          // maxFailedSweeps. Stop early once a sweep yields no new completions
          // (no progress) so a hopeless task can't spin the loop forever.
          const completed = this.opts.tracker.getProgress().completed;
          const madeProgress = this.failedSweeps === 0 || completed > this.lastSweepCompleted;
          if (
            this.failedSweeps < this.maxFailedSweeps &&
            madeProgress &&
            this.requeueFailedTasks() > 0
          ) {
            this.lastSweepCompleted = completed;
            this.failedSweeps++;
            continue;
          }
          break;
        }
        const chains = this.computeDeadlockChains();
        if (chains.length > 0) {
          this.emit('sdd.deadlock', { runId: this.runId, chains });
          if (this.recoveryRounds < this.maxRecoveryRounds && this.recoverFailedBlockers()) {
            this.recoveryRounds++;
            continue;
          }
          deadlocked = true;
        }
        // No running, no ready, no recoverable deadlock → no further progress.
        break;
      }

      // If we still have a free slot AND a ready task, loop to dispatch it now;
      // otherwise wait for any in-flight task to settle (which may unblock more).
      const moreReadyNow =
        running.size < this.slots && this.decomposer.readyNodes().some((t) => !running.has(t.id));
      if (!moreReadyNow) {
        await Promise.race(running.values());
        this.opts.onProgress?.(this.buildProgress());
      }
    }

    // Clean teardown on stop: interrupted tasks reset, worktrees released.
    if (this.stopRequested) {
      await Promise.allSettled(running.values());
      await this.teardown();
    }

    const finalProgress = this.opts.tracker.getProgress();

    this.emit('sdd.run.finished', {
      runId: this.runId,
      deadlocked,
      completed: finalProgress.completed,
      failed: finalProgress.failed,
      stopped: this.stopRequested,
      ...(this.fatalError ? { fatalError: this.fatalError } : {}),
    });

    // The run has finished — release the liveness gate even when the graph is
    // left unsettled (deadlock exit), so cleanupWorktrees()/rollback() and the
    // host's Ctrl+C ladders stop treating the returned run as live.
    this.runReturned = true;
    return {
      totalWaves: this.round,
      totalCompleted: finalProgress.completed,
      totalFailed: finalProgress.failed,
      totalDurationMs: Date.now() - startTime,
      deadlocked,
      stopRequested: this.stopRequested,
      ...(this.fatalError ? { fatalError: this.fatalError } : {}),
      finalProgress,
    };
  }

  /**
   * Compute the blocking chains for a deadlock: every still-incomplete task and
   * the blockers (by node id) that are NOT completed. Failed blockers are
   * included since they're the usual deadlock cause once retries are exhausted.
   */
  private computeDeadlockChains(): Array<{ blocked: string; blockedBy: string[] }> {
    return delegateComputeDeadlockChains(this.sddTaskRecoveryHost());
  }

  /** Requeue failed tasks that block an incomplete dependent. Returns true if any. */
  private recoverFailedBlockers(): boolean {
    return delegateRecoverFailedBlockers(this.sddTaskRecoveryHost());
  }

  /**
   * Requeue every terminal-failed task that the user did NOT cancel, giving each
   * a fresh `maxRetries` budget. Shared by the automatic end-of-run sweep and
   * the manual "retry all failed" control. Returns the number requeued.
   */
  private requeueFailedTasks(reason = 'retry failed sweep'): number {
    return delegateRequeueFailedTasks(this.sddTaskRecoveryHost(), reason);
  }

  /**
   * Manually requeue all failed tasks to `pending` (board "Retry all failed").
   * Unlike the automatic sweep this also clears any `cancelled` marker, so a
   * user can bring cancelled tasks back in the same action — mirroring
   * `retryTask`. Picked up by the running scheduler on its next dispatch pass.
   * Returns the number of tasks requeued.
   */
  retryAllFailed(): number {
    const failed = this.opts.tracker.getAllNodes({ status: ['failed'] });
    for (const node of failed) {
      this.cancelledTasks.delete(node.id);
      this.opts.tracker.patchMetadata(node.id, { cancelled: undefined });
    }
    return this.requeueFailedTasks('manual retry all');
  }

  /** Restore per-task retry counts persisted in node metadata (resume support). */
  private restoreRetryMap(): void {
    delegateRestoreRetryMap(this.sddTaskRecoveryHost());
  }

  /**
   * Reset orphaned `in_progress` tasks (no agent runs them after a crash) back
   * to `pending` so a fresh run re-executes them. Call before constructing a run
   * from a reloaded graph. Static so callers don't need a run instance.
   */
  static resetOrphans(tracker: TaskTracker): number {
    return delegateResetOrphans(tracker);
  }

  /** Clean teardown after a stop: reset interrupted tasks + release worktrees. */
  private async teardown(): Promise<void> {
    for (const node of this.opts.tracker.getAllNodes({ status: ['in_progress'] })) {
      this.opts.tracker.updateNodeStatus(node.id, 'pending', 'run stopped');
    }
    const wt = this.opts.worktrees;
    if (wt) {
      for (const [taskId, handle] of [...this.taskWorktrees]) {
        await wt.release(handle, { keep: true }).catch(() => {});
        this.forgetWorktree(taskId);
      }
    }
  }

  /**
   * Hard-stop the run after an unrecoverable error: the base branch is in a
   * state no retry can fix (e.g. a known-invalid merge that could not be rolled
   * back), so continuing would contaminate every task forked after this point.
   * The reason is surfaced on `run()`'s result and the `sdd.run.finished` event.
   */
  private abortRun(reason: string): void {
    this.fatalError = reason;
    this.stopRequested = true;
    this.coordinator?.stopAll();
  }

  // -------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------

  private buildCoordinator(): void {
    const config: MultiAgentConfig = {
      coordinatorId: `sdd-parallel-${randomUUID().slice(0, 8)}`,
      maxConcurrent: this.slots,
      doneCondition: { type: 'all_tasks_done' },
      // Default budget guard for every spawned worker: idle reaper (resets on
      // activity) plus the opt-in wall-clock cap when one was configured. This
      // ensures the reaper applies even if a per-spawn config path is bypassed.
      defaultBudget: {
        idleTimeoutMs: this.idleTimeoutMs,
        ...(this.timeoutMs ? { timeoutMs: this.timeoutMs } : {}),
      },
    };
    this.coordinator = new DefaultMultiAgentCoordinator(config, {
      sessionId: () => this.currentSessionId(),
    });
    // Wrap factory with disabled tool filtering to prevent subagents from
    // using the delegate tool (or any other disabledTools in their config)
    const baseFactory = this.opts.subagentFactory ?? this.defaultFactory();
    const filteredFactory = withDisabledToolFiltering(baseFactory);
    const runner = makeAgentSubagentRunner({
      factory: filteredFactory,
      hostEvents: this.events,
    } as Parameters<typeof makeAgentSubagentRunner>[0] & { hostEvents?: EventBus });
    this.coordinator.setRunner?.(runner);
  }

  private defaultFactory(): AgentFactory {
    return async (_config: SubagentConfig) => ({
      agent: this.opts.agent,
      events: this.opts.agent.events,
    });
  }

  /**
   * Execute a batch of tasks together. Retained as a thin wrapper over the
   * single-task primitive `executeOne` so the wave-oriented tests and any
   * batch callers keep working; the continuous scheduler in `run()` calls
   * `executeOne` directly. Throws if no coordinator is wired or a spawn fails
   * (surfaced from `executeOne`), preserving the original all-or-nothing contract.
   */
  async executeWave(batch: TaskBatch): Promise<WaveResult> {
    return executeWaveFromHost.call(this.sddTaskDispatchHost(), batch);
  }

  /**
   * Execute one task end-to-end: assign a worker identity, allocate its worktree,
   * spawn + assign the subagent, await its result, then update tracker status
   * (success / retry / terminal-fail / cancelled) and resolve the worktree. This
   * is the unit the continuous scheduler dispatches into a free slot. Throws on a
   * missing coordinator or failed spawn so callers can enforce all-or-nothing.
   */
  async executeOne(task: TaskNode): Promise<TaskOutcome> {
    return executeOneFromHost.call(this.sddTaskDispatchHost(), task);
  }

  /**
   * Apply a task failure: retry (→ pending, bump retry count) while attempts
   * remain, else consult the optional supervisor (which can rescue via
   * retry/reassign/split), else terminal-fail (→ failed). Shared by the
   * worker-failure, verification-gate, and merge-conflict paths so all three
   * negotiate the same retry budget and emit the same events.
   */
  private async applyTaskFailure(
    taskId: string,
    subagentId: string,
    errMsg: string,
  ): Promise<void> {
    return applyTaskFailureFromHost.call(this.sddTaskDispatchHost(), taskId, subagentId, errMsg);
  }

  /**
   * Consult `superviseFailure` for a task that has exhausted its retries.
   * Applies the verdict (retry / reassign+retry / split) and returns true when
   * the task was rescued (caller must NOT terminal-fail it). Bounded per task by
   * `maxSupervisorEscalations` so an always-"retry" supervisor can't loop forever.
   */
  private async trySupervisorRescue(taskId: string, errMsg: string): Promise<boolean> {
    return trySupervisorRescueFromHost.call(this.sddTaskDispatchHost(), taskId, errMsg);
  }

  /**
   * Integrate a verified-successful task's worktree into the base branch.
   * Commits, squash-merges (optionally running `conflictResolver` first), and on
   * success releases the worktree. On an UNRESOLVED conflict it returns
   * `{ok:false}` with the conflicting files so the caller routes the task into
   * the failure path (a retry forks a fresh worktree off the now-advanced base,
   * which usually clears the conflict). No-op `{ok:true}` when worktrees are
   * disabled or none was allocated for this task. Never throws — a merge hiccup
   * degrades to a (retryable) failure rather than wedging the run.
   */
  private get worktreeState() {
    return {
      taskCwds: this.taskCwds,
      taskBranches: this.taskBranches,
      taskWorktrees: this.taskWorktrees,
      mergedCommits: this.mergedCommits,
    };
  }

  private async integrateWorktree(
    task: TaskNode,
    result?: TaskResult,
  ): Promise<{ ok: boolean; conflictFiles?: string[]; reason?: string; fatal?: boolean }> {
    return integrateTaskWorktree({
      opts: this.opts,
      state: this.worktreeState,
      task,
      result,
      runId: this.runId,
      emit: this.emit.bind(this),
      abortRun: this.abortRun.bind(this),
    });
  }

  /** Allocate a fresh git worktree per task in the batch (no-op without a manager). */
  private async allocateWorktrees(tasks: TaskNode[]): Promise<void> {
    await allocateTaskWorktrees(this.opts, this.worktreeState, tasks);
  }

  /**
   * Resolve each task's worktree after its result is known. Serialized merges
   * (one at a time) keep the base branch consistent; the wave structure already
   * guarantees dependency order (a task's blockers merged in an earlier wave).
   */
  private async resolveWorktrees(tasks: TaskNode[]): Promise<void> {
    await resolveTaskWorktrees(this.opts, this.worktreeState, tasks);
  }

  private forgetWorktree(taskId: string, opts: { keepBranchLabel?: boolean } = {}): void {
    forgetTaskWorktree(this.worktreeState, taskId, opts);
  }

  /** Persist a task's retry count into node metadata (survives crash → resume). */
  private persistRetries(taskId: string, retries: number): void {
    const node = this.opts.tracker.getNode(taskId);
    if (node) node.metadata = { ...node.metadata, retries };
  }

  private buildProgress(): SddProgress {
    const gp = this.opts.tracker.getProgress();
    const isDeadlocked = !this.decomposer.isDone() && this.decomposer.nextBatch().deadlocked;
    return {
      wave: this.decomposer.getWaveCount(),
      total: gp.total,
      completed: gp.completed,
      inProgress: gp.inProgress,
      failed: gp.failed,
      blocked: gp.blocked,
      pending: gp.pending,
      percent: gp.percentComplete,
      deadlocked: isDeadlocked,
    };
  }

  private sddTaskRecoveryHost(): SddTaskRecoveryHost {
    const self = this;
    return {
      opts: self.opts,
      get retryMap() {
        return self.retryMap;
      },
      persistRetries: (...args) => this.persistRetries(...args),
      get cancelledTasks() {
        return self.cancelledTasks;
      },
      emit: (...args) => this.emit(...args),
      runId: this.runId,
      maxRetries: this.maxRetries,
    };
  }

  private sddTaskDispatchHost(): SddTaskDispatchHost {
    // Preserve the owner's instance and check each member against the helper contract.
    void (this.executeOne satisfies SddTaskDispatchHost['executeOne']);
    void (this.stopRequested satisfies SddTaskDispatchHost['stopRequested']);
    void (this.opts satisfies SddTaskDispatchHost['opts']);
    void (this.coordinator satisfies SddTaskDispatchHost['coordinator']);
    void (this.usedNicknames satisfies SddTaskDispatchHost['usedNicknames']);
    void (this.idleTimeoutMs satisfies SddTaskDispatchHost['idleTimeoutMs']);
    void (this.timeoutMs satisfies SddTaskDispatchHost['timeoutMs']);
    void (this.runId satisfies SddTaskDispatchHost['runId']);
    void (this.dispatchSeq satisfies SddTaskDispatchHost['dispatchSeq']);
    void (this.emit satisfies SddTaskDispatchHost['emit']);
    void (this.taskCwds satisfies SddTaskDispatchHost['taskCwds']);
    void (this.taskBranches satisfies SddTaskDispatchHost['taskBranches']);
    void (this.taskSubagents satisfies SddTaskDispatchHost['taskSubagents']);
    void (this.cancelledTasks satisfies SddTaskDispatchHost['cancelledTasks']);
    void (this.allocateWorktrees satisfies SddTaskDispatchHost['allocateWorktrees']);
    void (this.resolveWorktrees satisfies SddTaskDispatchHost['resolveWorktrees']);
    void (this.integrateWorktree satisfies SddTaskDispatchHost['integrateWorktree']);
    void (this.applyTaskFailure satisfies SddTaskDispatchHost['applyTaskFailure']);
    void (this.retryMap satisfies SddTaskDispatchHost['retryMap']);
    void (this.persistRetries satisfies SddTaskDispatchHost['persistRetries']);
    void (this.maxRetries satisfies SddTaskDispatchHost['maxRetries']);
    void (this.trySupervisorRescue satisfies SddTaskDispatchHost['trySupervisorRescue']);
    void (this.supervisorEscalations satisfies SddTaskDispatchHost['supervisorEscalations']);
    void (this.maxSupervisorEscalations satisfies SddTaskDispatchHost['maxSupervisorEscalations']);
    void (this.setTaskModel satisfies SddTaskDispatchHost['setTaskModel']);
    void (this.splitTask satisfies SddTaskDispatchHost['splitTask']);
    return this as unknown as SddTaskDispatchHost;
  }

  private sddParallelControlsHost(): SddParallelControlsHost {
    // Check the complete helper contract while preserving the owner's identity and receivers.
    void ({
      isRunning: this.isRunning,
      opts: this.opts,
      taskWorktrees: this.taskWorktrees,
      forgetWorktree: this.forgetWorktree,
      baseBranch: this.baseBranch,
      mergedCommits: this.mergedCommits,
      retryMap: this.retryMap,
      persistRetries: this.persistRetries,
      cancelledTasks: this.cancelledTasks,
      emit: this.emit,
      runId: this.runId,
      taskSubagents: this.taskSubagents,
      coordinator: this.coordinator,
    } satisfies SddParallelControlsHost);
    return this as unknown as SddParallelControlsHost;
  }
}
