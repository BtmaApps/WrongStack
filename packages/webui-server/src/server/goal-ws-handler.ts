import type { Agent, Context } from '@wrongstack/core/agent';
import type { AgentFactory } from '@wrongstack/core/coordination';
import {
  GoalRunPersistence,
  type PhaseGraph,
  type PhaseNode,
  PhaseOrchestrator,
  PhaseStore,
  type PhaseTemplate,
  summarizeGoal,
} from '@wrongstack/core/goal';
import type { EventBus } from '@wrongstack/core/kernel';
import type { Logger } from '@wrongstack/core/types';
import { toErrorMessage } from '@wrongstack/core/utils';
import type { WorktreeManager } from '@wrongstack/core/worktree';
import type { WebSocket } from 'ws';
import {
  planPhases as delegatePlanPhases,
  runChimeraReview as delegateRunChimeraReview,
  type GoalPhasePlanningHost,
} from './goal-phase-planning.js';
import { type GoalRunHost, startGoalRun } from './goal-run.js';
import { buildGoalState } from './goal-state.js';
import {
  assessGoal,
  executeGoalTask,
  type GoalWorkerHost,
  repairGoalPhase,
} from './goal-workers.js';
import {
  type GoalWsRunControlsHost,
  handleClear as handleClearFromHost,
  handleResumeGraph as handleResumeGraphFromHost,
  handleRevert as handleRevertFromHost,
  handleStart as handleStartFromHost,
  handleStop as handleStopFromHost,
} from './goal-ws-run-controls.js';
import { errMessage, sendSerialized } from './ws-utils.js';

interface WSClient {
  ws: WebSocket;
  id: string;
  cleanup: () => void;
}

interface GoalWSMessage {
  type: string;
  payload?: Record<string, unknown>;
}

/**
 * GoalWebSocketHandler — WebSocket-based goal-driven phase execution.
 *
 * Message types:
 *   goal.start   → { title, phases?, autonomous? }
 *   goal.pause   → {}
 *   goal.resume  → {}
 *   goal.stop    → {}
 *   goal.status  → {}
 *   goal.selectPhase → { phaseId }
 *   goal.taskStatus  → { taskId, status }
 */
export class GoalWebSocketHandler {
  private readonly goals = new Map<string, GoalWebSocketHandler>();
  private readonly selections = new WeakMap<WebSocket, string>();
  private catalogTimer: ReturnType<typeof setInterval> | null = null;
  private catalogInFlight = false;
  private readOnly = false;
  private stopGeneration = 0;
  private orchestrator: PhaseOrchestrator | null = null;
  private runPromise: Promise<void> | null = null;
  private setupPromise: Promise<void> | null = null;
  private disposed = false;
  private graph: PhaseGraph | null = null;
  private store: PhaseStore;
  private persistence: GoalRunPersistence;
  private clients = new Set<WSClient>();
  private broadcastInterval: ReturnType<typeof setInterval> | null = null;
  /**
   * Change-detection state for the 2s broadcast tick: a cheap content
   * fingerprint of the graph and the last serialized progress payload, so an
   * idle run costs one small string build per tick instead of a full
   * buildState + serialize + fan-out every 2 seconds.
   */
  private lastGraphFingerprint = '';
  private lastProgressJson = '';
  /** Aborts in-flight task agents AND the planning turn when the run is stopped. */
  private abort: AbortController | null = null;
  /** Per-assessment AbortController so a newer assessment can abort the prior
   *  LLM call instead of waiting for it to finish (frees the Agent's single-flight
   *  guard sooner). */
  private assessAbort: AbortController | null = null;
  /** Monotonically increasing seq for stale-assessment detection. */
  private assessSeq = 0;
  /** Set the instant a stop/clear/revert is requested, so a planning turn that
   *  resolves afterwards never launches the orchestrator (the abort alone can't
   *  cover the window between the LLM call resolving and the orchestrator start). */
  private stopping = false;
  /** Optional per-phase git-worktree isolation (lazily created at start). */
  private worktrees: WorktreeManager | null = null;
  /** Base branch + tip SHA captured at run start so a revert can git-revert the
   *  run's squash commits (history-preserving) instead of a destructive reset. */
  private runBase: { branch: string; sha: string } | null = null;
  /** Per-run worker identities so the board can show "who is on what". */
  private usedNicknames = new Set<string>();
  /** Prevent overlapping planning/build sequences from installing competing runs. */
  private startInFlight = false;
  private runStatus: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped' = 'idle';
  private releaseRunLease: (() => Promise<void>) | null = null;

