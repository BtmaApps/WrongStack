import { gitText, isGitRepo, runCmd } from './goal-commands.js';

export { configureGoalPolicy, isGoalCommandAllowed, resetGoalPolicy } from './goal-commands.js';

/**
 * Goal host wiring for the CLI.
 *
 * Turns a free-text goal into a real, LLM-driven phase run:
 *   1. PLAN   — a one-shot subagent generates a phase-by-phase plan where each
 *               phase carries many concrete todos (GoalPlanner).
 *   2. BUILD  — PhaseGraphBuilder materializes the plan into a PhaseGraph with a
 *               populated TaskGraph per phase, persisted as per-project JSON.
 *   3. RUN    — PhaseOrchestrator drives the graph in the background; every task
 *               is executed by a fresh subagent (full tool access). Phase/task
 *               events flow on the shared EventBus so the TUI PhaseMonitor stays
 *               live, and the graph is re-persisted as phases complete.
 *
 * This is "SDD logic but different": phased, persisted task-lists like SDD, but
 * driven by the autonomous orchestrator + concurrent subagents rather than
 * single-thread turn injection.
 */

import { assignNickname, type BrainArbiter } from '@wrongstack/core/coordination';
import {
  GoalPlanner,
  GoalRunLeaseBusyError,
  GoalRunPersistence,
  type PhaseGraph,
  PhaseGraphBuilder,
  PhaseOrchestrator,
  type PhaseProgress,
  PhaseStore,
  prepareGoalGraphForResume,
  verifyGoalProject,
} from '@wrongstack/core/goal';
import type { EventBus } from '@wrongstack/core/kernel';
import type { Config, TaskNode } from '@wrongstack/core/types';
import { WorktreeManager } from '@wrongstack/core/worktree';

/** Tasks share one phase worktree, so concurrency is opt-in rather than implicit. */
const DEFAULT_TASK_CONCURRENCY = 1;

/** Resolve per-phase task concurrency from env, clamped to a sane range. */
function resolveTaskConcurrency(): number {
  const raw = Number.parseInt(process.env['WRONGSTACK_GOAL_TASK_CONCURRENCY'] ?? '', 10);
  if (!Number.isFinite(raw)) return DEFAULT_TASK_CONCURRENCY;
  return Math.min(8, Math.max(1, raw));
}

import type { MultiAgentHost } from './multi-agent.js';

/** Default parallel-phase concurrency once worktree isolation is available. */
const WORKTREE_PHASE_CONCURRENCY = 4;

export interface GoalHostDeps {
  multiAgentHost: MultiAgentHost;
  /** Read the *current* Config lazily (it may be patched, e.g. YOLO toggles). */
  getConfig: () => Config;
  /** Shared app EventBus — orchestrator events feed the TUI PhaseMonitor. */
  events: EventBus;
  /** Current parent session id for worktree lifecycle events. */
  getSessionId?: (() => string | undefined) | undefined;
  /** Directory for per-project phase-graph engine checkpoints. */
  storeDir: string;
  /** Project root — base for git-worktree isolation. */
  projectRoot: string;
  /**
   * Enable per-phase git-worktree isolation (default true). When on and the
   * project is a git repo, parallelizable phases run in isolated worktrees and
   * merge back sequentially. Disable with WRONGSTACK_GOAL_WORKTREES=0.
   */
  worktrees?: boolean | undefined;
  /** Max parallel phases when worktrees are active (default 4). */
  maxConcurrentPhases?: number | undefined;
  /** Optional global Brain arbiter for Goal policy decisions. */
  brain?: BrainArbiter | undefined;
  /** Optional progress logger (rendered to the user during start). */
  log?: ((line: string) => void) | undefined;
}

/** A live, read-only view of the running Goal, exposed to slash commands. */
interface GoalRunnerView {
  graph: PhaseGraph;
  getProgress: () => PhaseProgress | null;
  isRunning: () => boolean;
}

