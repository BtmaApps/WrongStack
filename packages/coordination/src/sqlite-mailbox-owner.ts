/**
 * DB-level ownership fence for the project SQLite mailbox.
 *
 * The IPC endpoint election (`bindProjectEndpoint` in `@wrongstack/persistence`)
 * only arbitrates between processes that speak the SAME protocol version: the
 * endpoint path embeds `MAILBOX_PROJECT_SERVER_PROTOCOL_VERSION`, so during a
 * rolling release an old daemon and a new daemon each hold their own endpoint
 * while pointing at the SAME `_mailbox.sqlite`. Both would run compaction
 * timers, both would write (only `busy_timeout` guards that), and clients
 * would see divergent event feeds.
 *
 * This module closes that hole in the database itself. The winning owner
 * records itself in `mailbox_meta` and refreshes a heartbeat; a second owner
 * that finds a LIVE row from a DIFFERENT endpoint refuses to open the
 * database instead of co-owning it. A row whose heartbeat expired belongs to
 * an owner that died without cleanup and may be taken over.
 *
 * The fence is deliberately independent of the endpoint election: it is the
 * only guard that survives a protocol-version split.
 *
 * @module coordination/sqlite-mailbox-owner
 */
import * as fs from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { loadDatabaseSync } from '@wrongstack/core/utils';

/** `mailbox_meta` key holding the owner fence row. */
export const MAILBOX_OWNER_META_KEY = 'mailbox_owner';

/**
 * How often the owner refreshes its heartbeat row.
 *
 * Same order of magnitude as the daemon's other sweeps (client lease sweep,
 * auto-compaction) — short enough that a crashed owner is reclaimable
 * quickly, long enough that it is not a busy poll.
 */
export const MAILBOX_OWNER_HEARTBEAT_INTERVAL_MS = 5_000;

/**
 * A heartbeat older than this means the owner is gone.
 *
 * Deliberately conservative: it must exceed 3x the daemon's client lease
 * (DEFAULT_CLIENT_LEASE_MS = 45s in mailbox-project-server.ts) so a live
 * but slow owner — a long SQLite transaction, a WAL checkpoint, a GC pause —
 * is never declared dead while clients are still leased to it. 135s is
 * 3x that lease and 27x the heartbeat interval. The cost is that a
 * hard-killed owner fences the database for up to this long before it is
 * reclaimable; that is the correct direction for a correctness fence.
 */
export const MAILBOX_OWNER_STALE_MS = 135_000;

/** Who the owner is. The endpoint already carries the protocol version. */
export interface MailboxOwnerIdentity {
  /** IPC endpoint the owner serves on. */
  endpoint: string;
  /** Process id of the owner. */
  pid: number;
  /** Mailbox IPC protocol version the owner speaks. */
  protocolVersion: number;
}

/** The owner fence row as stored in `mailbox_meta`. */
export interface MailboxOwnerRecord extends MailboxOwnerIdentity {
  /** ISO-8601 timestamp of the last heartbeat refresh. */
  heartbeatAt: string;
}

/** The store surface the fence needs: a handle and a transaction helper. */
export interface MailboxOwnerStore {
  db: DatabaseSync;
  transaction: <T>(run: () => T) => T;
}

/** Raised when a live owner on another endpoint already holds the database. */
export class MailboxOwnershipConflictError extends Error {
  readonly owner: MailboxOwnerRecord;

  constructor(owner: MailboxOwnerRecord) {
    super(
      `mailbox SQLite is owned by a live owner (endpoint ${owner.endpoint}, pid ${owner.pid}, ` +
        `protocol v${owner.protocolVersion}, heartbeat ${owner.heartbeatAt})`,
    );
    this.name = 'MailboxOwnershipConflictError';
    this.owner = owner;
  }
}

/**
 * Read the owner fence row.
 *
 * A missing table (a database that was never initialized) or a malformed row
 * reads as "no owner": the fence must never be the reason a healthy mailbox
 * refuses to start, and a row nobody can parse cannot fence anybody either.
 */
export function readMailboxOwner(db: DatabaseSync): MailboxOwnerRecord | null {
  if (!hasMailboxMetaTable(db)) return null;
  const row = db
    .prepare('SELECT value FROM mailbox_meta WHERE key = ?')
    .get(MAILBOX_OWNER_META_KEY) as { value: string } | undefined;
  if (row === undefined) return null;
  return parseOwnerRecord(row.value);
}

