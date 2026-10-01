/**
 * Tests for `readSqliteSageRow` — the helper that centralizes the
 * `SELECT data FROM memories WHERE id = ?` + `sqliteRowToMemory` cast pair.
 *
 * Covers three branches:
 * 1. Missing row → returns `null` (does not throw, does not log).
 * 2. Corrupt JSON data → returns `null` (does not throw).
 * 3. Valid row → returns the parsed `Sage` with the expected fields.
 *
 * The helper composes with the existing `SqliteStatementCache` shape, so
 * the test uses an in-memory shim that records the SQL and returns a
 * fake row. The shim models the `DatabaseSync#prepare()` return type so
 * the signature match is part of the contract.
 *
 * Also tests `legacyScopeFilterClause` — the helper that produces the
 * `(scope = ? OR legacy_scope = ?)` SQL fragment for the four legacy
 * callsites. Round-trips the modern→legacy alias mapping so a regression
 * in `legacyToSageScope` breaks the test loudly.
 */

import { describe, expect, it } from 'vitest';

import {
  CorruptMemoryError,
  readSqliteSageRow,
  sqliteRowToCandidate,
  sqliteRowToMemory,
} from '../src/sqlite-store-codec.js';
import { legacyScopeFilterClause } from '../src/store-helpers.js';
import type { Sage } from '../src/types.js';

interface FakeRow {
  data: string;
}

// The helper's signature is `(sql: string) => ReturnType<DatabaseSync['prepare']>`,
// which is `StatementSync` — a 12-property runtime. The test only exercises
// `.get(id)`, so a partial stub is sufficient; cast to `any` keeps the test
// type-clean without dragging in `node:sqlite` types we don't exercise.
function makeStmt(plan: (sql: string, params: unknown[]) => FakeRow | undefined) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stmt: any = (sql: string) => {
    const get = (id: unknown) => plan(sql, [id]);
    return { get };
  };
  return stmt;
}

interface RecordedSql {
  sql: string;
  capture(): string[];
}

function makeRecordingStmt(plan: (sql: string, params: unknown[]) => FakeRow | undefined) {
  const seen: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stmt: any = (sql: string) => {
    seen.push(sql);
    const get = (id: unknown) => plan(sql, [id]);
    return { get };
  };
  const record: RecordedSql = {
    sql: '',
    capture: () => seen.slice(),
  };
  return { stmt, record };
}

const baseSage: Sage = {
  id: 'sage-1',
  revision: 1,
  scope: 'project',
  kind: 'fact',
  status: 'active',
  text: 'SAGE lives in SQLite.',
  importance: 0.7,
  confidence: 0.9,
  freshness: 1,
  tags: ['sage'],
  anchors: [],
  sources: [],
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
};

describe('readSqliteSageRow', () => {
  it('returns null when the row is missing', () => {
    const { stmt, record } = makeRecordingStmt(() => undefined);
    const result = readSqliteSageRow(stmt, 'missing');
    expect(result).toBeNull();
    expect(record.capture()).toEqual(['SELECT data FROM memories WHERE id = ?']);
  });

  it('throws CorruptMemoryError when the data column is unparseable JSON', () => {
    const stmt = makeStmt(() => ({ data: 'not-json{' }) as FakeRow);
    expect(() => readSqliteSageRow(stmt, 'broken')).toThrow(SyntaxError);
  });

  it('throws CorruptMemoryError when a required stamp is missing entirely', () => {
    const stmt = makeStmt(
      () =>
        ({
          data: JSON.stringify({ ...baseSage, updatedAt: undefined }),
        }) as FakeRow,
    );
    expect(() => readSqliteSageRow(stmt, baseSage.id)).toThrow(CorruptMemoryError);
  });

  it('returns the parsed Sage when the row is valid', () => {
    const stmt = makeStmt(() => ({ data: JSON.stringify(baseSage) }) as FakeRow);
    const result = readSqliteSageRow(stmt, baseSage.id);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(baseSage.id);
    expect(result?.text).toBe(baseSage.text);
    expect(result?.tags).toEqual(['sage']);
  });
});

