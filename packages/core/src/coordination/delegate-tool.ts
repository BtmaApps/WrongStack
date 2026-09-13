import type { EventBus } from '../kernel/events.js';
import { ToolCapabilities } from '../security/capabilities.js';
import { ToolValidationError } from '../types/errors.js';
import type { SubagentConfig } from '../types/multi-agent.js';
import type { JSONSchema, Tool } from '../types/tool.js';
import { DelegationTracker } from './delegation/delegation-tracker.js';
import {
  buildDelegationResultExcerpt,
  type DelegateHost,
  type DelegateInput,
  type DelegateMode,
  type DelegateResult,
  type DelegationHooks,
  type DelegationRuntimeOptions,
  failDelegation,
  makeDelegateCompletedEmitter,
  prepareDelegation,
  settleDelegation,
  startDelegationAttempt,
  validateDelegationInput,
} from './delegation/run-delegation.js';
import { callerSessionId } from './origin-session.js';
import { taskBoundarySchemaProperties } from './task-boundary.js';

export type { DelegateHost } from './delegation/run-delegation.js';
export { hintForKind } from './delegation/run-delegation.js';

export interface CreateDelegateToolOptions {
  host: DelegateHost;
  /**
   * Roster used to resolve `role` strings into full `SubagentConfig`s.
   * Typically `FLEET_ROSTER`. When omitted, `delegate({ role })` calls
   * fail and only the explicit `name + provider + model` path works.
   */
  roster?: Record<string, SubagentConfig>;
  /**
   * Default await timeout in milliseconds (host silence window). Set
   * generously (default: 4 hours) so the orchestrator can run multi-step
   * refactors / monorepo audits without being killed for being slow.
   */
  defaultTimeoutMs?: number | undefined;
  /**
   * Absolute directory under which per-subagent JSONL transcripts live —
   * matches `MultiAgentHostOptions.sessionsRoot`. Used to extract partial
   * output on timeout / budget exhaustion.
   */
  sessionsRoot?: string | undefined;
  /**
   * The directorRunId used to namespace transcripts (typically the host
   * session id): `<sessionsRoot>/<runId>/<subagentId>.jsonl`.
   */
  directorRunId?: string | undefined;
  /**
   * Buffer subtracted from the caller's `timeoutMs` before passing it to the
   * subagent. Default: 60_000 ms.
   */
  subagentTimeoutBufferMs?: number | undefined;
  /**
   * Host EventBus. When supplied, `delegate` emits `delegate.started` and,
   * once the subagent settles, both `delegate.completed` and `subagent.done`
   * (see `makeDelegateCompletedEmitter`). Best-effort; a missing bus never
   * affects delegation behaviour.
   */
  events?: EventBus | undefined;
  /**
   * Process-wide background delegation tracker (`TOKENS.DelegationTracker`).
   * When omitted, the tool keeps a private one — results still reach the
   * process-wide delivery hub, but `cancelSession` / `dispose` are then only
   * reachable through the tool's own director subscription.
   */
  tracker?: DelegationTracker | undefined;
  /**
   * Default for the `wait` input when the model omits it (config
   * `fleet.delegate.defaultWait`). Default false = background.
   */
  defaultWait?: boolean | (() => boolean | undefined) | undefined;
}

const BACKGROUND_NOTE =
  'Running in background. The final result is delivered to you automatically as a [DELEGATION RESULT] block carrying this delegationId (if you are idle by then, a new turn starts automatically) — do not poll, sleep, or await it; continue with other work or end your turn.';

/**
 * `delegate` — the compact multi-agent tool exposed after Director mode is
 * enabled. Spawn + assign in one call; by default the worker runs in the
 * background and its result is delivered to the leader automatically.
 * `wait: true` keeps the historical blocking call and result shape. The
 * lifecycle itself lives in `delegation/run-delegation.ts`.
 */