  constructor(
    private agent: Agent,
    private context: Context,
    private logger: Logger,
    storeDir: string,
    private events?: EventBus | undefined,
    private projectRoot?: string | undefined,
    /**
     * Optional tap invoked on every board-state broadcast with the live
     * `buildState()` projection. Lets a KanbanRunMirror project the Goal
     * run into a kanban board without this handler knowing about kanban. The
     * WebUI orchestrator does NOT emit PhaseEventMap on the shared bus, so this
     * callback is the mirror's only live signal for Goal.
     */
    private onBoardState?: ((graphId: string, state: Record<string, unknown>) => void) | undefined,
    /** Fresh isolated worker factory; task execution never shares the chat Context when provided. */
    private taskAgentFactory?: AgentFactory | undefined,
    private readonly goalId?: string | undefined,
  ) {
    this.store = new PhaseStore({ baseDir: storeDir });
    this.persistence = new GoalRunPersistence(this.store);
  }

  addClient(ws: WebSocket): void {
    const onClose = () => {
      this.clients.delete(client);
      client.cleanup();
      if (this.clients.size === 0 && this.catalogTimer) {
        clearInterval(this.catalogTimer);
        this.catalogTimer = null;
      }
    };
    const client: WSClient = {
      ws,
      id: crypto.randomUUID(),
      cleanup: () => {
        ws.off?.('close', onClose);
        ws.off?.('error', onClose);
      },
    };
    this.clients.add(client);

    ws.on('close', onClose);
    ws.on('error', onClose);

    // Send current state
    this.sendState(client);
    if (!this.goalId) {
      for (const goal of this.goals.values()) goal.addClient(ws);
      if (!this.catalogTimer) {
        this.catalogTimer = setInterval(() => {
          void this.broadcastCatalog();
        }, 2000);
        this.catalogTimer.unref?.();
      }
    }
  }

  /** Release timers, in-flight work, and socket references owned by this host. */
  dispose(): void {
    this.stopGeneration++;
    this.disposed = true;
    if (this.catalogTimer) clearInterval(this.catalogTimer);
    this.catalogTimer = null;
    for (const goal of this.goals.values()) goal.dispose();
    this.goals.clear();
    this.stopping = true;
    this.abort?.abort();
    this.abort = null;
    this.assessAbort?.abort();
    this.assessAbort = null;
    const orchestrator = this.orchestrator;
    const runPromise = this.runPromise;
    const setupPromise = this.setupPromise;
    orchestrator?.stop();
    this.orchestrator = null;
    this.runPromise = null;
    void (async () => {
      await setupPromise?.catch(() => undefined);
      await runPromise?.catch(() => undefined);
      if (this.graph && this.releaseRunLease) {
        this.graph.runState = 'stopped';
        await this.persistence.save(this.graph).catch((err) => {
          this.logger.warn(`[Goal] Failed to save during disposal: ${toErrorMessage(err)}`);
        });
      }
      await this.releaseActiveRunLease();
    })().catch((err) => this.logger.warn(`[Goal] Disposal cleanup failed: ${toErrorMessage(err)}`));
    this.stopBroadcast();
    for (const client of this.clients) client.cleanup();
    this.clients.clear();
    this.usedNicknames.clear();
    this.worktrees = null;
  }

