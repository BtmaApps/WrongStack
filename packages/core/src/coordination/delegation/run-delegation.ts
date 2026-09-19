/**
 * The `delegate` lifecycle, split into its three phases so the same code can
 * run blocking (the tool awaits `settleDelegation`) or in the background (a
 * `DelegationTracker` owns the settle promise and delivers the outcome to the
 * leader later).
 *
 *  - `validateDelegationInput` — synchronous input gates (throw on bad input).
 *  - `prepareDelegation`       — director resolution, config/budget shaping,
 *                                launch preface. No spawn yet.
 *  - `startDelegationAttempt`  — spawn + (attempt 0) `delegate.started` +
 *                                ownership + assign.
 *  - `settleDelegation`        — await, outcome table, handoff continuations,
 *                                `delegate.completed` + `subagent.done`.
 *
 * `makeDelegateCompletedEmitter` is the ONLY place `delegate.completed` and
 * `subagent.done` are raised. Keep every completion branch routed through it.
 *
 * @module coordination/delegation/run-delegation
 */

import { randomUUID } from 'node:crypto';
import type { EventBus, EventMap } from '../../kernel/events.js';
import { ToolValidationError } from '../../types/errors.js';
import type { SubagentConfig, TaskResult } from '../../types/multi-agent.js';
import { toErrorMessage } from '../../utils/error.js';
import type { Director } from '../director.js';
import { applyRosterBudget, FLEET_ROSTER_BUDGETS } from '../fleet.js';
import {
  composeBoundedTaskDescription,
  parseTaskBoundary,
  type TaskBoundary,
} from '../task-boundary.js';
import { buildDelegateSummary, hintForKind, readSubagentPartial } from './delegation-results.js';
import type {
  DelegateCompletedPayload,
  DelegateContinuation,
  DelegateHandoff,
  DelegateInput,
  DelegateMode,
  DelegateResult,
  DelegationRuntimeOptions,
  StopReason,
} from './delegation-types.js';

/**
 * Publish one delegation outcome on both wire names.
 *
 * `delegate.completed` carries the full lifecycle payload the WebUI timeline
 * and the Telegram bridge render. `subagent.done` is the narrower kernel
 * event declared for exactly this moment (see `kernel/events/agent-events.ts`)
 * and has no other emitter anywhere: the agent run loop folds it into
 * `RunResult.delegateSummaries`, the bundled `agent-handoff` plugin posts its
 * mailbox note from it, and the collab mirror forwards it to observers. Both
 * emits must stay in this one helper — five separate call sites each raising
 * only `delegate.completed` is how those three consumers went silent.
 */
export function makeDelegateCompletedEmitter(
  events: EventBus | undefined,
): (payload: DelegateCompletedPayload) => void {
  return (payload) => {
    events?.emit('delegate.completed', payload);
    events?.emit('subagent.done', {
      sessionId: payload.sessionId,
      summary: payload.summary,
      ok: payload.ok,
    });
  };
}

// ── Phase 0: input validation ───────────────────────────────────────────────

export type ValidatedDelegation =
  | {
      kind: 'ok';
      input: DelegateInput & { task: string };
      boundary: TaskBoundary;
      target: string;
    }
  | { kind: 'result'; result: DelegateResult };

/**
 * Synchronous input gates. Throws `ToolValidationError` for bad input (the
 * executor marks those `is_error`); returns a data result only for the
 * "already interrupted" case, which is an outcome, not a caller mistake.
 */
