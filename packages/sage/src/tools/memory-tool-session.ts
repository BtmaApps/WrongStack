import type { SageServiceLike } from '../service-contract.js';

/**
 * The calling session's id, read from the live `Context`.
 *
 * Session identity is ambient — the agent loop knows it, the model does not.
 * Asking the model for it (as `remember`'s `ownerSessionId` argument does) puts
 * a value nothing can verify into an ownership field: a hallucinated id creates
 * a memory owned by a session that never existed, invisible to every reader,
 * while omitting it fails the store's validation outright. Reading it here
 * makes the write/read round-trip work without the model participating.
 *
 * Returns undefined for contexts with no session — notably the synthetic
 * `Context` the SAGE MCP server builds, where "no session" is the truth and
 * the fail-closed branch of the session filter is the right outcome.
 */
export function callerSessionId(ctx: unknown): string | undefined {
  const session = (ctx as { session?: { id?: unknown } } | undefined)?.session;
  const id = session?.id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/**
 * Refuse to mutate a session-scoped memory owned by a different session.
 *
 * Reads are isolated on every surface — a memory owned by another session is
 * not visible to search, path, file, or bulk enumeration — yet update, delete
 * and recover took a bare id and applied it, so a session could overwrite or
 * destroy a record it could not even read. Being able to mutate the invisible
 * is the inconsistency; this closes it at the tool layer, where the ambient
 * session identity lives.
 *
 * The store keeps its unrestricted capability on purpose: hygiene
 * consolidation and the admin/recovery helpers legitimately act across every
 * session, and moving the check into the store would break them.
 */
export async function assertSessionMayMutate(
  memory: SageServiceLike,
  id: string,
  ctx: unknown,
): Promise<void> {
  const target = await memory.getSage(id);
  if (target?.scope !== 'session' || !target.ownerSessionId) return;
  const caller = callerSessionId(ctx);
  if (target.ownerSessionId === caller) return;
  throw new Error(
    `SAGE "${id}" is a session-scoped memory owned by another session and cannot be modified from here.`,
  );
}