  async handleMessage(ws: WebSocket, msg: GoalWSMessage): Promise<void> {
    if (this.disposed) return;
    if (!this.goalId && msg.type === 'goal.list') {
      await this.broadcastCatalog();
      return;
    }
    if (!this.goalId) {
      const requestedId = typeof msg.payload?.goalId === 'string' ? msg.payload.goalId : undefined;
      const selectedId = requestedId ?? this.selections.get(ws);
      if (selectedId && msg.type !== 'goal.assess') {
        if (!/^[a-zA-Z0-9_-]{1,200}$/.test(selectedId)) throw new Error('Invalid Goal id.');
        let goal = this.goals.get(selectedId);
        let requestGeneration = goal?.stopGeneration ?? 0;
        if (!goal) {
          if (this.goals.size >= 64) {
            const unused = [...this.goals].find(
              ([, entry]) => !entry.startInFlight && !entry.runPromise,
            );
            if (unused) {
              unused[1].dispose();
              this.goals.delete(unused[0]);
            }
          }
          if (msg.type === 'goal.start' && !this.taskAgentFactory)
            throw new Error('Concurrent Goals require isolated worker agents.');
          const live = [...this.goals.values()].filter(
            (entry) => entry.startInFlight || entry.runPromise || !entry.graph,
          );
          if (msg.type === 'goal.start' && live.length >= 8)
            throw new Error(
              'Eight Goals are already active in this server. Stop one before starting another.',
            );
          goal = new GoalWebSocketHandler(
            this.agent,
            this.context,
            this.logger,
            this.store.baseDir,
            this.events,
            this.projectRoot,
            this.onBoardState,
            this.taskAgentFactory,
            selectedId,
          );
          this.goals.set(selectedId, goal);
          requestGeneration = goal.stopGeneration;
          for (const client of this.clients) goal.addClient(client.ws);
          if (msg.type !== 'goal.start') {
            const graph = await this.store.load(selectedId);
            if (!graph) throw new Error(`Goal not found: ${selectedId}`);
            goal.graph = graph;
            goal.runStatus = graph.completedAt
              ? 'completed'
              : graph.runState === 'failed'
                ? 'failed'
                : 'stopped';
          } else if (await this.store.load(selectedId)) {
            this.goals.delete(selectedId);
            goal.dispose();
            throw new Error('This Goal id already exists. Resume it or start a new id.');
          }
        }
        if (msg.type === 'goal.start' && goal.stopGeneration !== requestGeneration) {
          goal.broadcast({ type: 'goal.stopped', payload: {} });
          return;
        }
        this.selections.set(ws, selectedId);
        if (msg.type === 'goal.start' && goal.graph) {
          goal.broadcast({
            type: 'goal.error',
            payload: {
              message: 'This Goal already exists. Resume it or start a new id.',
              controlOnly: true,
            },
          });
          return;
        }
        if (
          goal.graph &&
          !goal.releaseRunLease &&
          ['goal.status', 'goal.selectPhase'].includes(msg.type)
        ) {
          const latest = await this.store.load(selectedId);
          if (latest) goal.graph = latest;
          const owner = await this.store.goalRunOwner(goal.graph);
          goal.readOnly = Boolean(owner);
          const status = summarizeGoal(goal.graph, owner).status;
          goal.runStatus = status === 'pending' || status === 'planning' ? 'stopped' : status;
        }
        if (
          goal.graph &&
          !goal.releaseRunLease &&
          !['goal.status', 'goal.list', 'goal.selectPhase'].includes(msg.type)
        ) {
          const owner = await this.store.goalRunOwner(goal.graph);
          if (owner) {
            goal.broadcast({
              type: 'goal.error',
              payload: {
                message: `This Goal is owned by ${owner}. Control it in its owning terminal.`,
                controlOnly: true,
              },
            });
            return;
          }
        }
        await goal.handleMessage(ws, msg);
        await this.broadcastCatalog();
        return;
      }
    }
    switch (msg.type) {
      case 'goal.assess':
        await this.handleAssess(ws, msg.payload);
        break;
      case 'goal.start':
        await this.handleStart(msg.payload);
        break;
      case 'goal.pause':
        this.orchestrator?.pause();
        if (this.orchestrator) {
          this.runStatus = 'paused';
          if (this.graph) {
            this.graph.runState = 'paused';
            this.persistDetached(this.graph);
          }
        }
        this.broadcast({ type: 'goal.paused', payload: {} });
        if (this.orchestrator) this.broadcastState();
        break;
      case 'goal.resume':
        if (this.orchestrator && this.runStatus === 'paused') {
          this.orchestrator.resume();
          this.runStatus = 'running';
          if (this.graph) {
            this.graph.runState = 'running';
            this.persistDetached(this.graph);
          }
          this.broadcast({ type: 'goal.resumed', payload: {} });
          this.broadcastState();
        } else {
          const graphId =
            typeof msg.payload?.graphId === 'string' ? msg.payload.graphId : this.graph?.id;
          if (graphId) await this.handleResumeGraph(graphId);
          else
            this.broadcast({
              type: 'goal.error',
              payload: { message: 'No saved Goal to resume.' },
            });
        }
        break;
      case 'goal.stop':
        await this.handleStop();
        break;
      case 'goal.clear':
        await this.handleClear();
        break;
      case 'goal.revert':
        await this.handleRevert();
        break;
      case 'goal.status':
        this.broadcastState();
        break;
      case 'goal.selectPhase': {
        const phaseId = msg.payload?.phaseId as string;
        if (phaseId && this.graph) {
          this.broadcastState(phaseId);
        }
        break;
      }
      case 'goal.taskStatus': {
        const { taskId, status } = msg.payload as { taskId: string; status: string };
        await this.handleTaskStatusChange(taskId, status);
        break;
      }
      case 'goal.moveTask': {
        const { taskId, toPhaseId } = msg.payload as { taskId: string; toPhaseId: string };
        if (this.orchestrator?.moveTask(taskId, toPhaseId)) this.afterBoardMutation();
        break;
      }
      case 'goal.assignTask': {
        const { taskId, agentId, agentName } = msg.payload as {
          taskId: string;
          agentId?: string;
          agentName?: string;
        };
        if (this.orchestrator?.setTaskAssignee(taskId, agentId, agentName))
          this.afterBoardMutation();
        break;
      }
      case 'goal.addTask': {
        const { phaseId, title, description, type, priority } = msg.payload as {
          phaseId: string;
          title: string;
          description?: string;
          type?: import('@wrongstack/core/types').TaskNode['type'];
          priority?: import('@wrongstack/core/types').TaskNode['priority'];
        };
        if (
          title?.trim() &&
          this.orchestrator?.addTask(phaseId, { title: title.trim(), description, type, priority })
        ) {
          this.afterBoardMutation();
        }
        break;
      }
      case 'goal.retryTask':
      case 'goal.runTask': {
        const { taskId } = msg.payload as { taskId: string };
        const editor =
          this.orchestrator ??
          (this.graph
            ? new PhaseOrchestrator({ graph: this.graph, ctx: { executeTask: async () => {} } })
            : null);
        if (editor?.requeueTask(taskId)) this.afterBoardMutation();
        break;
      }
      case 'goal.save': {
        if (this.graph) {
          await this.persistence.save(this.graph);
          this.broadcast({ type: 'goal.saved', payload: { graphId: this.graph.id } });
        }
        break;
      }
      case 'goal.list': {
        const graphs = await this.store.list();
        this.broadcast({ type: 'goal.list', payload: { graphs } });
        break;
      }
      case 'goal.load': {
        if (
          this.startInFlight ||
          this.runPromise ||
          this.runStatus === 'running' ||
          this.runStatus === 'paused'
        ) {
          this.broadcast({
            type: 'goal.error',
            payload: { message: 'Stop the active Goal run before loading another board.' },
          });
          break;
        }
        let graphId = msg.payload?.graphId as string | undefined;
        if (!graphId) {
          const query = typeof msg.payload?.query === 'string' ? msg.payload.query.trim() : '';
          const graphs = await this.store.list();
          graphId = query
            ? graphs.find((entry) => entry.title.toLowerCase().includes(query.toLowerCase()))?.id
            : graphs[0]?.id;
          if (!graphId) {
            this.broadcast({
              type: 'goal.error',
              payload: { message: query ? `No saved Goal matches "${query}".` : 'No saved Goals.' },
            });
            break;
          }
        }
        if (graphId) {
          const graph = await this.store.load(graphId);
          if (graph) {
            this.orchestrator = null;
            this.graph = graph;
            this.runStatus =
              graph.finalVerification?.status === 'failed' || graph.failedPhaseIds.length > 0
                ? 'failed'
                : graph.completedAt ||
                    Array.from(graph.phases.values()).every(
                      (phase) => phase.status === 'completed' || phase.status === 'skipped',
                    )
                  ? 'completed'
                  : 'stopped';
            this.broadcast({ type: 'goal.state', payload: this.buildState() });
            if (msg.payload?.resume === true) await this.handleResumeGraph(graph.id);
          } else {
            this.broadcast({
              type: 'goal.error',
              payload: { message: `Graph not found: ${graphId}` },
            });
          }
        }
        break;
      }
    }
  }