export function createDelegateTool(opts: CreateDelegateToolOptions): Tool {
  // Keep the host-side silence window generous by default. This value is also
  // forwarded as the initial subagent wall-clock budget when the role does not
  // provide one; the Director can extend it while the worker makes progress.
  const defaultTimeoutMs = opts.defaultTimeoutMs ?? 4 * 60 * 60 * 1000;
  const rosterIds = opts.roster ? Object.keys(opts.roster) : [];
  const runtime: DelegationRuntimeOptions = {
    host: opts.host,
    roster: opts.roster,
    defaultTimeoutMs,
    sessionsRoot: opts.sessionsRoot,
    directorRunId: opts.directorRunId,
    subagentTimeoutBufferMs: opts.subagentTimeoutBufferMs,
    events: opts.events,
  };
  let privateTracker: DelegationTracker | undefined;
  const trackerFor = (): DelegationTracker => {
    if (opts.tracker) return opts.tracker;
    privateTracker ??= new DelegationTracker({ events: opts.events });
    return privateTracker;
  };
  const resolveDefaultWait = (): boolean => {
    try {
      const value = typeof opts.defaultWait === 'function' ? opts.defaultWait() : opts.defaultWait;
      return value === true;
    } catch {
      return false;
    }
  };

  const inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description:
          'The objective — what the subagent should do, natural language, complete sentence(s). Pair it with the required `scope` and `outOfScope` boundary fields.',
      },
      ...taskBoundarySchemaProperties,
      wait: {
        type: 'boolean',
        description:
          'Default false: return immediately with a `delegationId` and deliver the final result to you automatically later. true: block until the worker finishes and return its full result inline — only for SHORT work whose verdict gates your very next step.',
      },
      role: {
        type: 'string',
        description:
          rosterIds.length > 0
            ? 'Roster role id. Common: bug-hunter, security-scanner, refactor-planner, critic, audit-log, executor, shadow-agent, architect.'
            : 'No roster configured — pass `name` instead.',
      },
      name: {
        type: 'string',
        description:
          'Display name for free-form subagents (no roster role). Required when `role` is omitted.',
      },
      provider: {
        type: 'string',
        description: 'Provider id (e.g. "anthropic", "openai"). Defaults to host provider.',
      },
      model: {
        type: 'string',
        description: 'Model id within the provider. Defaults to host model.',
      },
      tier: {
        type: 'string',
        description:
          "Cost/capability level for this worker: 'budget' (cheap + fast, for mechanical or well-specified work), 'standard' (the default), or 'premium' (expensive + most capable, for work where being wrong is costly). Resolved deterministically into a model, a failover chain, and a spend budget from `modelTiers` config, so you do NOT need to know any model id. Omit to let the routing table decide by role. An explicit `model` always wins over the tier.\n\nA cheaper tier is usually a SLOWER model. With `wait: true` the leader is blocked for the whole run, so `tier: 'budget'` there can cost more of your wall-clock than it saves in dollars. In the default background mode you keep working meanwhile, so that trade-off does not apply.",
      },
      systemPromptOverride: {
        type: 'string',
        description: 'Extra prompt text appended to the role baseline.',
      },
      timeoutMs: {
        type: 'number',
        minimum: 1,
        description: `Wall-clock budget in ms (default ${Math.round(defaultTimeoutMs / 1000 / 60)} min). No hard cap — set as high as the task needs.`,
      },
      maxIterations: {
        type: 'number',
        minimum: 1,
        description:
          'Maximum LLM iterations. Unset = role default. Raise for deep multi-step tasks.',
      },
      maxToolCalls: {
        type: 'number',
        minimum: 1,
        description: 'Maximum tool invocations. Unset = role default. Raise for file-heavy tasks.',
      },
      idleTimeoutMs: {
        type: 'number',
        minimum: 1,
        description: 'Idle timeout in ms. Resets on activity. Unset = role default.',
      },
      maxTokens: {
        type: 'number',
        minimum: 1,
        description: 'Max total tokens (input+output). Unset = role default.',
      },
      maxCostUsd: {
        type: 'number',
        minimum: 0,
        description: 'Max estimated USD cost. Unset = role default.',
      },
      maxHandoffs: {
        type: 'number',
        minimum: 0,
        maximum: 8,
        description:
          'Max fresh-worker continuations after budget exhaustion. Default 1. Each gets the prior partial report.',
      },
    },
    required: ['task', 'scope', 'outOfScope'],
  };

  return {
    name: 'delegate',
    description:
      "Hand a piece of work to a subagent. By default this call does NOT block: it spawns the worker and returns at once with `{status:'running', delegationId, taskId}`. When the worker finishes, its result is delivered to you automatically as a `[DELEGATION RESULT]` block (tagged with the same delegationId) at a later iteration — do not poll, sleep, or call `await_tasks` just to wait for it; keep doing other work. Several `delegate` calls in one turn fan out in parallel. Pass `wait: true` only when your very next step cannot proceed without the verdict (a review, a fact-check, a sign-off) AND the work is short: the call then blocks you until the worker returns and yields the full result inline. Each worker has its own context and LLM calls, an auto-extending budget, and a partial-completion handoff path (maxHandoffs, default 1); workers cannot recursively spawn. For finer control over reusable workers (several tasks on one worker, `await_tasks` with mode:'any'), use `spawn_subagent` + `assign_task` + `await_tasks`.",
    usageHint:
      'Set `task` to the objective, then make the edges explicit: `scope` (what the work covers) and `outOfScope` (at least one concrete non-goal) are REQUIRED — the call is rejected without them, and the worker treats the rendered boundary block as a hard contract. Pick `role` from roster or pass `name` for free-form. Default is background: the result arrives on its own under the returned `delegationId` (`roll_up([taskId])` fetches the full result afterwards). Use `wait: true` only for short work that gates your next move. Raise `maxHandoffs` (default 1, cap 8) for very large tasks; pass larger `timeoutMs`/`maxIterations`/`maxToolCalls` only when needed.',
    // H-10 (AT-03) part (a): `permission:'confirm'` forces a prompt on every
    // call, in every mode — the spawned worker's wide capabilities no longer
    // ride on a single innocuous-looking approval.
    permission: 'confirm',
    mutating: false,
    managesOwnTimeout: true,
    capabilities: [ToolCapabilities.SUBAGENT_SPAWN],
    // H-10 (AT-03) part (b): the approval subject is the nickname the user is
    // approving; an "always" answer is stored against that exact name.
    subjectKey: 'name',
    inputSchema,
    async execute(input: unknown, _ctx?: unknown, execOpts?: { signal?: AbortSignal }) {
      const sessionId = callerSessionId(_ctx, opts.directorRunId) ?? opts.directorRunId;
      // Executor-provided abort signal (leader interrupt, Esc, timeout). In
      // `wait` mode it unwinds the blocking call; in background mode it only
      // gates the launch — Esc / Stop on the leader does not cancel a worker
      // that is already running (same contract as `spawn_subagent`).
      const abortSignal = execOpts?.signal;
      const raw = (input ?? {}) as DelegateInput;
      const requestedWait = typeof raw.wait === 'boolean' ? raw.wait : resolveDefaultWait();
      // A background result is routed to its owning session; with no session
      // to own it there is nowhere to deliver, so block instead.
      const mode: DelegateMode = requestedWait || !sessionId ? 'wait' : 'background';
      const validated = validateDelegationInput(input, abortSignal);
      if (validated.kind === 'result') return validated.result;
      const emitCompleted = makeDelegateCompletedEmitter(opts.events);
      let delegationId: string | undefined;
      try {
        const ready = await prepareDelegation(validated, runtime, { sessionId, mode });
        if (ready.kind === 'result') return ready.result;
        const prepared = ready.prepared;

        if (mode === 'wait') {
          const hooks: DelegationHooks = {
            startedExtras: ({ taskId }) => ({ taskId, mode: 'wait' }),
            completedExtras: ({ taskId, stopReason }) => ({
              ...(taskId ? { taskId } : {}),
              stopReason,
              mode: 'wait',
            }),
          };
          const first = await startDelegationAttempt(prepared, 0, prepared.baseBrief, hooks);
          return await settleDelegation(prepared, first, abortSignal, hooks);
        }

        const tracker = trackerFor();
        tracker.attachDirector(prepared.director);
        const entry = tracker.begin({
          sessionId: sessionId as string,
          target: validated.target,
          task: validated.input.task,
        });
        delegationId = entry.delegationId;
        const ownedId = entry.delegationId;
        const hooks: DelegationHooks = {
          ...tracker.hooksFor(ownedId),
          observe: true,
          startedExtras: ({ taskId }) => ({ delegationId: ownedId, taskId, mode: 'background' }),
          completedExtras: ({
            taskId,
            stopReason,
            result,
          }: {
            taskId?: string | undefined;
            stopReason: string;
            result: DelegateResult;
          }) => ({
            delegationId: ownedId,
            ...(taskId ? { taskId } : {}),
            stopReason,
            resultExcerpt: buildDelegationResultExcerpt(result),
            mode: 'background',
          }),
        };
        let first: Awaited<ReturnType<typeof startDelegationAttempt>>;
        try {
          first = await startDelegationAttempt(prepared, 0, prepared.baseBrief, hooks);
        } catch (err) {
          tracker.discard(ownedId);
          throw err;
        }
        // The entry's own signal, not the leader's run signal.
        tracker.track(ownedId, settleDelegation(prepared, first, entry.controller.signal, hooks));
        return {
          ok: true,
          status: 'running',
          delegationId: ownedId,
          taskId: first.taskId,
          subagentId: first.subagentId,
          target: validated.target,
          note: BACKGROUND_NOTE,
        };
      } catch (err) {
        // Input errors surface before any spawn; there is no started line to resolve.
        if (err instanceof ToolValidationError) throw err;
        // Resolve any "started" line the UI is showing — without this a
        // spawn/assign failure after delegate.started would leave a dangling
        // "Delegating…" entry with no outcome.
        return failDelegation(
          {
            sessionId,
            target: validated.target,
            task: validated.input.task,
            emitCompleted,
            extras: { mode, ...(delegationId ? { delegationId } : {}) },
          },
          err,
        );
      }
    },
  };
}