export function validateDelegationInput(
  raw: unknown,
  abortSignal: AbortSignal | undefined,
): ValidatedDelegation {
  const i = (raw ?? {}) as DelegateInput;
  if (typeof i.task !== 'string' || !i.task.trim()) {
    throw new ToolValidationError({ message: '`task` is required.', field: 'task' });
  }
  if (abortSignal?.aborted) {
    return {
      kind: 'result',
      result: {
        ok: false,
        stopReason: 'aborted',
        error: 'Delegation cancelled before spawn — the run was interrupted.',
      },
    };
  }
  // Hard boundary gate: a delegate without explicit edges produces a worker
  // that guesses its own scope. Reject before any spawn cost is incurred,
  // with an error that teaches the fix in one retry.
  const boundary = parseTaskBoundary(i);
  if (!boundary.ok) {
    throw new ToolValidationError({
      message: `delegate rejected — task boundary incomplete: ${boundary.error}${boundary.hint ? `\n${boundary.hint}` : ''}`,
      field: 'scope',
    });
  }
  return {
    kind: 'ok',
    input: i as DelegateInput & { task: string },
    boundary: boundary.boundary,
    // Human-friendly label for the subagent — surfaced in the delegate.*
    // events so UIs say "Delegating → bug-hunter" rather than an opaque id.
    target: i.role ?? i.name ?? 'subagent',
  };
}

// ── Phase 1: prepare ────────────────────────────────────────────────────────

export interface PreparedDelegation {
  opts: DelegationRuntimeOptions;
  input: DelegateInput & { task: string };
  sessionId: string | undefined;
  target: string;
  mode: DelegateMode;
  director: Director;
  cfg: SubagentConfig;
  timeoutMs: number;
  maxHandoffs: number;
  /** Objective + boundary block — the canonical brief. */
  baseBrief: string;
  launchModePreface: string;
  emitCompleted: (payload: DelegateCompletedPayload) => void;
}

const WAIT_LAUNCH_PREFACE = [
  'Launch-mode guidance (delegate): you were launched via the synchronous `delegate` tool, so the leader is blocked on this call for the full duration of your run.',
  'If, after inspecting the task, you judge it will run for tens of minutes or hours (multi-file refactor, monorepo audit, long-running build/test, sweeping migration), do NOT silently grind through it under the blocking call.',
  'Escalate to the leader with `session_note to="leader"` when that tool is registered (same-session, next iteration). Fall back to `mail_send` or `mailbox action=send` only for cross-session mail. Send a `steer` or `ask`, e.g. *"my task is going to run long, please spawn a subagent instead"*, so the leader can re-dispatch asynchronously via `spawn_subagent` + `assign_task`.',
  'Then return a clean checkpoint with `completion:"partial"` and a concrete `remaining_work`.',
  'If the task is short and bounded, just do it end-to-end — do not over-trigger the escalation for normal work.',
].join('\n\n');

const BACKGROUND_LAUNCH_PREFACE = [
  'Launch-mode guidance (delegate): you were launched via `delegate` in background mode. The leader is NOT blocked on you — it keeps working, and your final result is delivered to it automatically when you finish.',
  'Do the task end-to-end within its boundary. Do not stop early just because the work is long; if it genuinely outgrows one worker, return a clean checkpoint with `completion:"partial"` and a concrete `remaining_work` so a fresh worker can continue.',
  'If you need a decision or parallel help from the leader mid-task, use `session_note to="leader"` (kind `ask` or `steer`) when that tool is registered; fall back to `mail_send` only for cross-session mail. Do not send your final result by mail — submitting it is enough.',
].join('\n\n');

/** The worker-facing launch preface for a delegation mode. */
export function launchPrefaceFor(mode: DelegateMode): string {
  return mode === 'background' ? BACKGROUND_LAUNCH_PREFACE : WAIT_LAUNCH_PREFACE;
}

/**
 * Resolve the director and shape the subagent config. Throws
 * `ToolValidationError` for an unknown role / missing name. Other errors
 * (director construction failures) propagate to the caller's catch, which
 * resolves them through `failDelegation`.
 */
export async function prepareDelegation(
  validated: Extract<ValidatedDelegation, { kind: 'ok' }>,
  opts: DelegationRuntimeOptions,
  ctx: { sessionId: string | undefined; mode: DelegateMode },
): Promise<
  { kind: 'ready'; prepared: PreparedDelegation } | { kind: 'result'; result: DelegateResult }