  /**
   * Assess a goal prompt for duration realism. Runs a lightweight LLM call
   * (faster than planPhases) and returns the structured assessment to the
   * requesting client so the UI can warn about unrealistic durations before
   * the user submits the goal for planning. Sends only to the originating
   * client (unicast) and echoes the client's `seq` for response correlation.
   */
  private async handleAssess(ws: WebSocket, payload?: Record<string, unknown>): Promise<void> {
    return assessGoal(this.goalWorkerHost(), ws, payload);
  }

  private async handleStart(payload?: Record<string, unknown>): Promise<void> {
    if (this.setupPromise) return handleStartFromHost(this.goalWsRunControlsHost(), payload);
    const setup = handleStartFromHost(this.goalWsRunControlsHost(), payload);
    this.setupPromise = setup;
    try {
      await setup;
    } finally {
      if (this.setupPromise === setup) this.setupPromise = null;
    }
  }

  private async handleResumeGraph(graphId: string): Promise<void> {
    if (this.setupPromise) return handleResumeGraphFromHost(this.goalWsRunControlsHost(), graphId);
    const setup = handleResumeGraphFromHost(this.goalWsRunControlsHost(), graphId);
    this.setupPromise = setup;
    try {
      await setup;
    } finally {
      if (this.setupPromise === setup) this.setupPromise = null;
    }
  }