describe('sqliteRowToMemory stamp repair', () => {
  const EPOCH = '1970-01-01T00:00:00.000Z';
  const decode = (over: Record<string, unknown> = {}) =>
    sqliteRowToMemory({ data: JSON.stringify({ ...baseSage, ...over }) });

  // A present-but-unparseable stamp used to survive the decode (it was only
  // type-checked as a string), and the hygiene session-GC arithmetic
  // `nowMs - Date.parse(updatedAt) >= sessionRetentionMs` then evaluated
  // `NaN >= n` -> false, so the memory was NEVER aged out. Repairing to the
  // epoch makes it maximally old so retention GC collects it. It must NOT throw:
  // `sqliteRowsToMemories` catches-and-skips, so a throw would hide the row.
  it('repairs an unparseable updatedAt to a parseable sentinel', () => {
    const result = decode({ updatedAt: 'not-a-real-date' });
    expect(result.updatedAt).toBe(EPOCH);
    expect(Number.isFinite(Date.parse(result.updatedAt))).toBe(true);
  });

  it('repairs a legacy epoch-number updatedAt', () => {
    const result = decode({ updatedAt: 1_700_000_000_000 });
    expect(result.updatedAt).toBe(EPOCH);
  });

  it('repairs an empty updatedAt', () => {
    const result = decode({ updatedAt: '' });
    expect(result.updatedAt).toBe(EPOCH);
  });

  it('repairs an unparseable createdAt without touching a valid updatedAt', () => {
    const result = decode({ createdAt: 'nope' });
    expect(result.createdAt).toBe(EPOCH);
    expect(result.updatedAt).toBe(baseSage.updatedAt);
  });

  // Control: a well-formed row decodes with no repair (identity, not a copy).
  it('leaves well-formed stamps verbatim', () => {
    const result = decode();
    expect(result.createdAt).toBe(baseSage.createdAt);
    expect(result.updatedAt).toBe(baseSage.updatedAt);
  });

  it('does not mutate the input object when repairing', () => {
    const input = { ...baseSage, updatedAt: 'not-a-real-date' };
    const result = sqliteRowToMemory({ data: JSON.stringify(input) });
    expect(input.updatedAt).toBe('not-a-real-date');
    expect(result.updatedAt).toBe(EPOCH);
  });
});

describe('sqliteRowToMemory optional-stamp drop', () => {
  // Optional stamps are DROPPED, not force-expired. An unparseable `expiresAt`
  // satisfied neither hygiene GC disjunct (`NaN <= now` is false, and the
  // `expiresAt === undefined` retention fallback is skipped), so the memory was
  // never aged out. Force-expiring to the epoch would be worse: hygiene's
  // review-candidate pass at L714 reads `expiresAt` WITHOUT a session-scope
  // gate, so the epoch would file an `expires_at_passed` review candidate for
  // every corrupt-stamped memory of any scope. Dropping falls through to the
  // documented retention path instead.
  it('drops an unparseable expiresAt instead of expiring it', () => {
    const result = sqliteRowToMemory({
      data: JSON.stringify({ ...baseSage, expiresAt: 'not-a-real-date' }),
    });
    expect(result.expiresAt).toBeUndefined();
    expect(Object.hasOwn(result, 'expiresAt')).toBe(false);
  });

  it('drops a legacy epoch-number expiresAt', () => {
    const result = sqliteRowToMemory({
      data: JSON.stringify({ ...baseSage, expiresAt: 1_700_000_000_000 }),
    });
    expect(result.expiresAt).toBeUndefined();
  });

  it('drops an unparseable lastAccessedAt so consumers fall back to updatedAt', () => {
    const result = sqliteRowToMemory({
      data: JSON.stringify({ ...baseSage, lastAccessedAt: 'nope' }),
    });
    expect(result.lastAccessedAt).toBeUndefined();
  });

  it('drops an unparseable lastVerifiedAt so consumers see it as unverified', () => {
    const result = sqliteRowToMemory({
      data: JSON.stringify({ ...baseSage, lastVerifiedAt: 'nope' }),
    });
    expect(result.lastVerifiedAt).toBeUndefined();
  });

  // Control: parseable optional stamps survive verbatim.
  it('preserves valid optional stamps', () => {
    const result = sqliteRowToMemory({
      data: JSON.stringify({
        ...baseSage,
        expiresAt: '2026-10-01T00:00:00.000Z',
        lastVerifiedAt: '2026-09-30T00:00:00.000Z',
        lastAccessedAt: '2026-09-29T00:00:00.000Z',
      }),
    });
    expect(result.expiresAt).toBe('2026-10-01T00:00:00.000Z');
    expect(result.lastVerifiedAt).toBe('2026-09-30T00:00:00.000Z');
    expect(result.lastAccessedAt).toBe('2026-09-29T00:00:00.000Z');
  });

  // A memory with NO optional stamps must not gain empty ones.
  it('does not add optional stamp keys to a memory that has none', () => {
    const result = sqliteRowToMemory({ data: JSON.stringify(baseSage) });
    expect(Object.hasOwn(result, 'expiresAt')).toBe(false);
    expect(Object.hasOwn(result, 'lastAccessedAt')).toBe(false);
    expect(Object.hasOwn(result, 'lastVerifiedAt')).toBe(false);
  });
});

