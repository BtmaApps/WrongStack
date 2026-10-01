import * as fs from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import type { MemoryCandidate, Sage, SageAuditRecord } from './types.js';

export interface SqliteAuditRow {
  event: string;
  at: string;
  trace_id: string | null;
  data: string | null;
}

export function sqliteRowToMemory(row: { data: string }): Sage {
  const parsed: unknown = JSON.parse(row.data);
  validateMemoryShape(parsed, row.data);
  return repairMemoryStamps(parsed as Sage);
}

/**
 * Minimum runtime validation for a persisted Sage record. Checks the
 * structural fields that make the record usable by the store layer.
 * Throws `CorruptMemoryError` on validation failure so callers can
 * distinguish corruption from a missing row.
 *
 * Does NOT validate every optional field — the goal is to catch
 * truncated/garbled JSON and schema-mismatch records, not to enforce
 * full type safety on every property.
 *
 * `createdAt`/`updatedAt` are required to be PRESENT but are NOT type-checked
 * as strings: their value is normalized by {@link repairMemoryStamps}. A
 * present-but-unparseable stamp (a legacy import, a hand-edit, an older
 * schema) must be repaired rather than rejected, because every memory
 * consumer wraps this decode in `catch`-and-skip
 * (`sqliteRowsToMemories`: "One corrupt row must not hide the whole result
 * set") — throwing would hide the row from hygiene entirely, and a memory
 * hygiene cannot see is a memory that never ages out.
 */
function validateMemoryShape(value: unknown, rawData: string): void {
  if (!value || typeof value !== 'object') {
    throw new CorruptMemoryError('Memory record is not an object', rawData);
  }
  const m = value as Record<string, unknown>;
  const required: Array<[string, string]> = [
    ['id', 'string'],
    ['text', 'string'],
    ['scope', 'string'],
    ['kind', 'string'],
    ['status', 'string'],
    ['importance', 'number'],
    ['confidence', 'number'],
    ['freshness', 'number'],
  ];
  for (const [field, expectedType] of required) {
    const v = m[field];
    if (v === undefined || typeof v !== expectedType) {
      throw new CorruptMemoryError(
        `Memory record field "${field}" is ${v === undefined ? 'missing' : `type ${typeof v}`}, expected ${expectedType}`,
        rawData,
      );
    }
  }
  for (const field of MEMORY_STAMP_FIELDS) {
    if (m[field] === undefined) {
      throw new CorruptMemoryError(
        `Memory record field "${field}" is missing, expected a timestamp`,
        rawData,
      );
    }
  }
}

/**
 * Error thrown when a persisted memory record fails runtime validation.
 * Carries the raw JSON so callers can log or audit the corruption detail.
 */
export class CorruptMemoryError extends Error {
  readonly rawData: string;
  constructor(message: string, rawData: string) {
    super(`Corrupt SAGE memory record: ${message}`);
    this.name = 'CorruptMemoryError';
    this.rawData = rawData;
  }
}

/**
 * Read a single memory by id from the `memories` table and parse it into
 * the typed `Sage` shape. Returns `null` when the row is missing.
 * Throws `CorruptMemoryError` when the row exists but the JSON payload
 * fails validation — so callers can distinguish corruption from absence.
 *
 * Pure read; does not mutate. The `stmt` is whatever the caller already
 * threads through (typically a `SqliteStatementCache` lookup), so the
 * helper fits the existing `Sqlite*Context` interfaces without imposing
 * a new dependency.
 */
export function readSqliteSageRow(
  stmt: (sql: string) => ReturnType<DatabaseSync['prepare']>,
  id: string,
): Sage | null {
  const row = stmt('SELECT data FROM memories WHERE id = ?').get(id) as
    | { data: string }
    | undefined;
  if (!row) return null;
  // Validation: throws CorruptMemoryError on bad shape, Error on bad JSON.
  return sqliteRowToMemory(row);
}

/**
 * Sentinel for a candidate whose stored timestamp is unusable (missing, a
 * legacy epoch number, or an unparseable string).
 *
 * Deliberately NOT a rejection. Every candidate scan already wraps this decode
 * in `catch { continue }` — "One corrupt row must not hide the whole review
 * queue" — so throwing on a bad timestamp would silently drop the row from the
 * queue, and the H2 sweep would then skip it forever, which is the same
 * permanent stall this normalization exists to prevent. Repairing to the epoch
 * instead keeps the row visible AND gives every downstream `Date.parse` a
 * finite value, so the never-satisfiable-timestamp class is closed at the
 * boundary rather than in each consumer:
 *
 *  - reconcile sweep → very old, so outside the grace window: released/relinked
 *  - session GC      → past `sessionRetentionMs`, so it ages out
 *  - review dedupe   → past the 90-day suppression, so it may resurface
 *  - stale-reason    → gap too large to read as verification staleness (fail-safe)
 *  - search recency  → clamps to 0
 */