  private async startRun(
    payload?: Record<string, unknown>,
    resumeGraph?: PhaseGraph,
  ): Promise<void> {
    return startGoalRun(this.goalRunHost(), payload, resumeGraph);
  }

  /**
   * Halt the run NOW — at any phase. Sets `stopping` (so a planning turn that
   * resolves afterwards bails), aborts in-flight agents, stops the orchestrator,
   * and ends the live broadcast. The board is kept for review; use
   * `goal.clear` to reset or `goal.revert` to undo the changes.
   */
  private async handleStop(): Promise<void> {
    this.stopGeneration++;
    return handleStopFromHost(this.goalWsRunControlsHost());
  }

  /**
   * Stop + wipe: tear down phase worktrees and reset to an empty board so the UI
   * returns to the start screen ("new one"). Does NOT touch already-merged commits
   * on the base branch — that is `goal.revert`.
   */
  private async handleClear(): Promise<void> {
    return handleClearFromHost(this.goalWsRunControlsHost());
  }

  /**
   * Stop + undo: remove phase worktrees, then history-preservingly `git revert`
   * every commit this run landed on the base branch (captured `runBase`..HEAD),
   * then reset to an empty board. Refuses (reports a reason) on a dirty tree or a
   * conflicting revert rather than leaving the tree half-reverted.
   */
  private async handleRevert(): Promise<void> {
    return handleRevertFromHost(this.goalWsRunControlsHost());
  }

  /** Plan phases+todos for the goal via the LLM; reject unusable plans.
   *  The caller passes the run's abort signal so a stop during planning cancels
   *  the LLM turn (the previous fresh, never-aborted controller made planning
   *  uninterruptible). */
  private async planPhases(goal: string, signal?: AbortSignal): Promise<PhaseTemplate[]> {
    if (this.goalId && this.taskAgentFactory) {
      const built = await this.taskAgentFactory({
        name: `goal-planner-${this.goalId}`.slice(0, 48),
        role: 'planner',
        cwd: this.projectRoot,
        allowedCapabilities: ['fs.read'],
      });
      try {
        return await delegatePlanPhases({ agent: built.agent, logger: this.logger }, goal, signal);
      } finally {
        await built.dispose?.();
      }
    }
    return delegatePlanPhases(this.goalPhasePlanningHost(), goal, signal);
  }

