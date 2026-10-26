import { MAX_FAILED_RUN_RESUMES } from '@wrongstack/contracts/types/failed-run-resume';

/**
 * Automatic resumes fired in a row per session after provider failures. The
 * Continue countdown reads the next attempt number from here; a completed run
 * resets it, so each separate outage gets the full budget. Kept outside React
 * so the count survives the failed message's bubble remounting.
 */
const resumesBySession = new Map<string, number>();

/** Bound the map: a long-lived page cycles through many sessions. */
const MAX_TRACKED_SESSIONS = 32;

/** 1-based number of the next automatic resume for `sessionId`. */
export function nextFailedRunResumeAttempt(sessionId: string): number {
  return (resumesBySession.get(sessionId) ?? 0) + 1;
}

/** False once {@link MAX_FAILED_RUN_RESUMES} resumes in a row have failed. */
export function canResumeFailedRun(sessionId: string): boolean {
  return (resumesBySession.get(sessionId) ?? 0) < MAX_FAILED_RUN_RESUMES;
}

/** Count one automatic resume that was actually sent. */
export function recordFailedRunResume(sessionId: string): void {
  if (!resumesBySession.has(sessionId) && resumesBySession.size >= MAX_TRACKED_SESSIONS) {
    const oldest = resumesBySession.keys().next().value;
    if (oldest !== undefined) resumesBySession.delete(oldest);
  }
  resumesBySession.set(sessionId, (resumesBySession.get(sessionId) ?? 0) + 1);
}

/** A run completed: the outage is over. */
export function resetFailedRunResumes(sessionId: string): void {
  resumesBySession.delete(sessionId);
}
