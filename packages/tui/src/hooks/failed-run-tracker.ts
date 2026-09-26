import type { AppProps } from '../app-props.js';

/**
 * The prompt the auto-proceed loop sends after a run an API error killed.
 * The run's own work is still in the transcript, so it asks to carry on, not
 * to start over, and to stop rather than guess when it cannot tell where it was.
 */
export const FAILED_RUN_CONTINUE_PROMPT =
  'The previous run stopped on an API error (the provider failed after its retries), not on a decision of mine. ' +
  'Continue from where it stopped; do not redo work that is already done. ' +
  'If you cannot tell how far it got, say so and stop.';

export interface FailedRunTracker {
  /** True when the last leader run died on a retryable provider failure. */
  pending(): boolean;
  /** Take the pending failure (the auto-proceed loop is acting on it). */
  consume(): boolean;
  dispose(): void;
}

type Events = NonNullable<AppProps['agent']>['events'];

/**
 * Watches the leader's runs for the one ending auto-proceed can recover: a
 * run that `failed` after a provider call gave up on a *retryable* error
 * (overload, dropped connection, 5xx) — the kind a later attempt usually
 * gets through. A non-retryable failure (bad request, auth, context overflow)
 * would fail the same way again and is never offered. A successful response
 * after the error (the fallback chain found a working model) clears it; so
 * does every new run, manual or automatic.
 *
 * Events carrying another session's id (a subagent on the same bus) are
 * ignored: only the leader's run decides what the leader does next.
 */
export function createFailedRunTracker(
  events: Events,
  leaderSessionId: () => string | undefined,
): FailedRunTracker {
  let providerFailure: { retryable: boolean } | null = null;
  let pendingFailure = false;
  const isLeader = (sessionId: string | undefined): boolean => {
    const leader = leaderSessionId();
    return sessionId === undefined || leader === undefined || sessionId === leader;
  };
  const offs = [
    events.on('agent.run.started', (e) => {
      if (!isLeader(e.sessionId)) return;
      providerFailure = null;
      pendingFailure = false;
    }),
    events.on('provider.error', (e) => {
      if (!isLeader(e.sessionId)) return;
      providerFailure = { retryable: e.retryable };
    }),
    events.on('provider.response', (e) => {
      if (!isLeader(e.sessionId)) return;
      providerFailure = null;
    }),
    events.on('agent.run.completed', (e) => {
      if (!isLeader(e.sessionId)) return;
      pendingFailure = e.status === 'failed' && providerFailure?.retryable === true;
      providerFailure = null;
    }),
  ];
  return {
    pending: () => pendingFailure,
    consume() {
      const had = pendingFailure;
      pendingFailure = false;
      return had;
    },
    dispose() {
      for (const off of offs) off();
    },
  };
}
