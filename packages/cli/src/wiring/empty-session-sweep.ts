import type { Logger, SessionStore } from '@wrongstack/contracts/types';
import { getSessionRegistry } from '@wrongstack/core/storage';
import { scheduleOwnerlessEmptySessionCleanup } from '@wrongstack/webui-server';
import { consoleLogger } from '../webui-server/logger-shim.js';

/**
 * Idle floor for the interactive sweep. A session younger than this may have
 * been created moments ago in a surface whose holdings this process cannot
 * see (a background WebUI tab is invisible to the registry: activation
 * releases the previous lease, so only each process's current session is
 * catalog-visible). The floor makes that race fail safe instead of relying
 * on visibility this host does not have.
 */
export const INTERACTIVE_EMPTY_SESSION_SWEEP_MIN_IDLE_MS = 10 * 60_000;

/**
 * Sweep sessions earlier runs started and never used — this host's own
 * previous launches, and abandoned WebUI tabs — once shortly after an
 * interactive TUI/CLI start (plus the shared hourly cadence).
 *
 * Protection, in order: this run's active session (read live via
 * `getActiveSessionId`, so a session established after scheduling is still
 * protected), every session a live surface holds in the cross-process
 * SessionRegistry (the catalog-backed current sessions; resolved per sweep,
 * fail-open on registry errors), the minimum idle age above, and the
 * scheduler's own fail-closed `isEmpty` + ownership-conflict skips.
 *
 * The scheduler's timers are unref'd, so nothing here keeps the process
 * alive; disposal is offered for hosts that have a shutdown path.
 */
export function scheduleInteractiveEmptySessionSweep(input: {
  sessionStore: SessionStore;
  globalRoot: string;
  projectSlug: string | undefined;
  /** Resolved live at sweep time — the session this boot establishes. */
  getActiveSessionId: () => string | undefined;
  logger?: Pick<Logger, 'info' | 'error'> | undefined;
}): { dispose: () => Promise<void>; runNow: () => Promise<{ deleted: number; errors: number }> } {
  const logger = input.logger ?? consoleLogger;
  return scheduleOwnerlessEmptySessionCleanup({
    getSessionStore: () => input.sessionStore,
    getActiveSessionId: () => input.getActiveSessionId() ?? '',
    getActiveSessionIds: () => [input.getActiveSessionId() ?? ''].filter(Boolean),
    getExtraProtectedSessionIds: async () => {
      if (!input.projectSlug) return [];
      try {
        const live = await getSessionRegistry(input.globalRoot).listByProject(input.projectSlug);
        return live.map((entry) => entry.sessionId);
      } catch {
        // Registry unavailable — sweep with only the local guards, like the
        // WebUI hosts do when their client set is empty.
        return [];
      }
    },
    // A run's first journal line lands at send time, so "empty" already
    // excludes sessions with in-flight work; there is no per-run registry
    // this host could consult beyond the list above.
    hasParticipants: () => false,
    refreshSessions: async () => undefined,
    minIdleMs: INTERACTIVE_EMPTY_SESSION_SWEEP_MIN_IDLE_MS,
    logger,
  });
}
