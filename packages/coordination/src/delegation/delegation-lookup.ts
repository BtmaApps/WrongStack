/**
 * Process-wide lookup over live `DelegationTracker`s.
 *
 * Kept dependency-free on purpose: `await_tasks` (director-basic-tools) and
 * the agent loop need to ask "does this task / delegation belong to a
 * background delegation?" without importing the tracker (and through it the
 * director graph), which would close an import cycle.
 *
 * @module coordination/delegation/delegation-lookup
 */

export interface TrackedDelegationInfo {
  delegationId: string;
  sessionId: string;
  state: string;
  /** Task ids of every attempt so far, oldest first. */
  taskIds: readonly string[];
  /** True once the delegation settled and `taskId` was its final attempt. */
  isTerminal: boolean;
}

export interface DelegationLookupSource {
  lookupByTaskId(taskId: string): TrackedDelegationInfo | undefined;
  noteLeaderConsumed(taskId: string): boolean;
  markDelivered(delegationId: string): boolean;
}

const sources = new Set<DelegationLookupSource>();

/** Register a tracker. Returns the unregister function. */
export function registerDelegationLookupSource(source: DelegationLookupSource): () => void {
  sources.add(source);
  return () => {
    sources.delete(source);
  };
}

/** Background delegation owning `taskId`, if any live tracker knows it. */
export function findDelegationForTask(taskId: string): TrackedDelegationInfo | undefined {
  for (const source of sources) {
    const hit = source.lookupByTaskId(taskId);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * The leader received `taskId`'s result in-band (`await_tasks`). When that is
 * the delegation's terminal attempt, its pending delivery is suppressed.
 */
export function noteLeaderConsumedTask(taskId: string): boolean {
  let hit = false;
  for (const source of sources) {
    if (source.noteLeaderConsumed(taskId)) hit = true;
  }
  return hit;
}

/** The agent loop injected this delegation's result into the leader. */
export function markDelegationDelivered(delegationId: string): boolean {
  let hit = false;
  for (const source of sources) {
    if (source.markDelivered(delegationId)) hit = true;
  }
  return hit;
}