describe('legacyScopeFilterClause', () => {
  it('emits the dual-column predicate and the legacy→sage-mapped params', () => {
    const result = legacyScopeFilterClause('user-memory');
    expect(result.clause).toBe('(scope = ? OR legacy_scope = ?)');
    // legacyToSageScope('user-memory') === 'user'
    expect(result.params).toEqual(['user', 'user-memory']);
  });

  it('maps project-memory to the project sage scope', () => {
    const result = legacyScopeFilterClause('project-memory');
    expect(result.params).toEqual(['project', 'project-memory']);
  });

  it('does not prefix the clause with AND — callers compose the surrounding WHERE', () => {
    const result = legacyScopeFilterClause('user-memory');
    expect(result.clause.startsWith(' AND')).toBe(false);
  });
});

/**
 * `sqliteRowToCandidate` is the decode boundary every candidate scan goes
 * through. It was an unvalidated `JSON.parse` cast, which is what let an
 * unparseable timestamp reach consumers whose grace-window predicates then
 * treated "can never be satisfied" as "defer to the next sweep" — a permanent
 * stall for the H2 reconciliation sweep.
 */
describe('sqliteRowToCandidate', () => {
  const EPOCH = '1970-01-01T00:00:00.000Z';

  const baseCandidate = {
    schemaVersion: 1,
    id: 'candidate-1',
    status: 'pending',
    text: 'a candidate',
    kind: 'fact',
    scope: 'project',
    confidence: 0.6,
    importance: 0.6,
    tags: [],
    anchors: [],
    sources: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };

  const decode = (over: Record<string, unknown> = {}) =>
    sqliteRowToCandidate({ data: JSON.stringify({ ...baseCandidate, ...over }) });

  // Shape is strict, timestamps are repaired — rejecting a bad timestamp would
  // make every caller's `catch { continue }` hide the row from the review queue.
  it('repairs an unparseable updatedAt to a parseable sentinel', () => {
    const result = decode({ updatedAt: 'not-a-real-date' });
    expect(result.updatedAt).toBe(EPOCH);
    expect(Number.isFinite(Date.parse(result.updatedAt))).toBe(true);
  });

  it('repairs a legacy epoch-number updatedAt', () => {
    const result = decode({ updatedAt: 1_700_000_000_000 });
    expect(result.updatedAt).toBe(EPOCH);
  });

  it('repairs a missing updatedAt', () => {
    const result = decode({ updatedAt: undefined });
    expect(result.updatedAt).toBe(EPOCH);
  });

  it('repairs an unparseable createdAt without touching a valid updatedAt', () => {
    const result = decode({ createdAt: '' });
    expect(result.createdAt).toBe(EPOCH);
    expect(result.updatedAt).toBe(baseCandidate.updatedAt);
  });

  // Control: a well-formed row is passed through untouched, with no repair.
  it('leaves well-formed stamps verbatim', () => {
    const result = decode();
    expect(result.createdAt).toBe(baseCandidate.createdAt);
    expect(result.updatedAt).toBe(baseCandidate.updatedAt);
  });

  it('throws CorruptMemoryError when an identity field is missing', () => {
    expect(() => decode({ id: undefined })).toThrow(CorruptMemoryError);
    expect(() => decode({ status: '' })).toThrow(CorruptMemoryError);
    expect(() => decode({ text: undefined })).toThrow(CorruptMemoryError);
  });

  it('throws CorruptMemoryError when the payload is not an object', () => {
    expect(() => sqliteRowToCandidate({ data: '[]' })).toThrow(CorruptMemoryError);
    expect(() => sqliteRowToCandidate({ data: '"a string"' })).toThrow(CorruptMemoryError);
  });

  it('throws CorruptMemoryError when kind/scope are present but not strings', () => {
    expect(() => decode({ kind: 7 })).toThrow(CorruptMemoryError);
    expect(() => decode({ scope: {} })).toThrow(CorruptMemoryError);
  });

  // The JSONL→SQLite migration replays legacy rows verbatim, and older
  // candidate records predate kind/scope. Requiring them would drop real
  // migrated rows from the review queue.
  it('accepts a legacy row that has no kind or scope', () => {
    const result = sqliteRowToCandidate({
      data: JSON.stringify({ ...baseCandidate, kind: undefined, scope: undefined }),
    });
    expect(result.id).toBe('candidate-1');
    expect(result.updatedAt).toBe(baseCandidate.updatedAt);
  });
});
