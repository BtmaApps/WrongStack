/**
 * State, construction and chain/row helpers of the {@link ChronicleSqliteJournal}
 * (sqlite-journal.ts): option validation, pragmas, prepared statements, the
 * per-day chain anchors and `maxEvents` prefix eviction.
 */
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { GENESIS_HASH } from './event-hash.js';
import type { StoredChroniclePayload } from './payload-codec.js';
import {
  ChronicleQuotaManager,
  MIN_SQLITE_PAGE_BUDGET_BYTES,
  SQLITE_FIXED_OVERHEAD_BYTES,
  WAL_AUTOCHECKPOINT_PAGES,
  WAL_SIZE_LIMIT_BYTES,
} from './sqlite-journal-quota.js';
import {
  CHRONICLE_SQLITE_FILE,
  ensureChronicleSchema,
  ensureIncrementalVacuum,
  loadDatabaseSync,
  projectEvent,
} from './sqlite-journal-schema.js';
import type { ChronicleEvent } from './types.js';

/**
 * How far `maxEvents` may be overshot before prefix eviction runs.
 *
 * Eviction costs O(rows deleted), plus an index update per surviving secondary
 * index, plus the `chain_checkpoint` write that keeps the truncated chain
 * verifiable. A journal parked exactly at its ceiling pays all of that on
 * *every* append — and sitting at the ceiling is the steady state for any
 * long-lived project, not an edge case. Letting the table drift a little above
 * the ceiling and then cutting back to it amortises the same total work across
 * ~`slack` appends.
 *
 * The slack is a fraction of the ceiling rather than a constant so that small
 * ceilings — including the single-digit ones the tests pin — keep the exact
 * `maxEvents` bound they document.
 */
const TRIM_SLACK_RATIO = 0.02;
const MAX_TRIM_SLACK_EVENTS = 2_000;

/**
 * Pages handed back to the filesystem per maintenance pass.
 *
 * 4 096 pages is ~16 MiB at the default page size — enough that a day's purge
 * is reclaimed in one pass, small enough that the walk stays off the critical
 * path of an append.
 */
const INCREMENTAL_VACUUM_PAGES = 4_096;

/** Smaller slice for the per-append trim, which runs far more often. */
export const TRIM_VACUUM_PAGES = 256;
export interface ChronicleSqliteJournalOptions {
  /** Directory holding the journal, i.e. `<projectDir>/chronicle`. */
  directory: string;
  now?: (() => Date) | undefined;
  monotonicNow?: (() => bigint) | undefined;
  idFactory?: (() => string) | undefined;
  /** Optional age bound, enforced during periodic maintenance. */
  retentionDays?: number | undefined;
  /** Optional row ceiling; oldest rows are checkpointed and evicted after each append. */
  maxEvents?: number | undefined;
  /** Aggregate SQLite allocation ceiling across the database, WAL, and SHM files. */
  maxBytes?: number | undefined;
  retentionCheckIntervalMs?: number | undefined;
  /**
   * WAL durability level. Defaults to `'normal'`.
   *
   * In WAL mode `NORMAL` still survives a **process** crash — an aborted
   * agent, an OOM kill, a `taskkill` — because the WAL is already written;
   * only an OS crash or power loss can cost the last commits. `FULL` adds an
   * fsync to every commit to close that last gap.
   *
   * This journal is the highest-volume writer in the runtime (measured at
   * ~7.2GB over 7 days), so that per-commit fsync was the single largest
   * source of disk I/O in the system — paid continuously, for telemetry that
   * is reconstructible from the session logs. Every other SQLite store here
   * (mailbox, kanban, techstack, vector-memory) runs `NORMAL`.
   *
   * Set `'full'` when the deployment genuinely needs power-loss durability
   * for the audit trail.
   */
  durability?: 'normal' | 'full' | undefined;
}

