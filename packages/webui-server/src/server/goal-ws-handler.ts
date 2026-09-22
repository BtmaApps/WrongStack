import type { Agent, Context } from '@wrongstack/core/agent';
import { type AgentFactory, assignNickname } from '@wrongstack/core/coordination';
import {
  GoalAssessor,
  type GoalAssessResult,
  GoalRunLeaseBusyError,
  GoalRunPersistence,
  type PhaseExecutionContext,
  type PhaseGraph,
  PhaseGraphBuilder,
  type PhaseNode,
  PhaseOrchestrator,
  PhaseStore,
  type PhaseTemplate,
  prepareGoalGraphForResume,
  verifyGoalProject,
} from '@wrongstack/core/goal';
import type { EventBus } from '@wrongstack/core/kernel';
import type { Logger } from '@wrongstack/core/types';
import { toErrorMessage } from '@wrongstack/core/utils';
import { WorktreeManager } from '@wrongstack/core/worktree';
import type { WebSocket } from 'ws';
import { gitStdout, isGitWorkTree } from './git-process.js';
import {
  planPhases as delegatePlanPhases,
  runChimeraReview as delegateRunChimeraReview,
  type GoalPhasePlanningHost,
} from './goal-phase-planning.js';
import { buildGoalState } from './goal-state.js';
import { errMessage, sendSerialized } from './ws-utils.js';

/**
 * Derive a short, single-line heading from a (possibly multi-paragraph) goal
 * prompt. Takes the first non-empty line, trims to its first sentence, and caps
 * the length so Goal headers stay readable. The full prompt is preserved
 * separately as the graph description.
 */
function deriveTitle(goal: string): string {
  const firstLine = goal
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  if (!firstLine) return 'Goal';
  const sentence = firstLine.split(/(?<=[.!?])\s/)[0] ?? firstLine;
  const trimmed = sentence.length <= 64 ? sentence : `${sentence.slice(0, 63).trimEnd()}…`;
  return trimmed || 'Goal';
}

/**
 * List the commits on `branch` since `baseSha` (oldest → newest, the order they
 * landed). Used by `goal.revert` to feed WorktreeManager.revertCommits,
 * which reverses them. Returns [] on any git error.
 */