  private async executeTaskWithAgent(
    task: import('@wrongstack/core/types').TaskNode,
    phaseId: string,
    env?: { cwd?: string | undefined; branch?: string | undefined },
    signal?: AbortSignal | undefined,
  ): Promise<unknown> {
    return executeGoalTask(this.goalWorkerHost(), task, phaseId, env, signal);
  }

  private async runRepairPhase(
    phase: PhaseNode,
    failure: string,
    attempt: number,
    env?: { cwd?: string | undefined; branch?: string | undefined },
  ): Promise<void> {
    return repairGoalPhase(this.goalWorkerHost(), phase, failure, attempt, env);
  }

  /** Run a lightweight chimera-style review before the task is settled. */
  private async runChimeraReview(
    task: import('@wrongstack/core/types').TaskNode,
    phaseId: string,
    result: unknown,
    cwd?: string | undefined,
  ): Promise<void> {
    if (this.taskAgentFactory) {
      const built = await this.taskAgentFactory({
        name: `goal-review-${task.title}`.slice(0, 48),
        role: 'reviewer',
        cwd,
        spawnBudgetExempt: true,
        allowedCapabilities: ['fs.read'],
      });
      try {
        return await delegateRunChimeraReview(
          { agent: built.agent, logger: this.logger },
          task,
          phaseId,
          result,
          cwd,
        );
      } finally {
        await built.dispose?.();
      }
    }
    return delegateRunChimeraReview(this.goalPhasePlanningHost(), task, phaseId, result, cwd);
  }

  /**
   * Fire-and-forget persist.
   *
   * Every detached `store.save()` used to be a bare `void`, so a rejection
   * became an unhandled rejection and — under Node 22's default
   * `--unhandled-rejections=throw` — killed the process mid-run. On Windows an
   * AV scanner or indexer holding the `.wrongstack/phases/<id>.json` rename
   * target for a few hundred ms is enough (EPERM from `atomicWrite`), and in
   * `--webui` mode that takes the CLI session down with it. `handleStop` at
   * `:549` already had the `.catch`; these call sites did not.
   */
  private persistDetached(graph: Parameters<typeof this.store.save>[0]): void {
    void this.persistence.save(graph).catch((err: unknown) => {
      this.logger.warn(`[Goal] Failed to persist phase graph: ${errMessage(err)}`);
    });
  }

  /** Persist + broadcast after an interactive board mutation. */
  private afterBoardMutation(): void {
    if (this.graph) this.persistDetached(this.graph);
    this.broadcastState();
  }

  private async handleTaskStatusChange(taskId: string, status: string): Promise<void> {
    if (!this.graph) return;
    const allowed = new Set(['pending', 'in_progress', 'blocked', 'failed', 'review', 'completed']);
    if (!allowed.has(status)) {
      this.broadcast({
        type: 'goal.error',
        payload: { message: `Invalid task status: ${status}` },
      });
      return;
    }

    for (const phase of this.graph.phases.values()) {
      const task = phase.taskGraph.nodes.get(taskId);
      if (task) {
        task.status = status as import('@wrongstack/core/types').TaskStatus;
        task.updatedAt = Date.now();
        this.graph.updatedAt = Date.now();
        await this.persistence.save(this.graph);
        this.broadcastState();
        return;
      }
    }
  }

  private async releaseActiveRunLease(): Promise<void> {
    const release = this.releaseRunLease;
    this.releaseRunLease = null;
    await release?.();
  }

  private startBroadcast(): void {
    if (this.broadcastInterval) return;
    this.broadcastInterval = setInterval(() => {
      const progress = this.orchestrator?.getProgress();
      if (progress) {
        const progressJson = JSON.stringify(progress);
        if (progressJson !== this.lastProgressJson) {
          this.lastProgressJson = progressJson;
          this.broadcast({ type: 'goal.progress', payload: progress });
        }
      }
      // Change detection: real graph mutations broadcast immediately through
      // their own broadcastState calls; the tick only resyncs when content
      // moved without one. An idle run skips buildState + serialize +
      // fan-out entirely.
      const fingerprint = this.graphFingerprint();
      if (fingerprint !== this.lastGraphFingerprint) this.broadcastState();
    }, 2000);
    this.broadcastInterval.unref?.();
  }