> {
  const { input: i, boundary, target } = validated;
  let director = await opts.host.ensureDirector();
  if (!director) {
    director = await opts.host.promoteToDirector();
  }
  if (!director) {
    return {
      kind: 'result',
      result: {
        ok: false,
        error: 'Director could not be activated — fleet orchestration is unavailable.',
      },
    };
  }

  const defaultTimeoutMs = opts.defaultTimeoutMs;
  const timeoutMs = i.timeoutMs ?? defaultTimeoutMs;

  let cfg: SubagentConfig;
  if (i.role) {
    const base = opts.roster?.[i.role];
    if (!base) {
      const availableRoles = opts.roster ? Object.keys(opts.roster) : [];
      throw new ToolValidationError({
        message: `Unknown role "${i.role}". Available: ${availableRoles.join(', ') || '(no roster configured)'}.`,
        field: 'role',
      });
    }
    cfg = instantiateRosterConfig(i.role, base, i.timeoutMs, defaultTimeoutMs);
    // NOTE: do NOT write `i.systemPromptOverride` into `cfg.systemPromptOverride`
    // here — the roster override must survive until `startDelegationAttempt`
    // layers roster + caller overrides in precedence order.
    // Leader-chosen, so the session plan's lock may override it.
    if (i.provider) {
      cfg.provider = i.provider;
      cfg.modelChosenByLeader = true;
    }
    if (i.model) {
      cfg.model = i.model;
      cfg.modelChosenByLeader = true;
    }
  } else {
    if (!i.name) {
      throw new ToolValidationError({
        message: 'Either `role` (from the roster) or `name` is required.',
        field: 'role',
      });
    }
    cfg = {
      name: i.name,
      provider: i.provider,
      model: i.model,
      systemPromptOverride: i.systemPromptOverride,
      ...(i.provider || i.model ? { modelChosenByLeader: true } : {}),
    };
    // Apply generic budget so free-form subagents get the x10 budget even
    // without a roster role.
    cfg = applyRosterBudget({ ...cfg, name: i.name });
  }

  // Record the tier and which budgets the caller pinned, so the spawn-time
  // tier layer can tighten roster defaults without ever overriding a number
  // the caller typed here.
  if (i.tier) cfg.tier = i.tier;
  else if (!cfg.model && !cfg.provider && opts.suggestTier) {
    const suggested = await opts.suggestTier({ task: i.task, role: i.role });
    if (suggested) cfg.tier = suggested;
  }
  const budgetPins: string[] = [];
  if (typeof i.maxIterations === 'number') budgetPins.push('maxIterations');
  if (typeof i.maxToolCalls === 'number') budgetPins.push('maxToolCalls');
  if (typeof i.maxTokens === 'number') budgetPins.push('maxTokens');
  if (typeof i.maxCostUsd === 'number') budgetPins.push('maxCostUsd');
  if (budgetPins.length) cfg.budgetPins = budgetPins;
  if (typeof i.maxIterations === 'number') cfg.maxIterations = i.maxIterations;
  if (typeof i.maxToolCalls === 'number') cfg.maxToolCalls = i.maxToolCalls;
  if (typeof i.idleTimeoutMs === 'number') cfg.idleTimeoutMs = i.idleTimeoutMs;
  if (typeof i.maxTokens === 'number') cfg.maxTokens = i.maxTokens;
  if (typeof i.maxCostUsd === 'number') cfg.maxCostUsd = i.maxCostUsd;

  const bufferMs = opts.subagentTimeoutBufferMs ?? 60_000;
  // Only FILL IN a budget timeout when the config has none — never clamp a
  // generous roster/generic budget DOWN to the host's await window. The host
  // await is heartbeat-based, so the subagent's own (auto-extending) budget is
  // the real ceiling.
  if (!cfg.timeoutMs) {
    cfg.timeoutMs = Math.max(30_000, timeoutMs - bufferMs);
  }

  return {
    kind: 'ready',
    prepared: {
      opts,
      input: i,
      sessionId: ctx.sessionId,
      target,
      mode: ctx.mode,
      director,
      cfg,
      timeoutMs,
      maxHandoffs: Math.min(8, Math.max(0, Math.floor(i.maxHandoffs ?? 1))),
      // Composing the boundary into `TaskSpec.description` means every
      // consumer of the canonical brief — runner input, transcripts, roll-ups,
      // handoff continuations — carries the edges without extra plumbing.
      baseBrief: composeBoundedTaskDescription(i.task, boundary),
      launchModePreface: launchPrefaceFor(ctx.mode),
      emitCompleted: makeDelegateCompletedEmitter(opts.events),
    },
  };
}

