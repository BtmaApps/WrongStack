/** Absolute recursion ceiling. Configuration may narrow this, never widen it. */
export const HARD_MAX_SPAWN_DEPTH = 2;

/** CLI fleet default; core embedders retain their historical Infinity default. */
export const DEFAULT_MAX_FLEET_SPAWNS = 64;

export function resolveMaxSpawnDepth(requested?: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return HARD_MAX_SPAWN_DEPTH;
  return Math.max(0, Math.min(HARD_MAX_SPAWN_DEPTH, Math.floor(requested)));
}