  private stopBroadcast(): void {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
  }

  private broadcastState(activePhaseId?: string): void {
    const state = this.buildState(activePhaseId);
    this.broadcast({ type: 'goal.state', payload: state });
    // Feed the run mirror (if any) the same projection so it can sync a kanban
    // board. Best-effort — a mirror error must never break the live broadcast.
    if (this.graph && this.onBoardState) {
      try {
        this.onBoardState(this.graph.id, state);
      } catch (err) {
        this.logger.error(`[Goal] board-state tap failed: ${errMessage(err)}`);
      }
    }
    // Record what clients now have so the tick's change detection does not
    // immediately re-broadcast the same content.
    this.lastGraphFingerprint = this.graphFingerprint();
  }

  /**
   * Cheap content fingerprint covering exactly what `buildState` renders:
   * graph identity/flags plus per-phase status, timestamps, assignees, and
   * task status counts with the newest task update. Any mutation that would
   * change the projection changes this string, so the 2s tick can skip the
   * full buildState + serialize + fan-out while the graph is idle.
   */
  private graphFingerprint(): string {
    const g = this.graph;
    if (!g) return '';
    let fp = `${g.title}|${g.autonomous}|${g.updatedAt ?? 0}|${g.phases.size}`;
    for (const p of g.phases.values()) {
      let completed = 0;
      let failed = 0;
      let newestTaskAt = 0;
      for (const t of p.taskGraph.nodes.values()) {
        if (t.status === 'completed') completed++;
        else if (t.status === 'failed') failed++;
        if ((t.updatedAt ?? 0) > newestTaskAt) newestTaskAt = t.updatedAt ?? 0;
      }
      fp += `|${p.id}:${p.status}:${p.updatedAt ?? 0}:${(p.assignedAgents ?? []).join(',')}:${p.taskGraph.nodes.size}:${completed}:${failed}:${newestTaskAt}`;
    }
    return fp;
  }

  private buildState(activePhaseId?: string): Record<string, unknown> {
    return {
      ...buildGoalState(this.graph, activePhaseId, this.runStatus),
      ...(this.goalId ? { readOnly: this.readOnly } : {}),
    };
  }

  private sendState(client: WSClient): void {
    if (!this.graph) return;
    const state = this.buildState();
    this.send(client, { type: 'goal.state', payload: state });
  }

  private broadcast(msg: { type: string; payload: unknown }): void {
    if (this.goalId)
      msg = {
        ...msg,
        payload: { ...(msg.payload as Record<string, unknown>), goalId: this.goalId },
      };
    const data = JSON.stringify(msg);
    const frameBytes = Buffer.byteLength(data, 'utf8');
    for (const client of this.clients) {
      sendSerialized(client.ws, data, frameBytes);
    }
  }

  private send(client: WSClient, msg: { type: string; payload: unknown }): void {
    if (this.goalId)
      msg = {
        ...msg,
        payload: { ...(msg.payload as Record<string, unknown>), goalId: this.goalId },
      };
    sendSerialized(client.ws, JSON.stringify(msg));
  }

  private goalPhasePlanningHost(): GoalPhasePlanningHost {
    const self = this;
    return {
      get agent() {
        return self.agent;
      },
      get logger() {
        return self.logger;
      },
    };
  }