type GoalStartResult = { ok: true; graph: PhaseGraph } | { ok: false; error: string };

export interface GoalHostHooks {
  onGoalStart: (opts: {
    goal: string;
    projectContext?: string | undefined;
  }) => Promise<GoalStartResult>;
  onGoalPause: () => void;
  onGoalResume: () => void;
  /**
   * Resume a persisted PhaseGraph. The graph must already have been loaded
   * from the PhaseStore. Creates a fresh orchestrator and starts executing
   * pending tasks.
   */
  onGoalResumeFromGraph: (graph: PhaseGraph) => Promise<GoalStartResult>;
  onGoalStop: () => void;
  getGoalRunner: () => GoalRunnerView | null;
  /** Interactive board: move a task to another phase. */
  onGoalMoveTask: (taskId: string, toPhaseId: string) => boolean;
  /** Interactive board: (re)assign a task to a specific agent (clear with both omitted). */
  onGoalAssignTask: (taskId: string, agentId?: string, agentName?: string) => boolean;
  /** Interactive board: add a new task to a phase. Returns the new task id. */
  onGoalAddTask: (
    phaseId: string,
    spec: {
      title: string;
      description?: string;
      type?: TaskNode['type'];
      priority?: TaskNode['priority'];
    },
  ) => string | null;
  /** Interactive board: requeue a task to pending so it (re)runs. */
  onGoalRetryTask: (taskId: string) => boolean;
  /** Backs the /worktree slash command (list / merge / prune / clean). */
  onWorktree: (action: 'list' | 'merge' | 'prune' | 'clean', target?: string) => Promise<string>;
}

interface ActiveRun {
  graph: PhaseGraph;
  orchestrator: PhaseOrchestrator;
  abort: AbortController;
  unsubscribe: () => void;
  releaseRunLease: () => Promise<void>;
  runPromise?: Promise<void> | undefined;
}

/** Minimal shape of an agent.run result we depend on. */
interface RunResult {
  status: string;
  finalText?: string | undefined;
  error?: { message?: string | undefined };
}

