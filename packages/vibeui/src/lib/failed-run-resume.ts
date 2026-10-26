import type { ProtocolEnvelope } from '@wrongstack/webui-protocol';
import {
  DEFAULT_FAILED_RUN_RESUME_BASE_MS,
  failedRunResumeDelayMs,
  failedRunResumePrompt,
  isResumableRunFailure,
  MAX_FAILED_RUN_RESUMES,
} from '@wrongstack/webui-protocol';
import { type MutableRefObject, useEffect } from 'react';
import { record, type SessionState, text } from './session';

type FailedRunResumePlan =
  | { kind: 'ignore' }
  | { kind: 'reset' }
  | { kind: 'paused'; notice: string }
  | { kind: 'resume'; attempt: number; delayMs: number; prompt: string; notice: string };

/**
 * What to do with a `run.result` frame for the open session: a completed run
 * resets the resume count; a run this tab started that a provider killed on a
 * transient failure resumes in `auto` autonomy, until the budget is spent.
 * Runs another tab started, stopped runs and every other failure are ignored.
 */
function planFailedRunResume(input: {
  payload: unknown;
  sessionId: string;
  autonomy: unknown;
  ownedRequestId: string | undefined;
  stopped: boolean;
  resumesSoFar: number;
  baseDelayMs: number;
}): FailedRunResumePlan {
  const p = record(input.payload);
  if (typeof p.sessionId === 'string' && p.sessionId !== input.sessionId) return { kind: 'ignore' };
  if (p.status === 'done') return { kind: 'reset' };
  const error = record(p.error);
  const resumable = isResumableRunFailure(text(p.status), {
    code: text(error.code),
    recoverable: error.recoverable === true,
  });
  if (!resumable || input.autonomy !== 'auto' || input.stopped) return { kind: 'ignore' };
  if (typeof p.requestId !== 'string' || p.requestId !== input.ownedRequestId) {
    return { kind: 'ignore' };
  }
  const reason = text(error.message);
  const lead = reason || 'Provider error';
  if (input.resumesSoFar >= MAX_FAILED_RUN_RESUMES) {
    return {
      kind: 'paused',
      notice: `${lead}. Automatic resume paused after ${MAX_FAILED_RUN_RESUMES + 1} failures in a row: switch the model or add a fallback, then send a message.`,
    };
  }
  const attempt = input.resumesSoFar + 1;
  // Never sooner than the shared floor: the provider just failed its retries.
  const delayMs = failedRunResumeDelayMs(
    attempt,
    Math.max(input.baseDelayMs, DEFAULT_FAILED_RUN_RESUME_BASE_MS),
  );
  return {
    kind: 'resume',
    attempt,
    delayMs,
    prompt: failedRunResumePrompt(attempt, reason),
    notice: `${lead}. Resuming automatically in ${Math.round(delayMs / 1000)}s (${attempt}/${MAX_FAILED_RUN_RESUMES}); send a message to take over.`,
  };
}

/** The newest user message: a different one later means the user took over. */
function lastUserMessageId(state: SessionState): string | undefined {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const message = state.messages[i];
    if (message?.role === 'user') return message.id;
  }
  return undefined;
}

/**
 * Resume a run a provider killed on a transient failure (timeout, 5xx, dropped
 * connection) in `auto` autonomy: a few times, waiting longer each time, then
 * stop and say why. The wait ends without a send if, by then, the user typed,
 * pressed Stop all, switched session, queued a message or turned autonomy off.
 */
export function useFailedRunResume(deps: {
  subscribe: (listener: (frame: ProtocolEnvelope) => void) => () => void;
  current: MutableRefObject<SessionState>;
  ownedRuns: MutableRefObject<Map<string, string>>;
  stopping: MutableRefObject<string>;
  queueRef: MutableRefObject<ReadonlyArray<{ sessionId: string }>>;
  notice: (value: string) => void;
  dispatch: (content: string, images: []) => boolean;
}): void {
  const { subscribe, current, ownedRuns, stopping, queueRef, notice, dispatch } = deps;
  useEffect(() => {
    const resumes = new Map<string, number>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = subscribe((frame) => {
      if (frame.type !== 'run.result') return;
      const s = current.current;
      const plan = planFailedRunResume({
        payload: frame.payload,
        sessionId: s.id,
        autonomy: s.prefs.autonomy,
        ownedRequestId: ownedRuns.current.get(s.id),
        stopped: stopping.current === s.id,
        resumesSoFar: resumes.get(s.id) ?? 0,
        baseDelayMs: Number(s.prefs.autonomyDelayMs) || 0,
      });
      if (plan.kind === 'reset') resumes.delete(s.id);
      if (plan.kind === 'paused') notice(plan.notice);
      if (plan.kind !== 'resume') return;
      resumes.set(s.id, plan.attempt);
      const owner = s.id;
      const lastUser = lastUserMessageId(s);
      clearTimeout(timer);
      notice(plan.notice);
      timer = setTimeout(() => {
        const now = current.current;
        if (
          now.id !== owner ||
          now.running ||
          now.prefs.autonomy !== 'auto' ||
          stopping.current === owner ||
          lastUserMessageId(now) !== lastUser ||
          queueRef.current.some((item) => item.sessionId === owner)
        )
          return;
        dispatch(plan.prompt, []);
      }, plan.delayMs);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [subscribe, current, ownedRuns, stopping, queueRef, notice, dispatch]);
}
