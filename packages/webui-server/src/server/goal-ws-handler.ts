import type { Agent, Context } from '@wrongstack/core/agent';
import { assignNickname } from '@wrongstack/core/coordination';
import {
  GoalAssessor,
  type GoalAssessResult,
  type PhaseExecutionContext,
  type PhaseGraph,
  PhaseGraphBuilder,
  type PhaseNode,
  PhaseOrchestrator,
  PhaseStore,
  type PhaseTemplate,
} from '@wrongstack/core/goal';
import type { EventBus } from '@wrongstack/core/kernel';
import type { Logger } from '@wrongstack/core/types';
import { buildChildEnv, buildWin32CmdShimInvocation, toErrorMessage } from '@wrongstack/core/utils';
import { WorktreeManager } from '@wrongstack/core/worktree';
import type { WebSocket } from 'ws';
import { gitStdout, isGitWorkTree } from './git-process.js';
import {
  defaultPhases as delegateDefaultPhases,
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
  private graph: PhaseGraph | null = null;
  private store: PhaseStore;
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
  ) {
    this.store = new PhaseStore({ baseDir: storeDir });
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
    this.orchestrator?.stop();
    this.orchestrator = null;
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
        this.broadcast({ type: 'goal.paused', payload: {} });
        break;
      case 'goal.resume':
        this.orchestrator?.resume();
        this.broadcast({ type: 'goal.resumed', payload: {} });
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
        if (this.orchestrator?.requeueTask(taskId)) this.afterBoardMutation();
        break;
      }
      case 'goal.toggleAutonomous': {
        const autonomous = (msg.payload?.autonomous as boolean) ?? !this.graph?.autonomous;
        if (this.graph) {
          this.graph.autonomous = autonomous;
          await this.store.save(this.graph);
          this.broadcast({ type: 'goal.state', payload: this.buildState() });
        }
        break;
      }
      case 'goal.save': {
        if (this.graph) {
          await this.store.save(this.graph);
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
        const graphId = msg.payload?.graphId as string | undefined;
        if (graphId) {
          const graph = await this.store.load(graphId);
          if (graph) {
            this.graph = graph;
            this.broadcast({ type: 'goal.state', payload: this.buildState() });
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
    // The caller sends the operator's full prompt as the goal. We keep it intact
    // as the graph `description` and derive a short, human-readable `title` for
    // headers / the board switcher — pasting the whole prompt as the title made
    // the Goal header unreadable.
    const goal = (payload?.goal as string) || (payload?.title as string) || 'Untitled Project';
    const title = deriveTitle(goal);
    const autonomous = (payload?.autonomous as boolean) ?? true;
    const multiBoard = (payload?.multiBoard as boolean) ?? false;
    const verifyTasks = (payload?.verifyTasks as boolean) ?? false;
    const chimeraReview = (payload?.chimeraReview as boolean) ?? false;

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
    //   3. failing that, fall back to the generic default phases.
    const phases = Array.isArray(payload?.phases)
      ? (payload.phases as PhaseTemplate[])
      : await this.planPhases(goal, runAbort.signal);

    // Stop requested during planning → never launch the orchestrator. The abort
    // may not have interrupted the in-flight LLM call promptly, so the `stopping`
    // flag is the authoritative guard for the resolve-after-stop window.
    if (this.stopping || runAbort.signal.aborted) {
      this.broadcast({ type: 'goal.stopped', payload: { title } });
      return;
    }

    this.logger.info(`[Goal] Starting: ${title}`);

    // Build the graph up-front so we have a reference for live broadcasts and
    // persistence *before* the (long-running) build begins.
    const graph = await new PhaseGraphBuilder({
      title,
      description: goal,
      phases,
      autonomous,
      multiBoard,
      verifyTasks,
      chimeraReview,
    }).build();
    this.graph = graph;
    await this.store.save(graph);

    // Per-phase git-worktree isolation, when enabled and inside a git repo.
    // The shared agent/context means we can't run phases in parallel here
    // (we swap a single context.cwd per task), so phases stay sequential —
    // but each phase still commits + squash-merges back through its own
    // worktree, and the lifecycle events drive the live swim-lane/DAG view.
    // Per-run worktree-isolation override from the UI wins; omitted → env default
    // (disable with WRONGSTACK_GOAL_WORKTREES=0). false → run on the current branch.
    const useWorktrees =
      (payload?.worktrees as boolean | undefined) ??
      process.env['WRONGSTACK_GOAL_WORKTREES'] !== '0';
    if (
      !this.worktrees &&
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
    // Capture the pre-run base tip so `goal.revert` can git-revert exactly
    // the commits this run lands on the base branch.
    if (this.worktrees) {
      this.runBase = await this.worktrees.currentBase();
    }

    // Verification hooks — conditionally wired when verifyTasks is enabled.
    // When active, the orchestrator runs typecheck after each task and triggers
    // a repair subagent on failure, closing the verify→repair→verify loop.
    const maybeVerify: {
      verifyPhase?: PhaseExecutionContext['verifyPhase'];
      repairPhase?: PhaseExecutionContext['repairPhase'];
    } = {};
    if (verifyTasks && this.projectRoot) {
      maybeVerify.verifyPhase = (async (
        phase: PhaseNode,
        env?: { cwd?: string | undefined; branch?: string | undefined },
      ) => {
        const cwd = env?.cwd ?? this.projectRoot!;
        try {
          // Run typecheck in the phase worktree (or project root).
          const { execFile } = await import('node:child_process');
          // Windows: `npx` ships as a `.cmd` shim, and since CVE-2024-27980
          // Node refuses to launch one through execFile without a shell
          // (EINVAL). Route it through the repo's single safe construction
          // instead of handing execFile a `.cmd` it cannot start — otherwise
          // this whole verify path is dead on Windows, and (see below) its
          // empty output used to read as a PASS.
          const invocation =
            process.platform === 'win32'
              ? buildWin32CmdShimInvocation('npx', ['tsc', '--noEmit'])
              : { command: 'npx', args: ['tsc', '--noEmit'], windowsVerbatimArguments: false };
          const result = await new Promise<string>((resolve) => {
            execFile(
              invocation.command,
              invocation.args,
              {
                cwd,
                timeout: 60_000,
                windowsHide: true,
                windowsVerbatimArguments: invocation.windowsVerbatimArguments,
                // Plugin/verify subprocesses must not inherit provider API
                // keys or the vault passphrase.
                env: buildChildEnv(),
                // tsc on a broken project easily exceeds the 1 MiB default,
                // which truncates the output execFile hands back.
                maxBuffer: 8 * 1024 * 1024,
              },
              (err, stdout, stderr) => {
                if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
                  resolve('[verify] tsc not found — skipping');
                  return;
                }
                const output = stdout + stderr;
                // A launch failure, a 60 s timeout or a buffer overrun leaves
                // `output` empty while `err` is set. Treating that as "no type
                // errors" turned every broken verify into a silent PASS, which
                // is exactly what the repair loop exists to catch. Surface it.
                if (err && output.trim().length === 0) {
                  resolve(`[verify] typecheck could not complete: ${toErrorMessage(err)}`);
                  return;
                }
                resolve(output);
              },
            );
          });
          if (result.startsWith('[verify] tsc not found') || result.trim().length === 0) {
            return { ok: true as const };
          }
          if (result.startsWith('[verify] typecheck could not complete')) {
            this.logger.warn(`[Goal] ${result}`);
            return { ok: true as const };
          }
          this.logger.warn(`[Goal] Verify failed for phase "${phase.name}":\n${result}`);
          return { ok: false as const, output: result };
        } catch {
          return { ok: true as const };
        }
      }) as PhaseExecutionContext['verifyPhase'];
      maybeVerify.repairPhase = (async (phase: PhaseNode, failure: string, attempt: number) => {
        this.logger.info(`[Goal] Repair attempt ${attempt} for phase "${phase.name}"`);
        const repairPrompt = `Fix all type errors in the project at ${this.projectRoot ?? '(unknown)'}. Typecheck output:\n\n${failure.slice(0, 4000)}\n\nRun npx tsc --noEmit to verify the fix. Output the fixed file paths.`;
        const repairResult = (await this.agent.run(repairPrompt)) as {
          status: string;
          finalText?: string | undefined;
        };
        if (repairResult.status !== 'done') {
          this.logger.warn(`[Goal] Repair attempt ${attempt} did not complete`);
        }
      }) as PhaseExecutionContext['repairPhase'];
    }

    this.orchestrator = new PhaseOrchestrator({
      graph,
      ctx: {
        executeTask: async (task, phaseId, env, signal) => {
          this.logger.info(`[Goal] [${phaseId}] Executing: ${task.title}`);
          const result = await this.executeTaskWithAgent(task, phaseId, env, signal);
          this.logger.info(`[Goal] [${phaseId}] Completed: ${task.title}`);

          // Chimera auto-review: when enabled, run a lightweight review
          // of the task output in the background (fire-and-forget).
          if (chimeraReview) {
            void this.runChimeraReview(task, phaseId, result, env?.cwd);
          }

          return result;
        },
        ...maybeVerify,
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

    // Start the live broadcast immediately, then run the orchestrator in the
    // background. Awaiting start() would block until the *entire* build
    // finishes — the periodic broadcast (below) reads the mutating graph, so
    // clients see live progress while it runs.
    this.startBroadcast();
    this.broadcastState();

    void this.orchestrator
      .start()
      .then(() => {
        this.orchestrator?.stop(); // clear the autonomous tick interval
        this.persistDetached(graph);
        this.stopBroadcast();
        const failed = graph.failedPhaseIds.length > 0;
        this.broadcast(
          failed
            ? { type: 'goal.failed', payload: { title } }
            : { type: 'goal.completed', payload: { title } },
        );
        this.broadcastState();
      })
      .catch((err: unknown) => {
        this.logger.error(`[Goal] Aborted: ${toErrorMessage(err)}`);
        this.stopBroadcast();
        this.broadcast({ type: 'goal.failed', payload: { title, error: String(err) } });
      });
  }

  /**
   * Halt the run NOW — at any phase. Sets `stopping` (so a planning turn that
   * resolves afterwards bails), aborts in-flight agents, stops the orchestrator
   * tick, and ends the live broadcast. The board is kept for review; use
   * `goal.clear` to reset or `goal.revert` to undo the changes.
   */
  private async handleStop(): Promise<void> {
    this.stopping = true;
    this.abort?.abort();
    this.assessAbort?.abort();
    this.assessAbort = null;
    this.orchestrator?.stop();
    this.stopBroadcast();
    if (this.graph) await this.store.save(this.graph).catch(() => undefined);
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
      this.runBase = null;
      this.broadcast({ type: 'goal.cleared', payload: {} });
      this.broadcast({ type: 'goal.state', payload: this.buildState() });
    }
  }

  /** Generic fallback phases when the LLM planner produces nothing usable. */
  private defaultPhases(): PhaseTemplate[] {
    return delegateDefaultPhases(this.goalPhasePlanningHost());
  }

  /** Plan phases+todos for the goal via the LLM; fall back to defaults on failure.
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

    // Execute task with agent
    const prompt = `Execute task: ${task.title}\n\nDescription: ${task.description}\nPhase: ${phaseId}\nPriority: ${task.priority}\nType: ${task.type}`;
    // Combine the orchestrator's per-task signal (fired by stop() or the
    // task timeout) with the run-wide abort so either cancels the agent run.
    const runSignal =
      signal && this.abort?.signal
        ? AbortSignal.any([this.abort.signal, signal])
        : (signal ?? this.abort?.signal ?? new AbortController().signal);
    // Redirect the shared context's cwd at the phase worktree for the duration
    // of this task. Safe because phases/tasks run strictly sequentially here;
    // tools read `ctx.cwd` live, so the agent operates inside the worktree.
    const prevCwd = this.context.cwd;
    if (env?.cwd) this.context.cwd = env.cwd;
    try {
      return await this.agent.run(prompt, { signal: runSignal });
    } finally {
      this.context.cwd = prevCwd;
    }
  }

  /**
   * Run a lightweight chimera-style review of a completed task's output.
   * Fire-and-forget: runs in the background and logs the review summary.
   */
  private async runChimeraReview(
    task: import('@wrongstack/core/types').TaskNode,
    phaseId: string,
    result: unknown,
    cwd?: string | undefined,
  ): Promise<void> {
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
    void this.store.save(graph).catch((err: unknown) => {
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

    for (const phase of this.graph.phases.values()) {
      const task = phase.taskGraph.nodes.get(taskId);
      if (task) {
        task.status = status as import('@wrongstack/core/types').TaskStatus;
        task.updatedAt = Date.now();
        this.broadcastState();
        return;
      }
    }
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
    if (!this.graph) return;

    const state = this.buildState(activePhaseId);
    this.broadcast({ type: 'goal.state', payload: state });
    // Feed the run mirror (if any) the same projection so it can sync a kanban
    // board. Best-effort — a mirror error must never break the live broadcast.
    if (this.onBoardState) {
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
    return buildGoalState(this.graph, activePhaseId);
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
      defaultPhases: (...args) => this.defaultPhases(...args),
    };
  }
}