// ── Phase 2: start one attempt ──────────────────────────────────────────────

export interface DelegationAttempt {
  subagentId: string;
  taskId: string;
  /** 0 = first worker; n = n-th handoff continuation. */
  handoffCount: number;
  attemptConfig: SubagentConfig;
}

export interface DelegationHooks {
  /**
   * Fired once the attempt's task id is known and BEFORE assign, so an owner
   * (the tracker) is current even when assign settles synchronously.
   */
  onAttempt?: ((attempt: DelegationAttempt) => void) | undefined;
  /** Extra fields stamped on `delegate.started` (attempt 0 only). */
  startedExtras?: ((info: { taskId: string }) => Partial<EventMap['delegate.started']>) | undefined;
  /** Extra fields stamped on `delegate.completed`. */
  completedExtras?:
    | ((outcome: {
        taskId?: string | undefined;
        stopReason: StopReason;
        result: DelegateResult;
      }) => Partial<DelegateCompletedPayload>)
    | undefined;
  /**
   * Await through `Director.observeTask` instead of `awaitTasks`, so the
   * delegation is not counted as a leader waiter (background mode).
   */
  observe?: boolean | undefined;
  /** A leader-side in-band waiter consumed this attempt's result. */
  onLeaderConsumed?: ((taskId: string) => void) | undefined;
}

type OwnershipPorts = {
  markTaskOwned?: ((taskId: string) => void) | undefined;
  observeTask?:
    | ((
        taskId: string,
        cb: (result: TaskResult, info: { leaderConsumed: boolean }) => void,
      ) => () => void)
    | undefined;
};

export async function startDelegationAttempt(
  prepared: PreparedDelegation,
  handoffCount: number,
  description: string,
  hooks?: DelegationHooks,
): Promise<DelegationAttempt> {
  const { director: dir, cfg, input: i, sessionId, target } = prepared;
  const attemptConfig = (() => {
    const base = handoffCount === 0 ? cfg : freshHandoffConfig(cfg, i.role, handoffCount);
    // Handoffs use `buildHandoffTask` (which carries its own escalation
    // language) and must NOT receive the first-attempt preface.
    if (handoffCount !== 0) return base;
    // First attempt only: inject the launch-mode preface through the subagent
    // prompt layer (`systemPromptOverride`), composing last per
    // director-prompts.ts layering. Layer in precedence order so a roster
    // override is not clobbered: [preface] + [roster] + [caller if distinct].
    const baseOverride = base.systemPromptOverride;
    const callerOverride = i.systemPromptOverride;
    const segments = [prepared.launchModePreface];
    if (baseOverride && baseOverride.trim().length > 0) segments.push(baseOverride);
    if (callerOverride && callerOverride.trim().length > 0 && callerOverride !== baseOverride) {
      segments.push(callerOverride);
    }
    return { ...base, systemPromptOverride: segments.join('\n\n') };
  })();
  // Stamp the worker with the conversation that asked for it, so lifecycle,
  // budget and spend events file under the delegating conversation.
  const subagentId = await dir.spawn({ ...attemptConfig, originSessionId: sessionId });
  const plannedTaskId = randomUUID();
  if (handoffCount === 0) {
    prepared.opts.events?.emit('delegate.started', {
      sessionId,
      target,
      task: i.task,
      subagentId,
      ...(hooks?.startedExtras?.({ taskId: plannedTaskId }) ?? {}),
    });
  }
  // Ownership BEFORE assign: `assign` settles a `stopped` result synchronously
  // when work_complete was already called, and that settlement must already
  // see this task as delegate-owned (no leader notifier mail).
  (dir as OwnershipPorts).markTaskOwned?.(plannedTaskId);
  const planned: DelegationAttempt = {
    subagentId,
    taskId: plannedTaskId,
    handoffCount,
    attemptConfig,
  };
  hooks?.onAttempt?.(planned);
  const taskId = await dir.assign({ id: plannedTaskId, description, subagentId });
  if (taskId === plannedTaskId) return planned;
  const actual: DelegationAttempt = { ...planned, taskId };
  hooks?.onAttempt?.(actual);
  return actual;
}

