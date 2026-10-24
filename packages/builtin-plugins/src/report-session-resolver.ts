import type { ChimeraReportSessionResolverFactory } from '@wrongstack/contracts/types/mailbox';
import { JsonlReportStore } from './review-report-store.js';

/**
 * Chimera report → session lookup for one project directory. Hosts bind it to
 * core's `CHIMERA_REPORT_SESSION_RESOLVER` so the mailbox session-affinity
 * filter can place report-scoped mail that carries no session id.
 */
export const createChimeraReportSessionResolver: ChimeraReportSessionResolverFactory = (
  projectDir,
) => {
  const store = new JsonlReportStore(projectDir);
  return async (reportId) => (await store.get(reportId))?.sessionId;
};
