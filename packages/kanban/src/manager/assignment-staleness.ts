import type { KanbanAgentAssignment } from '../types.js';

export const STAMPLESS_ASSIGNMENT_STALE_MS = 10 * 60 * 1000;

export function isLeaseExpired(expiresAt: string | undefined, now: string): boolean {
  return expiresAt !== undefined && Date.parse(expiresAt) <= Date.parse(now);
}

/** Shared by recovery, claiming and queue classification; timestamps are instants. */
export function isAssignmentStale(
  assignment: KanbanAgentAssignment | undefined,
  now: string,
): boolean {
  if (!assignment || (assignment.status !== 'queued' && assignment.status !== 'running'))
    return false;
  const lastSignalAt = assignment.heartbeatAt ?? assignment.claimedAt;
  const stamplessAndSilent =
    assignment.leaseExpiresAt === undefined &&
    (lastSignalAt === undefined ||
      Date.parse(now) - Date.parse(lastSignalAt) >= STAMPLESS_ASSIGNMENT_STALE_MS);
  return isLeaseExpired(assignment.leaseExpiresAt, now) || stamplessAndSilent;
}