export function createGoalHost(deps: GoalHostDeps): GoalHostHooks {
  const store = new PhaseStore({ baseDir: deps.storeDir });
  const persistence = new GoalRunPersistence(store);
  let active: ActiveRun | null = null;
  let starting = false;
  const log = deps.log ?? (() => {});

  /** Run a single prompt to completion in a throwaway subagent; return its text. */
  async function runOnce(
    prompt: string,
    label: string,
    signal: AbortSignal,
    cwd?: string | undefined,
  ): Promise<string> {
    const factory = deps.multiAgentHost.makeSubagentFactory(deps.getConfig());
    const built = await factory({ name: label, cwd });
    try {
      const result = (await built.agent.run(prompt, { signal })) as RunResult;
      if (result.status !== 'done') {
        throw new Error(result.error?.message ?? `subagent ended with status "${result.status}"`);
      }
      return result.finalText ?? '';
    } finally {
      await built.dispose?.();
    }
  }

  function buildTaskPrompt(task: TaskNode, phaseName: string, goal: string): string {
    return [
      `You are executing one task inside an autonomous, phase-based build.`,
      `Overall goal: ${goal}`,
      `Current phase: ${phaseName}`,
      '',
      `TASK: ${task.title}`,
      task.description ? `Details: ${task.description}` : '',
      `Type: ${task.type} · Priority: ${task.priority}`,
      '',
      `Do the work now using your tools (read, edit, write, bash, …). Make the`,
      `change real — do not just describe it. When finished, end with a one-line`,
      `summary of what you changed. If the task is impossible or already done,`,
      `say so explicitly.`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  function buildRepairPrompt(phaseName: string, failure: string, goal: string): string {
    return [
      `You are repairing a FAILED verification inside an autonomous, phase-based build.`,
      `Overall goal: ${goal}`,
      `Phase: ${phaseName}`,
      '',
      `The phase's code changes were applied, but verification (typecheck/lint)`,
      `failed in this working directory. Verifier output:`,
      '```',
      failure.slice(0, 4000),
      '```',
      '',
      `Fix the code in THIS working directory so verification passes. Use your tools`,
      `(read, edit, write, bash). Fix the root cause — do NOT delete code, weaken`,
      `types, or disable lint rules just to silence the error. When finished, end`,
      `with a one-line summary of what you changed.`,
    ].join('\n');
  }

  function buildConflictPrompt(files: string[], goal: string): string {
    const fileList = files.length
      ? files.map((f) => `  - ${f}`).join('\n')
      : '  (run `git diff --check` or search for "<<<<<<<" to find them)';
    return [
      `A git squash-merge hit conflicts while integrating an autonomous build phase`,
      `into the base branch. Overall goal: ${goal}`,
      '',
      `These files contain conflict markers (<<<<<<<, =======, >>>>>>>) in the`,
      `current working directory:`,
      fileList,
      '',
      `Resolve every conflict by correctly combining BOTH sides — keep the intent of`,
      `the base branch AND the phase's changes; do not blindly discard either side.`,
      `Remove all conflict markers from every affected file. Do NOT run \`git commit\``,
      `or \`git add\` — just leave the resolved files on disk. If a conflict cannot be`,
      `resolved safely, say so explicitly. End with a one-line summary.`,
    ].join('\n');
  }

  /**
   * Verify a phase's working tree. Runs the project's `typecheck` + `lint` scripts
   * (or a custom `WRONGSTACK_GOAL_VERIFY_CMD`) in `cwd`. Returns ok:true when
   * all pass, or when verification cannot meaningfully run (no deps / no scripts) —
   * the gate never blocks on things it can't actually check.
   */
  async function runVerify(cwd: string): Promise<{ ok: boolean; output?: string | undefined }> {
    const custom = process.env['WRONGSTACK_GOAL_VERIFY_CMD']?.trim();
    if (custom) {
      const res = await runCmd(custom, [], cwd, true);
      return res.code === 0
        ? { ok: true }
        : { ok: false, output: `[verify] exited ${res.code}\n${res.out}` };
    }

    return verifyGoalProject({ cwd, projectRoot: deps.projectRoot });
  }

  async function persist(graph: PhaseGraph): Promise<void> {
    try {
      await persistence.save(graph);
    } catch (err) {
      log(`⚠ Goal save failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function activateRun(
    graph: PhaseGraph,
    orchestrator: PhaseOrchestrator,
    abort: AbortController,
    releaseRunLease: () => Promise<void>,
    onStartError: (error: unknown) => void,
  ): void {
    let finalizing: Promise<void> | null = null;
    const finalize = (): Promise<void> => {
      if (finalizing) return finalizing;
      if (active?.graph.id !== graph.id) return Promise.resolve();
      const finished = active;
      finished.unsubscribe();
      finalizing = (async () => {
        try {
          await persist(graph);
          await finished.releaseRunLease();
        } catch (err) {
          log(`⚠ Goal run cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          if (active === finished) active = null;
        }
      })();
      return finalizing;
    };
    const onDone = () => {
      log(`🎉 Goal complete: ${graph.title}`);
      void finalize();
    };
    const onFailed = () => void finalize();
    const bus = deps.events as unknown as {
      on(event: string, handler: (payload: unknown) => void): void;
      off(event: string, handler: (payload: unknown) => void): void;
    };
    bus.on('graph.completed', onDone);
    bus.on('graph.failed', onFailed);
    const unsubscribe = () => {
      bus.off('graph.completed', onDone);
      bus.off('graph.failed', onFailed);
    };
    active = { graph, orchestrator, abort, unsubscribe, releaseRunLease };
    const runPromise = orchestrator.start();
    active.runPromise = runPromise;
    void runPromise.catch((err) => {
      onStartError(err);
      void finalize();
    });
  }

  return {
    async onGoalStart({ goal, projectContext }): Promise<GoalStartResult> {
      if (starting || active?.orchestrator.isRunning()) {
        return {
          ok: false,
          error: 'A Goal run is already in progress. Use /goal stop first.',
        };
      }
      starting = true;
      let releaseRunLease: (() => Promise<void>) | undefined;
      try {
        releaseRunLease = await store.acquireRunLease(`cli:${process.pid}:${crypto.randomUUID()}`);
        const abort = new AbortController();
        // Stable per-run worker identities, so the board can show "who is on what".
        const usedNicknames = new Set<string>();

        // 1) PLAN
        log(`🧠 Planning phases for: ${goal}`);
        let phases;
        try {
          const planner = new GoalPlanner({
            goal,
            projectContext,
            runOnce: (p) => runOnce(p, 'goal-planner', abort.signal),
          });
          const result = await planner.plan();
          if (result.parseFailed || result.phases.length === 0) {
            return {
              ok: false,
              error: 'The planner did not produce a usable phase plan. Try a more specific goal.',
            };
          }
          phases = result.phases;
        } catch (err) {
          return {
            ok: false,
            error: `Planning failed: ${err instanceof Error ? err.message : String(err)}`,
          };
        }

        const todoCount = phases.reduce((n, p) => n + (p.taskTemplates?.length ?? 0), 0);
        if (todoCount === 0) {
          return {
            ok: false,
            error:
              'The planner produced phases without executable tasks. Refine the goal and try again.',
          };
        }
        log(`📋 Plan ready: ${phases.length} phases, ${todoCount} todos.`);

        // 2) BUILD + persist
        const graph = await new PhaseGraphBuilder({
          title: goal,
          phases,
          autonomous: true,
        }).build();
        await persist(graph);

        // Per-phase git-worktree isolation. When enabled and inside a git repo,
        // each phase runs in its own worktree+branch so parallelizable phases
        // execute concurrently and merge back sequentially. Otherwise fall back
        // to the legacy single-tree, single-phase, single-task behavior.
        const worktreesEnabled =
          deps.worktrees !== false && process.env['WRONGSTACK_GOAL_WORKTREES'] !== '0';
        let worktrees: WorktreeManager | undefined;
        if (worktreesEnabled && (await isGitRepo(deps.projectRoot))) {
          worktrees = new WorktreeManager({
            projectRoot: deps.projectRoot,
            events: deps.events,
            sessionId: deps.getSessionId,
          });
          log(
            `🌿 Worktree isolation on — up to ${deps.maxConcurrentPhases ?? WORKTREE_PHASE_CONCURRENCY} phases run in parallel.`,
          );
        }

        // Per-phase verification gate. After a phase's todos all succeed, run the
        // project's typecheck/lint in the phase worktree before merging; on failure
        // a repair subagent gets the output and fixes the tree, then we re-verify.
        // Disable with WRONGSTACK_GOAL_VERIFY=0.
        const verifyEnabled = process.env['WRONGSTACK_GOAL_VERIFY'] !== '0';
        graph.worktrees = Boolean(worktrees);
        graph.verifyTasks = verifyEnabled;
        if (worktrees) graph.runBase = (await worktrees.currentBase()) ?? undefined;
        await persist(graph);
        if (verifyEnabled) {
          log(`🔎 Verify gate on — phases must pass typecheck/lint before merging.`);
        }

        // Merge-conflict resolution. Only meaningful with worktree isolation (the
        // only path that merges). On conflict a resolver subagent edits the base
        // tree to clear the markers; if it fails the worktree is parked for review
        // as before. Disable with WRONGSTACK_GOAL_RESOLVE=0.
        const resolveEnabled = !!worktrees && process.env['WRONGSTACK_GOAL_RESOLVE'] !== '0';

        // 3) RUN (background)
        const orchestrator = new PhaseOrchestrator({
          graph,
          ctx: {
            executeTask: async (task, phaseId, env, signal) => {
              const phase = graph.phases.get(phaseId);
              const phaseName = phase?.name ?? phaseId;
              // Give the task a human worker identity (reuse a manual assignment if
              // one exists) and reflect it onto the node so the board shows who is
              // running it — both via the periodic state and a live taskAssigned event.
              let agentName = task.assignee;
              if (!agentName) {
                const nick = assignNickname('executor', usedNicknames);
                usedNicknames.add(nick.key);
                agentName = nick.display.replace(/\s*\([^)]*\)\s*$/, '');
                active?.orchestrator.setTaskAssignee(task.id, undefined, agentName);
              }
              return runOnce(
                buildTaskPrompt(task, phaseName, goal),
                `goal-${agentName}`.slice(0, 48),
                signal ? AbortSignal.any([abort.signal, signal]) : abort.signal,
                env?.cwd,
              );
            },
            verifyPhase: verifyEnabled
              ? async (_phase, env) => runVerify(env?.cwd ?? deps.projectRoot)
              : undefined,
            verifyGoal: verifyEnabled ? async () => runVerify(deps.projectRoot) : undefined,
            repairPhase: verifyEnabled
              ? async (phase, failure, attempt, env) => {
                  log(`🔧 Repairing "${phase.name}" (attempt ${attempt}) after verify failure…`);
                  await runOnce(
                    buildRepairPrompt(phase.name, failure, goal),
                    `goal-repair-${phase.name}`.slice(0, 48),
                    abort.signal,
                    env?.cwd,
                  );
                }
              : undefined,
            resolveConflict: resolveEnabled
              ? async (_phase, info) => {
                  log(`🔀 Resolving merge conflict in ${info.conflictFiles.length} file(s)…`);
                  try {
                    await runOnce(
                      buildConflictPrompt(info.conflictFiles, goal),
                      'goal-conflict',
                      abort.signal,
                      info.cwd,
                    );
                    return true;
                  } catch {
                    return false;
                  }
                }
              : undefined,
            brain: deps.brain,
            onTaskUpdate: () => {
              void persist(graph);
            },
            onPhaseComplete: (phase) => {
              log(`✅ Phase completed: ${phase.name}`);
              void persist(graph);
            },
            onPhaseFail: (phase, error) => {
              log(`❌ Phase failed: ${phase.name} — ${error.message}`);
              void persist(graph);
            },
          },
          events: deps.events,
          worktrees,
          autonomous: true,
          // With isolation, parallelizable phases run concurrently; without it,
          // stay strictly sequential to protect the shared working tree.
          maxConcurrentPhases: worktrees
            ? (deps.maxConcurrentPhases ?? WORKTREE_PHASE_CONCURRENCY)
            : 1,
          // Within a phase, todos share the phase worktree. Keep writes sequential
          // by default; explicitly raise WRONGSTACK_GOAL_TASK_CONCURRENCY only for
          // a task plan whose file ownership is known not to overlap.
          maxConcurrentTasks: resolveTaskConcurrency(),
          stopOnFailure: true,
        });

        activateRun(graph, orchestrator, abort, releaseRunLease, (err) => {
          log(`💥 Goal aborted: ${err instanceof Error ? err.message : String(err)}`);
        });
        releaseRunLease = undefined;

        return { ok: true, graph };
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof GoalRunLeaseBusyError
              ? err.message
              : `Goal start failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      } finally {
        starting = false;
        await releaseRunLease?.();
      }
    },

    onGoalPause() {
      active?.orchestrator.pause();
    },

    onGoalResume() {
      active?.orchestrator.resume();
    },

    onGoalResumeFromGraph: async (graph: PhaseGraph): Promise<GoalStartResult> => {
      if (starting || active?.orchestrator.isRunning()) {
        return {
          ok: false,
          error: 'A Goal run is already in progress. Use /goal stop first.',
        };
      }
      starting = true;
      let releaseRunLease: (() => Promise<void>) | undefined;
      try {
        releaseRunLease = await store.acquireRunLease(
          `cli-resume:${process.pid}:${crypto.randomUUID()}`,
        );
        const abort = new AbortController();
        const usedNicknames = new Set<string>();
        const log = deps.log ?? (() => {});
        const title = graph.title;
        log('🔄 Resuming: ' + title);
        const worktreesEnabled =
          graph.worktrees !== false &&
          deps.worktrees !== false &&
          process.env['WRONGSTACK_GOAL_WORKTREES'] !== '0';
        let worktrees;
        if (worktreesEnabled && (await isGitRepo(deps.projectRoot))) {
          worktrees = new WorktreeManager({
            projectRoot: deps.projectRoot,
            events: deps.events,
            sessionId: deps.getSessionId,
          });
        }
        await prepareGoalGraphForResume(graph, worktrees);
        await persist(graph);
        const verifyEnabled = graph.verifyTasks ?? process.env['WRONGSTACK_GOAL_VERIFY'] !== '0';
        const resolveEnabled = !!worktrees && process.env['WRONGSTACK_GOAL_RESOLVE'] !== '0';
        const orchestrator = new PhaseOrchestrator({
          graph,
          ctx: {
            executeTask: async (task, phaseId, env, signal) => {
              const phase = graph.phases.get(phaseId);
              const phaseName = phase?.name ?? phaseId;
              let agentName = task.assignee;
              if (!agentName) {
                const nick = assignNickname('executor', usedNicknames);
                usedNicknames.add(nick.key);
                agentName = nick.display.replace(/\s*\([^)]*\)\s*$/, '');
                active?.orchestrator.setTaskAssignee(task.id, undefined, agentName);
              }
              return runOnce(
                buildTaskPrompt(task, phaseName, title),
                'goal-' + agentName.slice(0, 48),
                signal ? AbortSignal.any([abort.signal, signal]) : abort.signal,
                env?.cwd,
              );
            },
            verifyPhase: verifyEnabled
              ? async (_phase, env) => runVerify(env?.cwd ?? deps.projectRoot)
              : undefined,
            verifyGoal: verifyEnabled ? async () => runVerify(deps.projectRoot) : undefined,
            repairPhase: verifyEnabled
              ? async (phase, failure, attempt, env) => {
                  log(
                    '🔧 Repairing ' +
                      phase.name +
                      ' (attempt ' +
                      attempt +
                      ') after verify failure...',
                  );
                  await runOnce(
                    buildRepairPrompt(phase.name, failure, title),
                    'goal-repair-' + phase.name.slice(0, 48),
                    abort.signal,
                    env?.cwd,
                  );
                }
              : undefined,
            resolveConflict: resolveEnabled
              ? async (_phase, info) => {
                  log(
                    '🔀 Resolving merge conflict in ' + info.conflictFiles.length + ' file(s)...',
                  );
                  try {
                    await runOnce(
                      buildConflictPrompt(info.conflictFiles, title),
                      'goal-conflict',
                      abort.signal,
                      info.cwd,
                    );
                    return true;
                  } catch {
                    return false;
                  }
                }
              : undefined,
            brain: deps.brain,
            onTaskUpdate: () => {
              void persist(graph);
            },
            onPhaseComplete: (phase) => {
              log('✅ Phase completed: ' + phase.name);
              void persist(graph);
            },
            onPhaseFail: (phase, error) => {
              log('❌ Phase failed: ' + phase.name + ' - ' + error.message);
              void persist(graph);
            },
          },
          events: deps.events,
          worktrees,
          autonomous: true,
          maxConcurrentPhases: worktrees
            ? (deps.maxConcurrentPhases ?? WORKTREE_PHASE_CONCURRENCY)
            : 1,
          maxConcurrentTasks: resolveTaskConcurrency(),
          stopOnFailure: true,
        });
        activateRun(graph, orchestrator, abort, releaseRunLease, (err) => {
          log('❌ Goal orchestrator error: ' + (err instanceof Error ? err.message : String(err)));
        });
        releaseRunLease = undefined;
        return { ok: true, graph };
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof GoalRunLeaseBusyError
              ? err.message
              : `Goal resume failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      } finally {
        starting = false;
        await releaseRunLease?.();
      }
    },

    onGoalStop() {
      if (!active) return;
      const stopped = active;
      stopped.abort.abort();
      stopped.orchestrator.stop();
      stopped.unsubscribe();
      active = null;
      void (async () => {
        try {
          await stopped.runPromise?.catch(() => undefined);
          await persist(stopped.graph);
          await stopped.releaseRunLease();
        } catch (err) {
          log(`⚠ Goal stop cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      })();
    },

    getGoalRunner() {
      if (!active) return null;
      const a = active;
      return {
        graph: a.graph,
        getProgress: () => a.orchestrator.getProgress(),
        isRunning: () => a.orchestrator.isRunning(),
      };
    },

    onGoalMoveTask(taskId, toPhaseId) {
      if (!active) return false;
      const ok = active.orchestrator.moveTask(taskId, toPhaseId);
      if (ok) void persist(active.graph);
      return ok;
    },

    onGoalAssignTask(taskId, agentId, agentName) {
      if (!active) return false;
      const ok = active.orchestrator.setTaskAssignee(taskId, agentId, agentName);
      if (ok) void persist(active.graph);
      return ok;
    },

    onGoalAddTask(phaseId, spec) {
      if (!active) return null;
      const id = active.orchestrator.addTask(phaseId, spec);
      if (id) void persist(active.graph);
      return id;
    },

    onGoalRetryTask(taskId) {
      if (!active) return false;
      const ok = active.orchestrator.requeueTask(taskId);
      if (ok) void persist(active.graph);
      return ok;
    },

    async onWorktree(action, target) {
      const root = deps.projectRoot;
      if (!(await isGitRepo(root))) return '⚠ Not a git repository — worktrees unavailable.';

      switch (action) {
        case 'list': {
          const { out } = await gitText(['worktree', 'list'], root);
          return out || 'No worktrees.';
        }
        case 'prune': {
          await gitText(['worktree', 'prune'], root);
          const { out } = await gitText(['worktree', 'list'], root);
          return `Pruned stale worktree entries.\n${out}`;
        }
        case 'merge': {
          if (!target) return 'Usage: /worktree merge <branch>';
          if (target.startsWith('-')) return `Refusing unsafe branch name: ${target}`;
          const base = (await gitText(['rev-parse', '--abbrev-ref', 'HEAD'], root)).out || 'HEAD';
          await gitText(['merge', '--squash', target], root);
          const commit = await gitText(['commit', '-m', `merge ${target} (squash)`], root);
          if (commit.code !== 0 && !/nothing to commit/i.test(commit.out)) {
            await gitText(['reset', '--hard', 'HEAD'], root);
            return `⚠ Merge of "${target}" into ${base} hit conflicts and was rolled back.\n${commit.out}`;
          }
          return `✓ Merged "${target}" into ${base} (squash).`;
        }
        case 'clean': {
          // Remove all wstack-managed worktrees + branches.
          const list = (await gitText(['worktree', 'list', '--porcelain'], root)).out;
          const dirs = list
            .split('\n')
            .filter((l) => l.startsWith('worktree '))
            .map((l) => l.slice('worktree '.length))
            .filter((d) => d.includes('.wrongstack') && d.includes('worktrees'));
          for (const d of dirs) await gitText(['worktree', 'remove', '--force', d], root);
          await gitText(['worktree', 'prune'], root);
          const branches = (await gitText(['branch', '--list', 'wstack/ap/*'], root)).out
            .split('\n')
            .map((b) => b.replace(/^[*+]?\s*/, '').trim())
            .filter(Boolean);
          for (const b of branches) await gitText(['branch', '-D', b], root);
          return `🧹 Removed ${dirs.length} worktree(s) and ${branches.length} branch(es).`;
        }
        default:
          return `Unknown worktree action: ${action}`;
      }
    },
  };
}