// ── Phase 3: settle ─────────────────────────────────────────────────────────

/**
 * Resolve a start/prepare failure: resolve any "started" line the UI is
 * showing, and return the structured error result.
 */
export function failDelegation(
  info: {
    sessionId: string | undefined;
    target: string;
    task: string;
    emitCompleted: (payload: DelegateCompletedPayload) => void;
    extras?: Partial<DelegateCompletedPayload> | undefined;
  },
  err: unknown,
): DelegateResult {
  const message = toErrorMessage(err);
  info.emitCompleted({
    sessionId: info.sessionId,
    target: info.target,
    task: info.task,
    ok: false,
    status: 'error',
    summary: `[${info.target}] failed — ${message}`,
    durationMs: 0,
    iterations: 0,
    toolCalls: 0,
    ...(info.extras ?? {}),
  });
  return { ok: false, stopReason: 'error', error: message };
}

/**
 * Await the attempt (and any handoff continuations) to a final outcome and
 * publish it. Never throws: failures resolve to the structured error result.
 */
export async function settleDelegation(
  prepared: PreparedDelegation,
  first: DelegationAttempt,
  abortSignal: AbortSignal | undefined,
  hooks?: DelegationHooks,
): Promise<DelegateResult> {
  const { director: dir, opts, input: i, sessionId, target, timeoutMs, maxHandoffs } = prepared;
  const emit = (
    payload: DelegateCompletedPayload,
    outcome: { taskId?: string | undefined; stopReason: StopReason; result: DelegateResult },
  ): DelegateResult => {
    prepared.emitCompleted({ ...payload, ...(hooks?.completedExtras?.(outcome) ?? {}) });
    return outcome.result;
  };
  const handoffs: DelegateHandoff[] = [];
  let attempt = first;
  try {
    for (;;) {
      const { subagentId, taskId, handoffCount, attemptConfig } = attempt;
      const result = await awaitDelegateAttempt(
        dir,
        subagentId,
        taskId,
        timeoutMs,
        abortSignal,
        hooks,
      );

      if ('__aborted' in result) {
        try {
          await dir.terminate(subagentId);
        } catch {
          /* best-effort */
        }
        const partial = await readSubagentPartial(opts, subagentId);
        return emit(
          {
            sessionId,
            target,
            task: i.task,
            ok: false,
            status: 'aborted',
            summary: `[${target}] aborted — the run was interrupted`,
            durationMs: 0,
            iterations: partial?.events ?? 0,
            toolCalls: partial?.toolUsesObserved ?? 0,
            subagentId,
          },
          {
            taskId,
            stopReason: 'aborted',
            result: {
              ok: false,
              stopReason: 'aborted',
              error: 'Delegated task aborted — the run was interrupted.',
              subagentId,
              taskId,
              partial,
              ...(handoffs.length > 0 ? { handoffs } : {}),
            },
          },
        );
      }

      if ('__timeout' in result) {
        try {
          await dir.terminate(subagentId);
        } catch {
          /* best-effort */
        }
        const partial = await readSubagentPartial(opts, subagentId);
        return emit(
          {
            sessionId,
            target,
            task: i.task,
            ok: false,
            status: 'host_timeout',
            summary: `[${target}] timed out — no progress within ${Math.round(timeoutMs / 1000)}s`,
            durationMs: timeoutMs,
            iterations: partial?.events ?? 0,
            toolCalls: partial?.toolUsesObserved ?? 0,
            subagentId,
          },
          {
            taskId,
            stopReason: 'host_timeout',
            result: {
              ok: false,
              stopReason: 'host_timeout',
              error: `Subagent timed out: it did not finish or report progress within ${timeoutMs}ms.`,
              hint: 'Raise timeoutMs for unusually long single operations, or split the remaining work.',
              subagentId,
              taskId,
              partial,
              ...(handoffs.length > 0 ? { handoffs } : {}),
            },
          },
        );
      }

      if ('__emptyResult' in result) {
        const partial = await readSubagentPartial(opts, subagentId);
        return emit(
          {
            sessionId,
            target,
            task: i.task,
            ok: false,
            status: 'empty_result',
            summary: `[${target}] completed without a task result`,
            durationMs: 0,
            iterations: partial?.events ?? 0,
            toolCalls: partial?.toolUsesObserved ?? 0,
            subagentId,
          },
          {
            taskId,
            stopReason: 'error',
            result: {
              ok: false,
              stopReason: 'error',
              error: 'Director returned no task result for the delegated task.',
              hint: 'Check fleet state, then retry or reassign the task.',
              subagentId,
              taskId,
              partial,
              ...(handoffs.length > 0 ? { handoffs } : {}),
            },
          },
        );
      }

      const partial =
        result.status === 'success'
          ? undefined
          : result.partial
            ? {
                lastAssistantText: result.partial.text,
                toolUsesObserved: result.toolCalls,
                events: result.iterations,
              }
            : await readSubagentPartial(opts, subagentId);
      const continuation = continuationFor(result, partial, attemptConfig);
      if (continuation && handoffCount < maxHandoffs) {
        handoffs.push({
          fromSubagentId: result.subagentId,
          fromTaskId: result.taskId,
          status: result.status,
          errorKind: result.error?.kind,
          summary: continuation.summary,
          remainingWork: continuation.remainingWork,
        });
        const next = handoffCount + 1;
        // Pass the bounded brief (not the raw objective) so the fresh worker
        // inherits the original scope/non-goals verbatim.
        const delegatedTask = buildHandoffTask(prepared.baseBrief, continuation, next, maxHandoffs);
        attempt = await startDelegationAttempt(prepared, next, delegatedTask, hooks);
        continue;
      }

      const incomplete = result.report?.completion === 'partial';
      const baseStopReason: StopReason = incomplete
        ? 'handoff_limit'
        : result.status === 'success'
          ? 'end_turn'
          : result.status === 'timeout'
            ? 'subagent_timeout'
            : result.status === 'stopped'
              ? 'aborted'
              : // Every other failure used to read "budget_exhausted", so a worker
                // that crashed told the leader to raise a budget instead.
                result.error?.kind?.startsWith('budget_')
                ? 'budget_exhausted'
                : 'error';
      const errorKind = result.error?.kind;
      const retryable = result.error?.retryable;
      const backoffMs = result.error?.backoffMs;
      const summary = incomplete
        ? `[${target}] partial checkpoint — handoff limit reached after ${handoffCount} continuation(s)`
        : buildDelegateSummary(i.role, result);
      let costUsd: number | undefined;
      try {
        costUsd = dir.snapshot().perSubagent[result.subagentId]?.cost;
      } catch {
        costUsd = undefined;
      }
      const hint = incomplete
        ? 'A clean partial checkpoint remains. Reinvoke delegate with a larger maxHandoffs or assign report.remaining_work explicitly.'
        : hintForKind(errorKind, retryable, backoffMs, partial);
      return emit(
        {
          sessionId,
          target,
          task: i.task,
          ok: result.status === 'success' && !incomplete,
          status: incomplete ? 'partial' : result.status,
          summary,
          durationMs: result.durationMs,
          iterations: result.iterations,
          toolCalls: result.toolCalls,
          costUsd,
          subagentId: result.subagentId,
        },
        {
          taskId: result.taskId,
          stopReason: baseStopReason,
          result: {
            ok: result.status === 'success' && !incomplete,
            status: incomplete ? 'partial' : result.status,
            stopReason: baseStopReason,
            errorKind,
            retryable,
            backoffMs,
            subagentId: result.subagentId,
            taskId: result.taskId,
            result: result.result,
            report: result.report,
            error: result.error,
            iterations: result.iterations,
            toolCalls: result.toolCalls,
            durationMs: result.durationMs,
            ...(partial ? { partial } : {}),
            ...(handoffs.length > 0 ? { handoffs } : {}),
            ...(hint ? { hint } : {}),
            summary,
          },
        },
      );
    }
  } catch (err) {
    const message = toErrorMessage(err);
    const failed: DelegateResult = { ok: false, stopReason: 'error', error: message };
    return failDelegation(
      {
        sessionId,
        target,
        task: i.task,
        emitCompleted: prepared.emitCompleted,
        extras: hooks?.completedExtras?.({
          taskId: attempt.taskId,
          stopReason: 'error',
          result: failed,
        }),
      },
      err,
    );
  }
}