  private goalRunHost(): GoalRunHost {
    const self = this;
    return {
      get goalId() {
        return self.goalId;
      },
      get abort() {
        return self.abort;
      },
      set abort(value) {
        self.abort = value;
      },
      planPhases: (...args) => this.planPhases(...args),
      get stopping() {
        return self.stopping;
      },
      broadcast: (...args) => this.broadcast(...args),
      get runStatus() {
        return self.runStatus;
      },
      set runStatus(value) {
        self.runStatus = value;
      },
      get logger() {
        return self.logger;
      },
      get graph() {
        return self.graph;
      },
      set graph(value) {
        self.graph = value;
      },
      get worktrees() {
        return self.worktrees;
      },
      set worktrees(value) {
        self.worktrees = value;
      },
      get runBase() {
        return self.runBase;
      },
      set runBase(value) {
        self.runBase = value;
      },
      get events() {
        return self.events;
      },
      get projectRoot() {
        return self.projectRoot;
      },
      get context() {
        return self.context;
      },
      get persistence() {
        return self.persistence;
      },
      runRepairPhase: (...args) => this.runRepairPhase(...args),
      executeTaskWithAgent: (...args) => this.executeTaskWithAgent(...args),
      runChimeraReview: (...args) => this.runChimeraReview(...args),
      persistDetached: (...args) => this.persistDetached(...args),
      broadcastState: (...args) => this.broadcastState(...args),
      get orchestrator() {
        return self.orchestrator;
      },
      set orchestrator(value) {
        self.orchestrator = value;
      },
      startBroadcast: (...args) => this.startBroadcast(...args),
      get runPromise() {
        return self.runPromise;
      },
      set runPromise(value) {
        self.runPromise = value;
      },
      stopBroadcast: (...args) => this.stopBroadcast(...args),
      releaseActiveRunLease: (...args) => this.releaseActiveRunLease(...args),
    };
  }

  private goalWorkerHost(): GoalWorkerHost {
    const self = this;
    return {
      get usedNicknames() {
        return self.usedNicknames;
      },
      broadcastState: (...args) => this.broadcastState(...args),
      get abort() {
        return self.abort;
      },
      get taskAgentFactory() {
        return self.taskAgentFactory;
      },
      get context() {
        return self.context;
      },
      get agent() {
        return self.agent;
      },
      get projectRoot() {
        return self.graph?.workspace?.dir ?? self.projectRoot;
      },
      get logger() {
        return self.logger;
      },
      get assessAbort() {
        return self.assessAbort;
      },
      set assessAbort(value) {
        self.assessAbort = value;
      },
      get assessSeq() {
        return self.assessSeq;
      },
      set assessSeq(value) {
        self.assessSeq = value;
      },
    };
  }

  private goalWsRunControlsHost(): GoalWsRunControlsHost {
    // Check the complete helper contract while preserving the owner's identity and receivers.
    void ({
      startInFlight: this.startInFlight,
      goalId: this.goalId,
      orchestrator: this.orchestrator,
      stopping: this.stopping,
      runPromise: this.runPromise,
      setupPromise: this.setupPromise,
      broadcast: this.broadcast,
      runStatus: this.runStatus,
      releaseRunLease: this.releaseRunLease,
      store: this.store,
      startRun: this.startRun,
      releaseActiveRunLease: this.releaseActiveRunLease,
      graph: this.graph,
      projectRoot: this.projectRoot,
      broadcastState: this.broadcastState,
      abort: this.abort,
      assessAbort: this.assessAbort,
      stopBroadcast: this.stopBroadcast,
      persistence: this.persistence,
      handleStop: this.handleStop,
      worktrees: this.worktrees,
      runBase: this.runBase,
      usedNicknames: this.usedNicknames,
      buildState: this.buildState,
    } satisfies GoalWsRunControlsHost);
    return this as unknown as GoalWsRunControlsHost;
  }

  private async broadcastCatalog(): Promise<void> {
    if (this.catalogInFlight) return;
    this.catalogInFlight = true;
    try {
      const graphs = await this.store.list();
      const goals = await this.store.listGoals();
      for (const [id, handler] of this.goals) {
        if (!handler.graph || (!handler.runPromise && !handler.startInFlight)) continue;
        const summary = summarizeGoal(
          handler.graph,
          handler.runPromise || handler.startInFlight ? `webui:${process.pid}:${id}` : null,
        );
        const index = goals.findIndex((entry) => entry.id === id);
        if (index >= 0) goals[index] = summary;
        else goals.unshift(summary);
      }
      this.broadcast({ type: 'goal.list', payload: { graphs, goals } });
    } catch (err) {
      this.logger.warn(`[Goal] Catalog refresh failed: ${toErrorMessage(err)}`);
    } finally {
      this.catalogInFlight = false;
    }
  }
}
