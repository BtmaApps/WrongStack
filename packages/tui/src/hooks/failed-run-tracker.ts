import { MAX_FAILED_RUN_RESUMES } from '@wrongstack/contracts/types/failed-run-resume';
import type { AppProps } from '../app-props.js';

export interface FailedRunTracker {
  /** True when the last leader run died on a retryable provider failure. */
  pending(): boolean;
  /** Take the pending failure (the auto-proceed loop is acting on it). */
  consume(): boolean;
  /**
   * The provider's description when the last leader run died on a
   * NON-retryable failure (context overflow, auth, bad request). Another
   * automatic turn would fail the same way, so auto-proceed must stop and
   * ask instead of pivoting to the next todo (#422). Cleared by the next run.
   */
  blocked(): string | null;
  /** 1-based number of the next automatic resume in the current streak. */
  nextAttempt(): number;
  /**
   * True when a retryable failure is pending but {@link MAX_FAILED_RUN_RESUMES}
   * resumes in a row already died the same way: the provider is down, not
   * flaky, so the loop pauses for the user instead of resuming again.
   */
  exhausted(): boolean;
  /** The provider's description of the pending failure ('' when none). */
  reason(): string;
  /**
   * Why auto-proceed must stop and wait for the user, or null: the last run
   * died on a non-retryable failure, or the resume budget is spent.
   */
  pauseNotice(): string | null;
  dispose(): void;
}

type Events = NonNullable<AppProps['agent']>['events'];

/**
 * Watches the leader's runs for the one ending auto-proceed can recover: a
 * run that `failed` after a provider call gave up on a *retryable* error
 * (timeout, overload, dropped connection, 5xx) — the kind a later attempt
 * usually gets through. A non-retryable failure (bad request, auth, context
 * overflow) would fail the same way again and is never offered. A successful
 * response after the error (the fallback chain found a working model) clears
 * it; so does every new run, manual or automatic.
 *
 * Resumes are counted per streak: a run that completes resets the count, so a
 * long session gets a fresh budget for every separate outage.
 *
 * Events carrying another session's id (a subagent on the same bus) are
 * ignored: only the leader's run decides what the leader does next.
 */
export function createFailedRunTracker(
  events: Events,
  leaderSessionId: () => string | undefined,
): FailedRunTracker {
  let providerFailure: { retryable: boolean; description: string } | null = null;
  let pendingFailure = false;
  let pendingReason = '';
  let blockedBy: string | null = null;
  let resumes = 0;
  const isLeader = (sessionId: string | undefined): boolean => {
    const leader = leaderSessionId();
    return sessionId === undefined || leader === undefined || sessionId === leader;
  };
  const offs = [
    events.on('agent.run.started', (e) => {
      if (!isLeader(e.sessionId)) return;
      providerFailure = null;
      pendingFailure = false;
      pendingReason = '';
      blockedBy = null;
    }),
    events.on('provider.error', (e) => {
      if (!isLeader(e.sessionId)) return;
      providerFailure = { retryable: e.retryable, description: e.description };
    }),
    events.on('provider.response', (e) => {
      if (!isLeader(e.sessionId)) return;
      providerFailure = null;
    }),
    events.on('agent.run.completed', (e) => {
      if (!isLeader(e.sessionId)) return;
      if (e.status === 'done') resumes = 0;
      pendingFailure = e.status === 'failed' && providerFailure?.retryable === true;
      pendingReason = pendingFailure ? (providerFailure?.description ?? '') : '';
      blockedBy =
        e.status === 'failed' && providerFailure?.retryable === false
          ? providerFailure.description || 'non-retryable provider error'
          : null;
      providerFailure = null;
    }),
  ];
  return {
    pending: () => pendingFailure,
    blocked: () => blockedBy,
    nextAttempt: () => resumes + 1,
    exhausted: () => pendingFailure && resumes >= MAX_FAILED_RUN_RESUMES,
    reason: () => pendingReason,
    pauseNotice() {
      if (pendingFailure && resumes >= MAX_FAILED_RUN_RESUMES) {
        const why = pendingReason ? ` (${pendingReason.slice(0, 160)})` : '';
        return `Auto-proceed paused: the run failed on a provider error ${MAX_FAILED_RUN_RESUMES + 1} times in a row${why}. Switch the model (/model) or add a fallback (/fallback), then type anything to continue (autonomy stays on).`;
      }
      return blockedBy
        ? `Auto-proceed paused: the last run failed on a provider error that a retry will not fix (${blockedBy.slice(0, 160)}). Type anything to continue (autonomy stays on).`
        : null;
    },
    consume() {
      const had = pendingFailure;
      pendingFailure = false;
      if (had) resumes += 1;
      return had;
    },
    dispose() {
      for (const off of offs) off();
    },
  };
}