export interface ChronicleSqlitePurgeOptions {
  retentionDays: number;
  dryRun?: boolean | undefined;
}

export interface ChainAnchor {
  sequence: number;
  hash: string;
}

/** A day family the import refused to move, and why. */
export interface ChronicleQuarantinedFamily {
  day: string;
  sequence: number;
  reason: string;
}

/** Write surface handed to a legacy import; see {@link ChronicleSqliteJournal.runFamilyImport}. */
export interface ChronicleImportSink {
  /**
   * Store an event with its recorded `sequence`, `previousHash` and `hash`.
   *
   * The payload is re-serialized rather than copied byte-for-byte from the
   * JSONL line, which is safe because the hash preimage is the *canonical*
   * encoding derived from the parsed event (§3.1 of the spec) — not the stored
   * bytes. `JSON.parse` round-trips it exactly, so verification is unaffected.
   */
  insert(day: string, event: ChronicleEvent): void;
  /** Carry a legacy day-family retention checkpoint over. */
  checkpoint(day: string, sequence: number, hash: string): void;
}
export abstract class ChronicleSqliteJournalCore {
  protected readonly db: DatabaseSync;
  protected readonly dbPath: string;
  protected readonly now: () => Date;
  protected readonly monotonicNow: () => bigint;
  protected readonly idFactory: () => string;
  protected readonly retentionDays: number | undefined;
  protected readonly maxEvents: number | undefined;
  protected readonly retentionCheckIntervalMs: number;
  /** Overshoot allowed above `maxEvents` before eviction runs; see TRIM_SLACK_RATIO. */
  protected readonly trimSlack: number;
  protected readonly quotaManager: ChronicleQuotaManager;
  protected nextRetentionCheckAt = 0;
  protected retainedEventCount = 0;

  /**
   * Statements reused across appends.
   *
   * `db.prepare` re-parses the SQL every call, and the append path used to
   * prepare five statements per batch. They are held rather than re-prepared
   * because the schema cannot change under an open journal.
   */
  protected statements:
    | {
        insert: ReturnType<DatabaseSync['prepare']>;
        trimBoundary: ReturnType<DatabaseSync['prepare']>;
        writeCheckpoint: ReturnType<DatabaseSync['prepare']>;
        deletePrefix: ReturnType<DatabaseSync['prepare']>;
        deleteCheckpoints: ReturnType<DatabaseSync['prepare']>;
      }
    | undefined;

  /**
   * Cached chain head per day. Cleared wholesale on any write failure so the
   * next append rebuilds from the database rather than trusting a counter that
   * may have advanced past what actually committed.
   */
  protected readonly anchors = new Map<string, ChainAnchor>();

  protected readonly counters = {
    acceptedEvents: 0,
    persistedEvents: 0,
    rejectedEvents: 0,
    failedEvents: 0,
    batches: 0,
    maxObservedPending: 0,
    largestBatch: 0,
  };
  protected lastBatchDurationMs: number | undefined;