async function commitsSince(cwd: string, baseSha: string, branch: string): Promise<string[]> {
  const output = await gitStdout(cwd, ['log', '--reverse', '--format=%H', `${baseSha}..${branch}`]);
  if (output === null) return [];
  return output
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

interface WSClient {
  ws: WebSocket;
  id: string;
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
  private orchestrator: PhaseOrchestrator | null = null;
  private runPromise: Promise<void> | null = null;
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
  ) {
    this.store = new PhaseStore({ baseDir: storeDir });
    this.persistence = new GoalRunPersistence(this.store);
  }

  addClient(ws: WebSocket): void {
    const client: WSClient = { ws, id: crypto.randomUUID() };
    this.clients.add(client);

    ws.on('close', () => this.clients.delete(client));
    ws.on('error', () => this.clients.delete(client));

    // Send current state
    this.sendState(client);
  }

  /** Release timers, in-flight work, and socket references owned by this host. */
  dispose(): void {
    this.stopping = true;
    this.abort?.abort();
    this.abort = null;
    this.assessAbort?.abort();
    this.assessAbort = null;
    const orchestrator = this.orchestrator;
    const runPromise = this.runPromise;
    orchestrator?.stop();
    this.orchestrator = null;
    this.runPromise = null;
    const graph = this.graph;
    void (async () => {
      await runPromise?.catch(() => undefined);
      if (graph) {
        await this.persistence.save(graph).catch((err) => {
          this.logger.warn(`[Goal] Failed to save during disposal: ${toErrorMessage(err)}`);
        });
      }
      await this.releaseActiveRunLease();
    })().catch((err) => this.logger.warn(`[Goal] Disposal cleanup failed: ${toErrorMessage(err)}`));
    this.stopBroadcast();
    this.clients.clear();
    this.usedNicknames.clear();
    this.worktrees = null;
  }

  async handleMessage(ws: WebSocket, msg: GoalWSMessage): Promise<void> {
    switch (msg.type) {
      case 'goal.assess':
        await this.handleAssess(ws, msg.payload);
        break;
      case 'goal.start':
        await this.handleStart(msg.payload);
        break;
      case 'goal.pause':
        this.orchestrator?.pause();
        if (this.orchestrator) this.runStatus = 'paused';
        this.broadcast({ type: 'goal.paused', payload: {} });
        if (this.orchestrator) this.broadcastState();
        break;
      case 'goal.resume':
        if (this.orchestrator && this.runStatus === 'paused') {
          this.orchestrator.resume();
          this.runStatus = 'running';
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
        if (this.startInFlight || this.runStatus === 'running' || this.runStatus === 'paused') {
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
    const goal = (payload?.goal as string) || '';
    const seq = (payload?.seq as number) ?? 0;

    // Abort any prior assessment so its LLM call stops and frees the Agent's
    // single-flight guard (_runInProgress), allowing this new assessment to
    // start without waiting. The stale-seq guard below still catches any
    // race between abort and the new seq being set.
    this.assessAbort?.abort();
    this.assessAbort = new AbortController();
    const signal = this.assessAbort.signal;

    const mySeq = ++this.assessSeq;

    const sendResult = (result: GoalAssessResult) => {
      // Stale guard: if a newer assessment arrived while this one was running,
      // discard the response. The client also has its own reqSeq guard.
      if (mySeq !== this.assessSeq) return;
      sendSerialized(
        ws,
        JSON.stringify({
          type: 'goal.assess.result',
          payload: { ...result, reqSeq: seq },
        }),
      );
    };

    if (!goal.trim()) {
      sendResult({
        realistic: true,
        durationClaimed: null,
        explanation: '',
        recommendedDuration: null,
        concerns: [],
        raw: '',
        parseFailed: false,
      });
      return;
    }

    try {
      const assessor = new GoalAssessor({
        goal,
        runOnce: async (prompt: string) => {
          const result = (await this.agent.run(prompt, { signal })) as {
            status: string;
            finalText?: string | undefined;
          };
          return result.status === 'done' ? (result.finalText ?? '') : '';
        },
      });
      const result = await assessor.assess();
      sendResult(result);
    } catch (err: unknown) {
      // Stale guard: skip logging+response if superseded.
      if (mySeq !== this.assessSeq) return;
      this.logger.error(`[Goal] Assessment failed: ${toErrorMessage(err)}`);
      sendResult({
        realistic: true,
        durationClaimed: null,
        explanation: '',
        recommendedDuration: null,
        concerns: [],
        raw: '',
        parseFailed: true,
        parseError: `Assessment error: ${toErrorMessage(err)}`,
      });
    }
  }

  private async handleStart(payload?: Record<string, unknown>): Promise<void> {
    if (
      this.startInFlight ||
      this.orchestrator?.isRunning() ||
      (this.stopping && this.runPromise)
    ) {
      this.broadcast({
        type: 'goal.error',
        payload: { message: 'A Goal run is already in progress. Stop it before starting another.' },
      });
      return;
    }
    this.startInFlight = true;
    this.runStatus = 'running';
    try {
      this.releaseRunLease = await this.store.acquireRunLease(
        `webui:${process.pid}:${crypto.randomUUID()}`,
      );
      await this.startRun(payload);
    } catch (err) {
      this.runStatus = 'failed';
      this.broadcast({
        type: 'goal.error',
        payload: {
          message:
            err instanceof GoalRunLeaseBusyError
              ? err.message
              : `Goal start failed: ${toErrorMessage(err)}`,
        },
      });
    } finally {
      this.startInFlight = false;
      if (!this.orchestrator) await this.releaseActiveRunLease();
    }
  }

  private async handleResumeGraph(graphId: string): Promise<void> {
    if (
      this.startInFlight ||
      this.runStatus === 'running' ||
      this.runStatus === 'paused' ||
      (this.stopping && this.runPromise)
    ) {
      this.broadcast({
        type: 'goal.error',
        payload: { message: 'Stop the active Goal run before resuming a saved board.' },
      });
      return;
    }
    this.startInFlight = true;
    this.stopping = false;
    let releaseRunLease: (() => Promise<void>) | undefined;
    try {
      releaseRunLease = await this.store.acquireRunLease(
        `webui-resume:${process.pid}:${crypto.randomUUID()}`,
      );
      const graph = this.graph?.id === graphId ? this.graph : await this.store.load(graphId);
      if (!graph) throw new Error(`Saved Goal not found: ${graphId}`);
      if (this.stopping) return;
      const worktrees =
        graph.worktrees !== false && this.projectRoot && (await isGitWorkTree(this.projectRoot))
          ? new WorktreeManager({ projectRoot: this.projectRoot })
          : undefined;
      await prepareGoalGraphForResume(graph, worktrees);
      this.graph = graph;
      this.orchestrator = null;
      this.runStatus = 'running';
      this.releaseRunLease = releaseRunLease;
      releaseRunLease = undefined;
      await this.startRun(undefined, graph);
      if (!this.stopping && this.orchestrator) {
        this.broadcast({ type: 'goal.resumed', payload: { graphId: graph.id } });
        this.broadcastState();
      }
    } catch (err) {
      this.runStatus = this.graph ? 'stopped' : 'idle';
      this.abort = null;
      this.broadcast({
        type: 'goal.error',
        payload: {
          message:
            err instanceof GoalRunLeaseBusyError
              ? err.message
              : `Goal resume failed: ${toErrorMessage(err)}`,
        },
      });
      await this.releaseActiveRunLease();
    } finally {
      this.startInFlight = false;
      await releaseRunLease?.();
    }
  }

  private async startRun(
    payload?: Record<string, unknown>,
    resumeGraph?: PhaseGraph,
  ): Promise<void> {
    // The caller sends the operator's full prompt as the goal. We keep it intact
    // as the graph `description` and derive a short, human-readable `title` for
    // headers / the board switcher — pasting the whole prompt as the title made
    // the Goal header unreadable.
    const goal =
      resumeGraph?.description ||
      resumeGraph?.title ||
      (payload?.goal as string) ||
      (payload?.title as string) ||
      'Untitled Project';
    const title = resumeGraph?.title ?? deriveTitle(goal);
    const autonomous = resumeGraph?.autonomous ?? (payload?.autonomous as boolean) ?? true;
    const multiBoard = resumeGraph?.multiBoard ?? (payload?.multiBoard as boolean) ?? false;
    const verifyTasks =
      resumeGraph?.verifyTasks ??
      (payload?.verifyTasks as boolean | undefined) ??
      process.env['WRONGSTACK_GOAL_VERIFY'] !== '0';
    const chimeraReview =
      resumeGraph?.chimeraReview ?? (payload?.chimeraReview as boolean) ?? false;

    // Fresh abort for THIS run, created BEFORE planning so a stop pressed during
    // the (long) planning turn actually cancels it. Previously the controller was
    // created only after planning, so a stop while "starting" was a no-op and the
    // run launched anyway.
    const runAbort = new AbortController();
    this.abort = runAbort;
    this.stopping = false;

    // Phase plan resolution:
    //   1. explicit phases in the payload win (caller override);
    //   2. otherwise the LLM plans phases+todos for the goal;
    //   3. an unusable plan is rejected before a graph is created.
    const phases = resumeGraph
      ? []
      : Array.isArray(payload?.phases)
        ? (payload.phases as PhaseTemplate[])
        : await this.planPhases(goal, runAbort.signal);

    // Stop requested during planning → never launch the orchestrator. The abort
    // may not have interrupted the in-flight LLM call promptly, so the `stopping`
    // flag is the authoritative guard for the resolve-after-stop window.
    if (this.stopping || runAbort.signal.aborted) {
      this.broadcast({ type: 'goal.stopped', payload: { title } });
      return;
    }

    const taskCount = phases.reduce(
      (count, phase) => count + (phase.taskTemplates?.length ?? 0),
      0,
    );
    if (!resumeGraph && (phases.length === 0 || taskCount === 0)) {
      this.abort = null;
      this.runStatus = 'failed';
      this.broadcast({
        type: 'goal.error',
        payload: {
          message: 'The planner did not produce executable tasks. Refine the goal and try again.',
        },
      });
      return;
    }

    this.logger.info(`[Goal] Starting: ${title}`);

    // Build the graph up-front so we have a reference for live broadcasts and
    // persistence *before* the (long-running) build begins.
    const graph =
      resumeGraph ??
      (await new PhaseGraphBuilder({
        title,
        description: goal,
        phases,
        autonomous,
        multiBoard,
        verifyTasks,
        chimeraReview,
      }).build());
    this.graph = graph;

    // Per-phase git-worktree isolation, when enabled and inside a git repo.
    // The shared agent/context means we can't run phases in parallel here
    // (we swap a single context.cwd per task), so phases stay sequential —
    // but each phase still commits + squash-merges back through its own
    // worktree, and the lifecycle events drive the live swim-lane/DAG view.
    // Per-run worktree-isolation override from the UI wins; omitted → env default
    // (disable with WRONGSTACK_GOAL_WORKTREES=0). false → run on the current branch.
    const useWorktrees = resumeGraph
      ? resumeGraph.worktrees === true
      : ((payload?.worktrees as boolean | undefined) ??
        process.env['WRONGSTACK_GOAL_WORKTREES'] !== '0');
    this.worktrees = null;
    this.runBase = null;
    if (
      this.events &&
      this.projectRoot &&
      useWorktrees &&
      (await isGitWorkTree(this.projectRoot))
    ) {
      this.worktrees = new WorktreeManager({
        projectRoot: this.projectRoot,
        events: this.events,
        sessionId: () => this.context.session?.id,
      });
    }
    if (resumeGraph?.worktrees && !this.worktrees) {
      throw new Error(
        'Saved Goal requires its git worktrees, but this project is not a git checkout.',
      );
    }
    if (!resumeGraph) graph.worktrees = Boolean(this.worktrees);
    await this.persistence.save(graph);
    // Capture the pre-run base tip so `goal.revert` can git-revert exactly
    // the commits this run lands on the base branch.
    if (this.worktrees) {
      this.runBase = graph.runBase ?? (await this.worktrees.currentBase());
      graph.runBase = this.runBase ?? undefined;
      await this.persistence.save(graph);
    }

    // Verification hooks — conditionally wired when verifyTasks is enabled.
    // When active, the orchestrator runs typecheck after each task and triggers
    // a repair subagent on failure, closing the verify→repair→verify loop.
    const maybeVerify: {
      verifyPhase?: PhaseExecutionContext['verifyPhase'];
      repairPhase?: PhaseExecutionContext['repairPhase'];
    } = {};
    if (verifyTasks && this.projectRoot) {
      maybeVerify.verifyPhase = async (_phase, env) =>
        verifyGoalProject({
          cwd: env?.cwd ?? this.projectRoot!,
          projectRoot: this.projectRoot,
        });
      maybeVerify.repairPhase = (phase, failure, attempt, env) =>
        this.runRepairPhase(phase, failure, attempt, env);
    }

    const orchestrator = new PhaseOrchestrator({
      graph,
      ctx: {
        executeTask: async (task, phaseId, env, signal) => {
          this.logger.info(`[Goal] [${phaseId}] Executing: ${task.title}`);
          const result = await this.executeTaskWithAgent(task, phaseId, env, signal);
          this.logger.info(`[Goal] [${phaseId}] Completed: ${task.title}`);

          // This host owns one Agent. Await the review before the next task so
          // the Agent's single-flight guard cannot race a background review.
          if (chimeraReview) {
            await this.runChimeraReview(task, phaseId, result, env?.cwd);
          }

          return result;
        },
        ...maybeVerify,
        verifyGoal:
          maybeVerify.verifyPhase && this.projectRoot
            ? async () => {
                const phase = Array.from(graph.phases.values()).at(-1);
                if (!phase) return { ok: false, output: 'Goal graph has no phase to verify.' };
                return maybeVerify.verifyPhase!(phase, { cwd: this.projectRoot });
              }
            : undefined,
        onTaskUpdate: () => {
          this.persistDetached(graph);
          this.broadcastState();
        },
        onPhaseComplete: (phase) => {
          this.logger.info(`[Goal] Phase completed: ${phase.name}`);
          this.persistDetached(graph);
          this.broadcastState();
        },
        onPhaseFail: (phase, error) => {
          this.logger.error(`[Goal] Phase failed: ${phase.name} — ${error.message}`);
          this.persistDetached(graph);
          this.broadcastState();
        },
      },
      worktrees: this.worktrees ?? undefined,
      autonomous,
      // Must stay 1: phase tasks run on the single shared context whose cwd we
      // swap per phase, so parallel phases would race on context.cwd.
      maxConcurrentPhases: 1,
      // Sequential within a phase: each todo is a full-tool agent editing the
      // phase worktree, so running two at once risks concurrent writes.
      maxConcurrentTasks: 1,
    });
    this.orchestrator = orchestrator;
    this.runStatus = 'running';

    // Start the live broadcast immediately, then run the orchestrator in the
    // background. Awaiting start() would block until the *entire* build
    // finishes — the periodic broadcast (below) reads the mutating graph, so
    // clients see live progress while it runs.
    this.startBroadcast();
    this.broadcastState();

    const runPromise = orchestrator.start();
    this.runPromise = runPromise;
    void runPromise
      .then(async () => {
        if (this.orchestrator !== orchestrator) return;
        let saveError: string | undefined;
        try {
          await this.persistence.save(graph);
        } catch (err) {
          saveError = toErrorMessage(err);
          this.logger.error(`[Goal] Final save failed: ${saveError}`);
        }
        if (this.orchestrator !== orchestrator) return;
        this.stopBroadcast();
        const failed =
          graph.failedPhaseIds.length > 0 ||
          graph.finalVerification?.status === 'failed' ||
          saveError !== undefined;
        this.runStatus = failed ? 'failed' : 'completed';
        this.broadcast(
          failed
            ? { type: 'goal.failed', payload: { title, error: saveError } }
            : { type: 'goal.completed', payload: { title } },
        );
        this.broadcastState();
        this.abort = null;
        await this.releaseActiveRunLease();
        if (this.runPromise === runPromise) this.runPromise = null;
      })
      .catch(async (err: unknown) => {
        if (this.orchestrator !== orchestrator) return;
        this.logger.error(`[Goal] Aborted: ${toErrorMessage(err)}`);
        await this.persistence.save(graph).catch((saveErr: unknown) => {
          this.logger.warn(`[Goal] Failed to save aborted run: ${toErrorMessage(saveErr)}`);
        });
        if (this.orchestrator !== orchestrator) return;
        this.runStatus = 'failed';
        this.stopBroadcast();
        this.broadcast({ type: 'goal.failed', payload: { title, error: String(err) } });
        this.abort = null;
        await this.releaseActiveRunLease();
        if (this.runPromise === runPromise) this.runPromise = null;
      });
  }

  /**
   * Halt the run NOW — at any phase. Sets `stopping` (so a planning turn that
   * resolves afterwards bails), aborts in-flight agents, stops the orchestrator,
   * and ends the live broadcast. The board is kept for review; use
   * `goal.clear` to reset or `goal.revert` to undo the changes.
   */
  private async handleStop(): Promise<void> {
    this.stopping = true;
    this.abort?.abort();
    this.assessAbort?.abort();
    this.assessAbort = null;
    const orchestrator = this.orchestrator;
    const runPromise = this.runPromise;
    orchestrator?.stop();
    this.orchestrator = null;
    this.runStatus = 'stopped';
    this.stopBroadcast();
    await runPromise?.catch(() => undefined);
    if (this.graph) await this.persistence.save(this.graph).catch(() => undefined);
    if (this.runPromise === runPromise) this.runPromise = null;
    this.abort = null;
    await this.releaseActiveRunLease();
    this.broadcast({ type: 'goal.stopped', payload: { title: this.graph?.title } });
  }

  /**
   * Stop + wipe: tear down phase worktrees and reset to an empty board so the UI
   * returns to the start screen ("new one"). Does NOT touch already-merged commits
   * on the base branch — that is `goal.revert`.
   */
  private async handleClear(): Promise<void> {
    await this.handleStop();
    if (this.worktrees) await this.worktrees.cleanupAllManaged().catch(() => undefined);
    this.orchestrator = null;
    this.graph = null;
    this.runStatus = 'idle';
    this.runBase = null;
    this.usedNicknames.clear();
    this.broadcast({ type: 'goal.cleared', payload: {} });
    // Empty state → board/wizard falls back to the goal-entry screen.
    this.broadcast({ type: 'goal.state', payload: this.buildState() });
  }

  /**
   * Stop + undo: remove phase worktrees, then history-preservingly `git revert`
   * every commit this run landed on the base branch (captured `runBase`..HEAD),
   * then reset to an empty board. Refuses (reports a reason) on a dirty tree or a
   * conflicting revert rather than leaving the tree half-reverted.
   */
  private async handleRevert(): Promise<void> {
    await this.handleStop();
    if (!this.worktrees || !this.runBase || !this.projectRoot) {
      this.broadcast({
        type: 'goal.reverted',
        payload: { ok: false, reverted: 0, reason: 'no git baseline was captured for this run' },
      });
      return;
    }
    await this.worktrees.cleanupAllManaged().catch(() => undefined);
    const shas = await commitsSince(this.projectRoot, this.runBase.sha, this.runBase.branch);
    const res = await this.worktrees.revertCommits(this.runBase.branch, shas);
    this.broadcast({ type: 'goal.reverted', payload: res });
    if (res.ok) {
      this.orchestrator = null;
      this.graph = null;
      this.runStatus = 'idle';
      this.runBase = null;
      this.broadcast({ type: 'goal.cleared', payload: {} });
      this.broadcast({ type: 'goal.state', payload: this.buildState() });
    }
  }

  /** Plan phases+todos for the goal via the LLM; reject unusable plans.
   *  The caller passes the run's abort signal so a stop during planning cancels
   *  the LLM turn (the previous fresh, never-aborted controller made planning
   *  uninterruptible). */
  private async planPhases(goal: string, signal?: AbortSignal): Promise<PhaseTemplate[]> {
    return delegatePlanPhases(this.goalPhasePlanningHost(), goal, signal);
  }

  private async executeTaskWithAgent(
    task: import('@wrongstack/core/types').TaskNode,
    phaseId: string,
    env?: { cwd?: string | undefined; branch?: string | undefined },
    signal?: AbortSignal | undefined,
  ): Promise<unknown> {
    // Give the task a human worker identity (reuse a manual assignment if one
    // exists) so the board shows who is running it; reflect it on the node and
    // push a live state update before the (long) run begins.
    if (!task.assignee) {
      const nick = assignNickname('executor', this.usedNicknames);
      this.usedNicknames.add(nick.key);
      task.assignee = nick.display.replace(/\s*\([^)]*\)\s*$/, '');
      task.updatedAt = Date.now();
      this.broadcastState();
    }

    const prompt = `Execute task: ${task.title}\n\nDescription: ${task.description}\nPhase: ${phaseId}\nPriority: ${task.priority}\nType: ${task.type}`;
    // Combine the orchestrator's per-task signal (fired by stop() or the
    // task timeout) with the run-wide abort so either cancels the agent run.
    const runSignal =
      signal && this.abort?.signal
        ? AbortSignal.any([this.abort.signal, signal])
        : (signal ?? this.abort?.signal ?? new AbortController().signal);
    if (this.taskAgentFactory) {
      const built = await this.taskAgentFactory({
        name: `goal-${task.assignee ?? 'executor'}`.slice(0, 48),
        role: 'executor',
        cwd: env?.cwd,
        allowedCapabilities: [
          'fs.read',
          'fs.write',
          'shell.restricted',
          'shell.exec',
          'net.outbound',
          'package.install',
        ],
      });
      try {
        const result = (await built.agent.run(prompt, { signal: runSignal })) as {
          status?: string | undefined;
          finalText?: string | undefined;
          error?: { message?: string | undefined } | undefined;
        };
        if (result.status !== 'done') {
          throw new Error(
            result.error?.message ?? `Goal task ended with status "${result.status ?? 'unknown'}"`,
          );
        }
        return result.finalText ?? '';
      } finally {
        await built.dispose?.();
      }
    }

    // Backward-compatible fallback for embedders that have not supplied a
    // factory. Sequential execution makes this cwd swap safe, but first-party
    // CLI/standalone hosts always inject isolated workers.
    const prevCwd = this.context.cwd;
    if (env?.cwd) this.context.cwd = env.cwd;
    try {
      const result = (await this.agent.run(prompt, { signal: runSignal })) as {
        status?: string | undefined;
        finalText?: string | undefined;
        error?: { message?: string | undefined } | undefined;
      };
      if (result.status !== 'done') {
        throw new Error(
          result.error?.message ?? `Goal task ended with status "${result.status ?? 'unknown'}"`,
        );
      }
      return result.finalText ?? '';
    } finally {
      this.context.cwd = prevCwd;
    }
  }

  private async runRepairPhase(
    phase: PhaseNode,
    failure: string,
    attempt: number,
    env?: { cwd?: string | undefined; branch?: string | undefined },
  ): Promise<void> {
    const cwd = env?.cwd ?? this.projectRoot ?? this.context.cwd;
    const prompt = `Fix the verification failures in the project at ${cwd}. Verifier output:\n\n${failure.slice(0, 4000)}\n\nRun the project's configured typecheck/lint scripts to verify the fix. Output the fixed file paths.`;
    this.logger.info(`[Goal] Repair attempt ${attempt} for phase "${phase.name}" in ${cwd}`);
    if (this.taskAgentFactory) {
      const built = await this.taskAgentFactory({
        name: `goal-repair-${phase.name}`.slice(0, 48),
        role: 'executor',
        cwd,
        allowedCapabilities: [
          'fs.read',
          'fs.write',
          'shell.restricted',
          'shell.exec',
          'net.outbound',
          'package.install',
        ],
      });
      try {
        const result = (await built.agent.run(prompt, { signal: this.abort?.signal })) as {
          status?: string | undefined;
          error?: { message?: string | undefined } | undefined;
        };
        if (result.status !== 'done') {
          throw new Error(
            result.error?.message ?? `Goal repair ended with status "${result.status}"`,
          );
        }
      } finally {
        await built.dispose?.();
      }
      return;
    }

    // Compatibility path for embedders without a worker factory.
    const previousCwd = this.context.cwd;
    this.context.cwd = cwd;
    try {
      const result = (await this.agent.run(prompt, { signal: this.abort?.signal })) as {
        status?: string | undefined;
        error?: { message?: string | undefined } | undefined;
      };
      if (result.status !== 'done') {
        throw new Error(
          result.error?.message ?? `Goal repair ended with status "${result.status}"`,
        );
      }
    } finally {
      this.context.cwd = previousCwd;
    }
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
    return buildGoalState(this.graph, activePhaseId, this.runStatus);
  }

  private sendState(client: WSClient): void {
    if (!this.graph) return;
    const state = this.buildState();
    this.send(client, { type: 'goal.state', payload: state });
  }

  private broadcast(msg: { type: string; payload: unknown }): void {
    const data = JSON.stringify(msg);
    const frameBytes = Buffer.byteLength(data, 'utf8');
    for (const client of this.clients) {
      sendSerialized(client.ws, data, frameBytes);
    }
  }

  private send(client: WSClient, msg: { type: string; payload: unknown }): void {
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
}