// ── Helpers (moved verbatim from delegate-tool.ts) ──────────────────────────

type DelegateAttemptResult =
  | TaskResult
  | { __timeout: true }
  | { __emptyResult: true }
  | { __aborted: true };

async function awaitDelegateAttempt(
  director: Director,
  subagentId: string,
  taskId: string,
  timeoutMs: number,
  abortSignal: AbortSignal | undefined,
  hooks: DelegationHooks | undefined,
): Promise<DelegateAttemptResult> {
  return new Promise<DelegateAttemptResult>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let offAbort = () => {};
    let offObserve = () => {};
    const finish = (value: DelegateAttemptResult) => {
      /* v8 ignore next -- race-only: timer and awaitTasks can settle together */
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      offTool();
      offIter();
      offProgress();
      offAbort();
      offObserve();
      resolve(value);
    };
    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => finish({ __timeout: true }), timeoutMs);
    };
    const bump = (event: { subagentId: string }) => {
      if (event.subagentId === subagentId) arm();
    };
    const offTool = director.fleet.filter('tool.executed', bump);
    const offIter = director.fleet.filter('iteration.started', bump);
    const offProgress = director.fleet.filter('tool.progress', bump);
    if (abortSignal) {
      const onAbort = () => finish({ __aborted: true });
      abortSignal.addEventListener('abort', onAbort, { once: true });
      offAbort = () => abortSignal.removeEventListener('abort', onAbort);
      if (abortSignal.aborted) onAbort();
    }
    arm();
    const observeTask = (director as OwnershipPorts).observeTask;
    if (hooks?.observe && typeof observeTask === 'function') {
      // Not a waiter: a leader `await_tasks` on this id stays distinguishable.
      const off = observeTask.call(director, taskId, (result, info) => {
        if (info.leaderConsumed) hooks.onLeaderConsumed?.(result.taskId);
        finish(result);
      });
      if (settled) off();
      else offObserve = off;
      return;
    }
    director
      .awaitTasks([taskId])
      .then((results) => finish(results[0] ?? { __emptyResult: true }))
      .catch(() => finish({ __timeout: true }));
  });
}