  constructor(options: ChronicleSqliteJournalOptions) {
    this.dbPath = path.join(path.resolve(options.directory), CHRONICLE_SQLITE_FILE);
    this.now = options.now ?? (() => new Date());
    this.monotonicNow = options.monotonicNow ?? (() => process.hrtime.bigint());
    this.idFactory = options.idFactory ?? (() => randomUUID());
    if (
      options.retentionDays !== undefined &&
      (!Number.isFinite(options.retentionDays) || options.retentionDays <= 0)
    ) {
      throw new RangeError('retentionDays must be a positive finite number');
    }
    if (
      options.retentionCheckIntervalMs !== undefined &&
      (!Number.isFinite(options.retentionCheckIntervalMs) || options.retentionCheckIntervalMs <= 0)
    ) {
      throw new RangeError('retentionCheckIntervalMs must be a positive finite number');
    }
    if (
      options.maxEvents !== undefined &&
      (!Number.isInteger(options.maxEvents) || options.maxEvents < 1)
    ) {
      throw new RangeError('maxEvents must be a positive integer');
    }
    if (
      options.maxBytes !== undefined &&
      (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1)
    ) {
      throw new RangeError('maxBytes must be a positive safe integer');
    }
    const minimumQuotaBytes = SQLITE_FIXED_OVERHEAD_BYTES + 2 * MIN_SQLITE_PAGE_BUDGET_BYTES;
    if (options.maxBytes !== undefined && options.maxBytes < minimumQuotaBytes) {
      throw new RangeError(`maxBytes must be at least ${minimumQuotaBytes}`);
    }
    this.retentionDays = options.retentionDays;
    this.maxEvents = options.maxEvents;
    this.retentionCheckIntervalMs = options.retentionCheckIntervalMs ?? 60 * 60 * 1_000;
    this.trimSlack =
      this.maxEvents === undefined
        ? 0
        : Math.min(MAX_TRIM_SLACK_EVENTS, Math.floor(this.maxEvents * TRIM_SLACK_RATIO));
    const Database = loadDatabaseSync();
    this.db = new Database(this.dbPath);
    // Every step below can throw on a real machine — a corrupt database, a
    // read-only directory, a full disk — and the handle is already open and
    // (from the WAL pragma on) holding a write-ahead log. A caller cannot
    // close it: the constructor never returned, so there is no instance to call
    // close() on. Close it here, on the only path that still holds the
    // reference, and rethrow. Without this the handle leaks for the life of
    // the process; on Windows the file then cannot even be unlinked.
    try {
      // Before the WAL switch and before any CREATE TABLE: SQLite only accepts
      // the auto_vacuum header bit while the file is empty and still in
      // rollback-journal mode. After WAL it is a silent no-op.
      ensureIncrementalVacuum(this.db);
      this.db.exec('PRAGMA journal_mode = WAL');
      this.db.exec(
        options.durability === 'full' ? 'PRAGMA synchronous = FULL' : 'PRAGMA synchronous = NORMAL',
      );
      this.db.exec(`PRAGMA wal_autocheckpoint = ${WAL_AUTOCHECKPOINT_PAGES}`);
      this.db.exec(`PRAGMA journal_size_limit = ${WAL_SIZE_LIMIT_BYTES}`);
      ensureChronicleSchema(this.db);
      this.quotaManager = new ChronicleQuotaManager(this.db, this.dbPath, options.maxBytes);
      this.quotaManager.configure();
      if (this.maxEvents !== undefined) {
        const row = this.db.prepare('SELECT COUNT(*) AS count FROM events').get() as {
          count: number;
        };
        this.retainedEventCount = row.count;
        this.enforceEventLimitAtStartup();
      }
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  protected enforceEventLimitWithinTransaction(count: number, slack = this.trimSlack): number {
    if (this.maxEvents === undefined || count <= this.maxEvents + slack) return count;

    const excess = count - this.maxEvents;
    const statements = this.preparedStatements();
    const boundary = statements.trimBoundary.get(excess - 1) as
      | (ChainAnchor & { day: string })
      | undefined;
    if (!boundary) return count;

    statements.writeCheckpoint.run(boundary.day, boundary.sequence, boundary.hash);
    statements.deletePrefix.run(boundary.day, boundary.day, boundary.sequence);
    statements.deleteCheckpoints.run(boundary.day);
    for (const day of this.anchors.keys()) {
      if (day <= boundary.day) this.anchors.delete(day);
    }
    return this.maxEvents;
  }

  protected enforceEventLimitAtStartup(): void {
    if (this.maxEvents === undefined || this.retainedEventCount <= this.maxEvents) return;
    try {
      this.db.exec('BEGIN IMMEDIATE');
      const retainedCount = this.enforceEventLimitWithinTransaction(this.retainedEventCount, 0);
      this.db.exec('COMMIT');
      this.retainedEventCount = retainedCount;
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // Preserve the original startup failure.
      }
      throw error;
    }
  }
  /**
   * Return freed pages to the filesystem, a bounded slice at a time.
   *
   * `incremental_vacuum(N)` is O(N) and interruptible, unlike `VACUUM`, so the
   * daemon can shed a purge's worth of pages without a stop-the-world rewrite.
   * A no-op when the database is not in incremental mode.
   */
  protected reclaimFreePages(pages = INCREMENTAL_VACUUM_PAGES): void {
    try {
      this.db.exec(`PRAGMA incremental_vacuum(${pages})`);
    } catch {
      // Not in incremental mode, or a concurrent reader holds the file. The
      // pages stay on the freelist and are reused by the next append.
    }
  }
  protected preparedStatements(): NonNullable<ChronicleSqliteJournalCore['statements']> {
    this.statements ??= {
      insert: this.db.prepare(
        `INSERT INTO events (
           day, sequence, event_id, hash, previous_hash, occurred_at, event_type, outcome,
           project_id, session_id, agent_id, task_id, trace_id, logical_request_id, prompt_manifest_id,
           resource_kind, resource_id, resource_path, duration_ns, payload
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ),
      trimBoundary: this.db.prepare(
        'SELECT day, sequence, hash FROM events ORDER BY day, sequence LIMIT 1 OFFSET ?',
      ),
      writeCheckpoint: this.db.prepare(
        `INSERT INTO chain_checkpoint (day, sequence, hash) VALUES (?, ?, ?)
         ON CONFLICT(day) DO UPDATE SET sequence = excluded.sequence, hash = excluded.hash`,
      ),
      deletePrefix: this.db.prepare(
        'DELETE FROM events WHERE day < ? OR (day = ? AND sequence <= ?)',
      ),
      deleteCheckpoints: this.db.prepare('DELETE FROM chain_checkpoint WHERE day < ?'),
    };
    return this.statements;
  }

  protected countRows(): number {
    return (this.db.prepare('SELECT COUNT(*) AS count FROM events').get() as { count: number })
      .count;
  }

  protected readMeta(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM chronicle_meta WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value;
  }

  protected readCheckpoint(day: string): ChainAnchor | undefined {
    return this.db.prepare('SELECT sequence, hash FROM chain_checkpoint WHERE day = ?').get(day) as
      | ChainAnchor
      | undefined;
  }

  protected days(): string[] {
    const rows = this.db.prepare('SELECT DISTINCT day FROM events ORDER BY day').all() as Array<{
      day: string;
    }>;
    return rows.map((row) => row.day);
  }

  protected readAnchor(day: string): ChainAnchor {
    const cached = this.anchors.get(day);
    if (cached) return cached;
    const last = this.db
      .prepare('SELECT sequence, hash FROM events WHERE day = ? ORDER BY sequence DESC LIMIT 1')
      .get(day) as ChainAnchor | undefined;
    const anchor = last ?? this.readCheckpoint(day) ?? { sequence: 0, hash: GENESIS_HASH };
    this.anchors.set(day, anchor);
    return anchor;
  }
  /** Insert one event row through an `INSERT INTO events` statement. */
  protected insertEventRow(
    statement: ReturnType<DatabaseSync['prepare']>,
    day: string,
    event: ChronicleEvent,
    payload: StoredChroniclePayload,
  ): void {
    const row = projectEvent(event);
    statement.run(
      day,
      event.sequence,
      event.eventId,
      event.hash,
      event.previousHash,
      row.occurredAt,
      event.eventType,
      row.outcome,
      row.projectId,
      row.sessionId,
      row.agentId,
      row.taskId,
      row.traceId,
      row.logicalRequestId,
      row.promptManifestId,
      row.resourceKind,
      row.resourceId,
      row.resourcePath,
      row.durationNs,
      payload,
    );
  }
}
