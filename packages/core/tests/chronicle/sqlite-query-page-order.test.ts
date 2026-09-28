/**
 * Regression: the SQLite engine (the default store) filled its page with the
 * first `limit` matches in `(day, sequence)` — persistence — order and only
 * then sorted that page. Producers stamp `occurredAt` with an earlier time
 * than persistence (a process with its start time, a provider attempt with its
 * start), so "latest N events" returned the latest-persisted N instead, and a
 * cursor applied in SQL made `total` shrink on every later page. The parity
 * fixture could not see either: every event there occurs when it is persisted.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ChronicleJournal } from '../../src/chronicle/journal.js';
import { importLegacyChronicleJournal } from '../../src/chronicle/legacy-journal-import.js';
import { type ChronicleQuery, ChronicleQueryEngine } from '../../src/chronicle/query.js';
import { ChronicleSqliteJournal } from '../../src/chronicle/sqlite-journal.js';
import type { ChronicleEventInput } from '../../src/chronicle/types.js';

let dir: string | undefined;
let store: ChronicleSqliteJournal | undefined;

afterEach(async () => {
  store?.close();
  store = undefined;
  if (dir) await fs.rm(dir, { recursive: true, force: true });
  dir = undefined;
});

function input(label: string, occurredAt?: string): ChronicleEventInput {
  return {
    eventType: 'process.completed',
    scope: { installationId: 'inst', machineId: 'mach', sessionId: 's' },
    correlation: { traceId: 't', spanId: label },
    attributes: { label },
    ...(occurredAt ? { occurredAt } : {}),
  };
}

/** Append `[persistedAt, input]` pairs in order, then open both engines over them. */
async function engines(appends: Array<[string, ChronicleEventInput]>) {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chronicle-page-order-'));
  let clock = new Date(0);
  const journals = new Map<string, ChronicleJournal>();
  for (const [at, one] of appends) {
    clock = new Date(at);
    const day = at.slice(0, 10);
    const journal =
      journals.get(day) ??
      new ChronicleJournal({ filePath: path.join(dir, `${day}.events.jsonl`), now: () => clock });
    journals.set(day, journal);
    await journal.append(one);
    await journal.flush();
  }
  store = new ChronicleSqliteJournal({ directory: dir });
  await importLegacyChronicleJournal(store, dir);
  return { jsonl: await ChronicleQueryEngine.fromDirectory(dir), sqlite: store.queryEngine() };
}

type Engine = Pick<ChronicleQueryEngine, 'query'>;

async function walk(engine: Engine, query: ChronicleQuery) {
  const pages: Array<{ labels: unknown[]; total: number }> = [];
  let cursor: string | undefined;
  do {
    const result = await engine.query({ ...query, ...(cursor ? { cursor } : {}) });
    pages.push({ labels: result.events.map((e) => e.attributes?.label), total: result.total });
    cursor = result.nextCursor;
  } while (cursor && pages.length < 50);
  return pages;
}

const LATE_PERSISTED: Array<[string, ChronicleEventInput]> = [
  ['2026-03-02T12:00:00.000Z', input('A')],
  ['2026-03-02T12:05:00.000Z', input('B', '2026-03-02T08:00:00.000Z')],
  ['2026-03-02T12:06:00.000Z', input('C', '2026-03-02T07:00:00.000Z')],
  ['2026-03-02T12:07:00.000Z', input('D', '2026-03-02T12:00:00.000Z')],
  ['2026-03-03T00:01:00.000Z', input('E', '2026-03-02T23:59:00.000Z')],
  ['2026-03-03T09:30:00.000Z', input('G', '2026-03-01T00:00:00.000Z')],
];

describe('SQLite query page order', () => {
  it('returns the latest occurred event, not the latest persisted', async () => {
    const { sqlite } = await engines(LATE_PERSISTED.slice(0, 3));
    const result = await sqlite.query({ limit: 1 });
    expect(result.events.map((e) => e.attributes?.label)).toEqual(['A']);
  });

  it.each([
    ['desc', 1],
    ['desc', 2],
    ['asc', 1],
    ['asc', 4],
  ] as const)(
    'walks every page like the JSONL engine (order %s, limit %i)',
    async (order, limit) => {
      const { jsonl, sqlite } = await engines(LATE_PERSISTED);
      const expected = await walk(jsonl, { order, limit });
      expect(await walk(sqlite, { order, limit })).toEqual(expected);
      expect(new Set(expected.map((page) => page.total))).toEqual(new Set([LATE_PERSISTED.length]));
    },
  );

  it('restarts at the first page for a cursor it did not issue', async () => {
    const { sqlite } = await engines(LATE_PERSISTED);
    const first = await sqlite.query({ limit: 2 });
    const legacyKeyset = Buffer.from('2026-03-02:2', 'utf8').toString('base64url');
    expect((await sqlite.query({ limit: 2, cursor: legacyKeyset })).events).toEqual(first.events);
  });
});