const UNPARSEABLE_STAMP_SENTINEL = new Date(0).toISOString();

/** Required memory stamps normalized at the decode boundary. */
const MEMORY_STAMP_FIELDS = ['createdAt', 'updatedAt'] as const;

/**
 * Optional memory stamps whose UNPARSEABLE value is dropped rather than
 * repaired to the epoch.
 *
 * The asymmetry is deliberate. A required stamp (`createdAt`/`updatedAt`) is
 * normalized to the epoch — maximally old — so a corrupt row is treated as
 * maximally stale and retention GC collects it. For an OPTIONAL stamp, "old"
 * carries an expiry decision, and the epoch would be a fabricated claim: it
 * would read as "expired since 1970" and immediately destroy a memory whose
 * real expiry is simply unknown.
 *
 * `expiresAt` decides the outcome for two different consumers:
 *   - hygiene session GC (L704): `expiresAt !== undefined &&
 *     Date.parse(expiresAt) <= nowMs` — with an unparseable value `NaN <= now`
 *     is false AND the `expiresAt === undefined` age fallback is skipped, so
 *     the memory is never aged out at all.
 *   - hygiene review-candidate pass (L714): `if (m.expiresAt &&
 *     Date.parse(expiresAt) <= nowMs)` — NOT session-gated, so force-expiring
 *     would file an `expires_at_passed` review candidate for every
 *     corrupt-stamped memory of ANY scope.
 * Dropping to `undefined` makes the first fall through to the documented
 * retention path (`nowMs - Date.parse(updatedAt) >= sessionRetentionMs`, which
 * is finite because the required stamps are repaired) and the second skip
 * entirely. Data-preserving on both paths.
 *
 * `lastAccessedAt` and `lastVerifiedAt` carry no expiry semantics: consumers
 * already treat an absent value as "unknown" via `??` / a falsy guard, and
 * `review-freshness.ts` maps a non-finite `lastVerifiedAt` to the honest
 * `'unverified_anchor'` label while `isVerificationStale` fails safe on a
 * falsy `lastVerifiedAt`. Dropping preserves exactly that behavior.
 */
const OPTIONAL_MEMORY_STAMP_FIELDS = ['expiresAt', 'lastAccessedAt', 'lastVerifiedAt'] as const;

/** True when a value is a non-empty string that `Date.parse` understands. */
function isParseableStamp(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

/** Keep a parseable stamp verbatim; repair anything else to the sentinel. */
function normalizeRequiredStamp(value: unknown): string {
  return isParseableStamp(value) ? (value as string) : UNPARSEABLE_STAMP_SENTINEL;
}

/**
 * Normalize a memory's required stamps so every consumer's date arithmetic is
 * finite.
 *
 * `validateMemoryShape` used to accept any STRING for `createdAt`/`updatedAt`
 * without checking it parsed. A present-but-unparseable stamp then flowed into
 * the hygiene session-GC arithmetic — `nowMs - Date.parse(updatedAt) >=
 * sessionRetentionMs` — where `NaN >= n` is false, so the memory was NEVER
 * aged out and outlived its 7-day ephemeral retention indefinitely. Repairing
 * to the epoch makes it maximally old, so retention GC collects it (correct:
 * an unparseable stamp means the row is not trustworthy evidence of recency).
 * This is the memory-row twin of the candidate normalization below, and it is
 * the same "repair, don't reject" rule: throwing here would make
 * `sqliteRowsToMemories` skip the row, hiding it from hygiene entirely.
 */
function repairMemoryStamps(memory: Sage): Sage {
  const record = memory as unknown as Record<string, unknown>;
  const createdAt = normalizeRequiredStamp(record['createdAt']);
  const updatedAt = normalizeRequiredStamp(record['updatedAt']);
  const requiredChanged = createdAt !== record['createdAt'] || updatedAt !== record['updatedAt'];

  // Optional stamps: a present-but-unparseable value is dropped (not expired).
  const dropped: string[] = [];
  for (const field of OPTIONAL_MEMORY_STAMP_FIELDS) {
    const v = record[field];
    if (v === undefined || isParseableStamp(v)) continue;
    dropped.push(field);
  }

  // Only allocate a repaired copy when a stamp actually needed repair, so the
  // common well-formed row decodes with no extra object.
  if (!requiredChanged && dropped.length === 0) return memory;
  const next: Record<string, unknown> = { ...record, createdAt, updatedAt };
  for (const field of dropped) delete next[field];
  return next as unknown as Sage;
}

/**
 * Identity fields present on every candidate ever written, including the
 * legacy JSONL rows replayed by `sqlite-store-jsonl-migration.ts`. A row
 * missing one of these is genuinely corrupt.
 *
 * `kind`/`scope` are deliberately NOT in this list: the JSONL→SQLite migration
 * inserts legacy rows verbatim, and older candidate records predate those
 * fields. Requiring them made the codec reject real migrated rows, dropping
 * them from the review queue — the exact "one corrupt row must not hide the
 * whole queue" failure the callers' `catch` is there to prevent. They are still
 * type-checked when present (see below), matching `validateMemoryShape`'s
 * stated scope: catch garbled records, not enforce full type safety.
 */
const REQUIRED_CANDIDATE_STRING_FIELDS = ['id', 'status', 'text'] as const;

/** Classification fields: optional for legacy rows, but must be strings when set. */
const OPTIONAL_CANDIDATE_STRING_FIELDS = ['kind', 'scope'] as const;

/** Keep a parseable stamp verbatim; repair anything else to the sentinel. */
function normalizeCandidateStamp(value: unknown): string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value))
    ? value
    : UNPARSEABLE_STAMP_SENTINEL;
}