function freshHandoffConfig(
  cfg: SubagentConfig,
  role: string | undefined,
  handoffCount: number,
): SubagentConfig {
  return {
    ...cfg,
    id: role
      ? `${role}-${randomUUID().slice(0, 8)}`
      : `${cfg.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'subagent'}-handoff-${handoffCount}-${randomUUID().slice(0, 6)}`,
  };
}

function continuationFor(
  result: TaskResult,
  partial: { lastAssistantText?: string | undefined } | undefined,
  config: SubagentConfig,
): DelegateContinuation | undefined {
  if (result.report?.completion === 'partial' && result.report.remaining_work) {
    return {
      summary: result.report.summary,
      remainingWork: result.report.remaining_work,
      partialText: typeof result.result === 'string' ? result.result : partial?.lastAssistantText,
    };
  }
  const budgetKinds = new Set([
    'budget_iterations',
    'budget_tool_calls',
    'budget_tokens',
    'budget_cost',
    'budget_timeout',
  ]);
  const partialText = result.partial?.text ?? partial?.lastAssistantText;
  const mayHaveIsolatedWrites =
    config.worktree !== false &&
    config.worktree !== 'off' &&
    (!config.tools ||
      config.tools.some((tool) =>
        ['write', 'edit', 'replace', 'patch', 'bash', 'exec', 'install', 'format'].includes(tool),
      ));
  if (
    !mayHaveIsolatedWrites &&
    result.status !== 'success' &&
    result.error?.kind &&
    budgetKinds.has(result.error.kind) &&
    partialText
  ) {
    return {
      summary: `Prior worker stopped at ${result.error.kind} after ${result.iterations} iterations and ${result.toolCalls} tool calls.`,
      remainingWork:
        'Inspect the existing workspace and finish only the work that remains from the original task.',
      partialText,
    };
  }
  return undefined;
}