/** Write (or replace) the owner fence row. */
export function writeMailboxOwner(db: DatabaseSync, record: MailboxOwnerRecord): void {
  db.prepare(
    'INSERT INTO mailbox_meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(MAILBOX_OWNER_META_KEY, JSON.stringify(record));
}

/**
 * Remove the owner fence row, but only when it belongs to `endpoint`.
 *
 * A late release from an owner that already lost the database must not clear
 * the row of the owner that took over.
 */
export function clearMailboxOwner(db: DatabaseSync, endpoint: string): void {
  if (!hasMailboxMetaTable(db)) return;
  const current = readMailboxOwner(db);
  if (current === null || current.endpoint !== endpoint) return;
  db.prepare('DELETE FROM mailbox_meta WHERE key = ?').run(MAILBOX_OWNER_META_KEY);
}

/**
 * Whether an owner row is still live.
 *
 * A heartbeat that cannot be parsed is treated as expired (reclaimable): a
 * garbage timestamp must not lock the mailbox forever. A heartbeat slightly in
 * the future is treated as live — clock skew must not hand the database to a
 * second owner.
 */
export function isMailboxOwnerLive(
  record: MailboxOwnerRecord,
  nowMs: number,
  staleMs: number = MAILBOX_OWNER_STALE_MS,
): boolean {
  const heartbeatMs = Date.parse(record.heartbeatAt);
  if (!Number.isFinite(heartbeatMs)) return false;
  const ageMs = nowMs - heartbeatMs;
  return ageMs < staleMs && ageMs > -staleMs;
}

/**
 * Claim the database for `identity`.
 *
 * The read and the write happen in ONE transaction, so two owners racing for
 * the same file are serialized by SQLite: the loser sees the winner's fresh
 * row and is refused instead of overwriting it.
 *
 * @throws {MailboxOwnershipConflictError} when a live owner on a different
 * endpoint holds the database.
 */
export function claimMailboxOwnership(
  store: MailboxOwnerStore,
  identity: MailboxOwnerIdentity,
  nowMs: number = Date.now(),
): MailboxOwnerRecord {
  return store.transaction(() => {
    const current = readMailboxOwner(store.db);
    if (
      current !== null &&
      current.endpoint !== identity.endpoint &&
      isMailboxOwnerLive(current, nowMs)
    ) {
      throw new MailboxOwnershipConflictError(current);
    }
    const record: MailboxOwnerRecord = { ...identity, heartbeatAt: new Date(nowMs).toISOString() };
    writeMailboxOwner(store.db, record);
    return record;
  });
}

/**
 * Refresh the owner heartbeat.
 *
 * Returns `false` when another endpoint owns the database now — the caller
 * lost the fence and must not overwrite the new owner's row.
 */
export function refreshMailboxOwnership(
  store: MailboxOwnerStore,
  identity: MailboxOwnerIdentity,
  nowMs: number = Date.now(),
): boolean {
  return store.transaction(() => {
    const current = readMailboxOwner(store.db);
    if (current !== null && current.endpoint !== identity.endpoint) return false;
    const record: MailboxOwnerRecord = { ...identity, heartbeatAt: new Date(nowMs).toISOString() };
    writeMailboxOwner(store.db, record);
    return true;
  });
}

/** Release the fence on a clean stop. */
export function releaseMailboxOwnership(store: MailboxOwnerStore, endpoint: string): void {
  store.transaction(() => {
    clearMailboxOwner(store.db, endpoint);
  });
}

/**
 * Read the owner row straight from the database file.
 *
 * Used before the store is opened: the winner of the endpoint election has to
 * know whether somebody else already owns the file BEFORE any write (schema
 * migration included) touches it.
 */
export function inspectMailboxOwner(databasePath: string): MailboxOwnerRecord | null {
  if (!fs.existsSync(databasePath)) return null;
  const Database = loadDatabaseSync();
  const db = new Database(databasePath);
  try {
    // The inspect read races the live owner's writes; without a busy
    // timeout a WAL write in flight surfaces as SQLITE_BUSY and gets
    // misreported as "no owner" / "refused to start".
    db.exec('PRAGMA busy_timeout = 5000');
    return readMailboxOwner(db);
  } finally {
    db.close();
  }
}

/**
 * Refuse to open a database that a live owner on another endpoint holds.
 *
 * A stale row is reclaimable: the owner that wrote it died without cleaning
 * up, and taking the database over is exactly what should happen. A row for
 * the SAME endpoint is not foreign — that is this owner restarting, and the
 * claim re-takes it.
 *
 * @throws {MailboxOwnershipConflictError} when a foreign live owner holds it.
 */
export function assertMailboxOwnershipAvailable(
  databasePath: string,
  endpoint: string,
  nowMs: number = Date.now(),
): void {
  const owner = inspectMailboxOwner(databasePath);
  if (owner === null) return;
  if (owner.endpoint === endpoint) return;
  if (!isMailboxOwnerLive(owner, nowMs)) return;
  throw new MailboxOwnershipConflictError(owner);
}

function hasMailboxMetaTable(db: DatabaseSync): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'mailbox_meta'")
    .get() as { name?: string } | undefined;
  return row !== undefined;
}

function parseOwnerRecord(value: string): MailboxOwnerRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const candidate = parsed as Partial<MailboxOwnerRecord>;
  if (typeof candidate.endpoint !== 'string' || candidate.endpoint.length === 0) return null;
  if (typeof candidate.pid !== 'number' || !Number.isFinite(candidate.pid)) return null;
  if (typeof candidate.protocolVersion !== 'number' || !Number.isFinite(candidate.protocolVersion))
    return null;
  if (typeof candidate.heartbeatAt !== 'string') return null;
  return {
    endpoint: candidate.endpoint,
    pid: candidate.pid,
    protocolVersion: candidate.protocolVersion,
    heartbeatAt: candidate.heartbeatAt,
  };
}