/**
 * Minimum runtime validation for a persisted candidate, mirroring
 * {@link validateMemoryShape}'s rigor: the identity and classification fields
 * every code path dereferences unconditionally. A row failing this is genuinely
 * corrupt and is skipped by the caller's existing `catch`.
 */
function validateCandidateShape(value: unknown, rawData: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CorruptMemoryError('Candidate record is not an object', rawData);
  }
  const c = value as Record<string, unknown>;
  for (const field of REQUIRED_CANDIDATE_STRING_FIELDS) {
    const v = c[field];
    if (typeof v !== 'string' || v.length === 0) {
      throw new CorruptMemoryError(
        `Candidate record field "${field}" is ${v === undefined ? 'missing' : `type ${typeof v}`}, expected a non-empty string`,
        rawData,
      );
    }
  }
  // Present-but-wrong-typed classification is corruption worth catching (it
  // would silently break the reconcile sweep's scope/kind SQL match); absent is
  // legitimate for legacy rows, so it is not required.
  for (const field of OPTIONAL_CANDIDATE_STRING_FIELDS) {
    const v = c[field];
    if (v !== undefined && typeof v !== 'string') {
      throw new CorruptMemoryError(
        `Candidate record field "${field}" is type ${typeof v}, expected a string`,
        rawData,
      );
    }
  }
}

export function sqliteRowToCandidate(row: { data: string }): MemoryCandidate {
  const parsed: unknown = JSON.parse(row.data);
  validateCandidateShape(parsed, row.data);
  const c = parsed as Record<string, unknown>;
  const createdAt = normalizeCandidateStamp(c['createdAt']);
  const updatedAt = normalizeCandidateStamp(c['updatedAt']);
  // Only allocate a repaired copy when a stamp actually needed repair, so the
  // common well-formed row decodes with no extra object.
  if (createdAt === c['createdAt'] && updatedAt === c['updatedAt']) {
    return parsed as MemoryCandidate;
  }
  return { ...(parsed as MemoryCandidate), createdAt, updatedAt };
}

export function sqliteRowToAuditRecord(row: SqliteAuditRow): SageAuditRecord {
  let parsed: Record<string, unknown> = {};
  if (row.data) {
    try {
      const value = JSON.parse(row.data);
      if (value && typeof value === 'object') parsed = value as Record<string, unknown>;
    } catch {
      // Corrupt data column — surface the event without its detail.
    }
  }
  const record: SageAuditRecord = { schemaVersion: 1, event: row.event, at: row.at };
  if (typeof parsed['memoryId'] === 'string') record.memoryId = parsed['memoryId'];
  if (typeof parsed['source'] === 'string') record.source = parsed['source'];
  if (typeof parsed['reason'] === 'string') record.reason = parsed['reason'];
  if (row.trace_id) record.traceId = row.trace_id;
  if (parsed['details'] !== undefined) record.details = parsed['details'];
  return record;
}

export async function readLegacyJsonlRecords<T>(
  filePath: string,
  nowIso: () => string,
): Promise<T[]> {
  let raw: string;
  try {
    raw = await fs.promises.readFile(filePath, 'utf8');
  } catch {
    // Legacy file doesn't exist or can't be read — treat as empty.
    return [];
  }
  const result: T[] = [];
  const lines = raw.split('\n');
  let corruptCount = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const trimmed = lines[lineIndex]!.trim();
    if (!trimmed) continue;
    try {
      result.push(JSON.parse(trimmed) as T);
    } catch {
      corruptCount++;
    }
  }
  if (corruptCount > 0) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'sage.legacy_jsonl_corrupt_lines_skipped',
        filePath,
        corruptCount,
        recovered: result.length,
        timestamp: nowIso(),
      }),
    );
  }
  return result;
}