export function buildHandoffTask(
  originalTask: string,
  continuation: DelegateContinuation,
  handoffCount: number,
  maxHandoffs: number,
): string {
  const partial = continuation.partialText?.trim().slice(-6_000);
  return [
    `Continue an oversized delegated task as fresh worker ${handoffCount} of ${maxHandoffs}.`,
    'Do not blindly repeat completed actions. Inspect the current workspace, git diff, tests, and any files named below before changing anything.',
    'If the remaining work is still too large, stop at a clean checkpoint and call submit_result with completion="partial" plus concrete remaining_work.',
    'If parallel help would materially improve the outcome, `session_note to="leader" kind="ask"` (or `mail_send` if you must reach another session) naming the exact helper task; do not spawn agents yourself.',
    `Original task:\n${originalTask}`,
    `Prior checkpoint summary:\n${continuation.summary}`,
    `Remaining work:\n${continuation.remainingWork}`,
    partial ? `Prior worker's last useful output:\n${partial}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function instantiateRosterConfig(
  role: string,
  base: SubagentConfig,
  requestedTimeoutMs: number | undefined,
  defaultTimeoutMs: number,
): SubagentConfig {
  const withBudget = applyRosterBudget({ ...base, role });
  const rosterTimeoutMs = FLEET_ROSTER_BUDGETS[role]?.timeoutMs;
  return {
    ...withBudget,
    // Without an explicit host wait, apply the role's tuned multi-hour
    // wall-clock budget. With an explicit wait, leave this unset so the buffer
    // logic derives a slightly shorter child budget.
    timeoutMs: requestedTimeoutMs === undefined ? (rosterTimeoutMs ?? defaultTimeoutMs) : undefined,
    // Fresh id per spawn so parallel or repeated delegates can share a role.
    id: `${role}-${randomUUID().slice(0, 8)}`,
  };
}

export {
  buildDelegateSummary,
  buildDelegationResultExcerpt,
  DELEGATION_RESULT_EXCERPT_CHARS,
  hintForKind,
  readSubagentPartial,
} from './delegation-results.js';
export type {
  DelegateCompletedPayload,
  DelegateHandoff,
  DelegateHost,
  DelegateInput,
  DelegateMode,
  DelegateResult,
  DelegationRuntimeOptions,
  StopReason,
  SubagentPartial,
} from './delegation-types.js';
