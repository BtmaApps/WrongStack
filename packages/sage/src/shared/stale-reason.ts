import type { Sage } from '../types.js';

/**
 * Upper bound between a verification run and the write that demoted a memory,
 * for records that predate `staleReason`. Verification stamps `lastVerifiedAt`
 * and persists the status change in the same mutation shortly after; a manual
 * status edit leaves `lastVerifiedAt` untouched, so it lands long after (or on
 * a memory never verified at all).
 */
export const LEGACY_VERIFICATION_STALE_WINDOW_MS = 15 * 60_000;

/**
 * Was this memory made stale by anchor verification, as opposed to being
 * retired by a person or agent (`memory_update` documents `status: "stale"`
 * as the way to retire a memory without deleting it)?
 *
 * Only verification staleness may be undone automatically — a hygiene pass or
 * a rename remap that brought a deliberately retired memory back into
 * injection would override an explicit decision.
 */
export function isVerificationStale(
  memory: Pick<Sage, 'status' | 'staleReason' | 'lastVerifiedAt' | 'updatedAt'>,
): boolean {
  if (memory.status !== 'stale') return false;
  if (memory.staleReason !== undefined) return memory.staleReason === 'verification';
  if (!memory.lastVerifiedAt) return false;
  const gap = Date.parse(memory.updatedAt) - Date.parse(memory.lastVerifiedAt);
  return Number.isFinite(gap) && gap >= 0 && gap <= LEGACY_VERIFICATION_STALE_WINDOW_MS;
}
