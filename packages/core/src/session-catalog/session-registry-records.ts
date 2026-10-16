import type {
  AgentEntry,
  SessionLiveStatus,
  SessionRegistryEntry,
} from './session-registry-types.js';

export function sameOwner(
  entry: Pick<SessionRegistryEntry, 'pid' | 'startedAt'>,
  owner: Pick<SessionRegistryEntry, 'pid' | 'startedAt'>,
): boolean {
  return entry.pid === owner.pid && entry.startedAt === owner.startedAt;
}

/**
 * Parse registry file contents, tolerating corruption. A system crash can
 * leave the file zero-filled (NTFS journals the rename metadata but the data
 * blocks were never flushed — the file is its full size of NUL bytes), or a
 * torn write can leave invalid JSON. Treat anything unparsable — or parsable
 * but not a plain object — as an empty registry so the next write heals the
 * file instead of wedging every future write forever.
 */
export function emptyRegistry(): Record<string, SessionRegistryEntry> {
  return Object.create(null) as Record<string, SessionRegistryEntry>;
}

export function parseRegistry(raw: string): Record<string, SessionRegistryEntry> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // Session IDs are object keys. A null-prototype map keeps identifiers
      // such as `__proto__` as ordinary own properties and avoids inherited
      // names being mistaken for registered sessions.
      const registry = emptyRegistry();
      for (const [id, entry] of Object.entries(parsed)) registry[id] = entry;
      return registry;
    }
  } catch {
    /* corrupt file — fall through to empty */
  }
  return emptyRegistry();
}

/** Derive the session-level status from the agent collective. */
export function deriveSessionStatus(agents: AgentEntry[]): SessionLiveStatus {
  const hasRunning = agents.some((a) => a.status === 'running' || a.status === 'streaming');
  const hasWaiting = agents.some((a) => a.status === 'waiting_user');
  const hasError = agents.some((a) => a.status === 'error');
  return hasRunning || hasWaiting || hasError ? 'active' : 'idle';
}
