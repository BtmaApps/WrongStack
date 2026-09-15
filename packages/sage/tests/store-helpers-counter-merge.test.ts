import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SqliteSageStore } from '../src/sqlite-store.js';
import { mergeLiveCounterFields } from '../src/store-helpers.js';
import type { Sage } from '../src/types.js';

/**
 * H6 regression coverage (docs/sage-phase4-design.md): recordSqliteInjection /
 * recordSqliteUse run `json_set` advisory counters on the independent counter
 * chain, while content writes (remember merge, update, verification) replace
 * the whole `data` column from an in-memory object. mergeLiveCounterFields
 * carries the live row's counters into that write so a bump landing between a
 * content path's read and its write-back is never clobbered.
 *
 * The unit tests pin the merge semantics. The store-level test pins the
 * end-to-end invariant — an advisory bump landing inside an in-flight
 * verification survives its write-back — through the real counter chain and
 * the real upsert funnel.
 */

const anchorGate = vi.hoisted(() => {
  const state: { blocked: boolean; release: (() => void) | undefined } = {
    blocked: false,
    release: undefined,
  };
  return state;
});

// Park anchor verification so the test decides when the (real) verification
// resumes, and interleave a counter-chain bump while it is in flight.
vi.mock('../src/anchors/verify.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/anchors/verify.js')>();
  return {
    ...actual,
    verifyMemoryAnchors: async (
      ...args: Parameters<typeof actual.verifyMemoryAnchors>
    ): Promise<ReturnType<typeof actual.verifyMemoryAnchors>> => {
      if (anchorGate.blocked) {
        await new Promise<void>((resolve) => {
          anchorGate.release = resolve;
        });
      }
      return actual.verifyMemoryAnchors(...args);
    },
  };
});

function makeMemory(overrides: Partial<Sage> = {}): Sage {
  return {
    id: 'm1',
    text: 'H6 unit memory',
    kind: 'fact',
    scope: 'project',
    confidence: 0.8,
    importance: 0.5,
    tags: [],
    anchors: [],
    sources: [],
    status: 'active',
    createdAt: '2026-09-15T00:00:00.000Z',
    updatedAt: '2026-09-15T00:00:00.000Z',
    ...overrides,
  } as Sage;
}

describe('mergeLiveCounterFields', () => {
  it('returns the incoming memory untouched when there is no previous row', () => {
    const next = makeMemory();
    expect(mergeLiveCounterFields(undefined, next)).toEqual(next);
    expect(mergeLiveCounterFields('', next)).toEqual(next);
  });

  it('leaves the incoming memory untouched when the previous row is corrupt or not an object', () => {
    const next = makeMemory({ injectionCount: 2 });
    expect(mergeLiveCounterFields('not-json{', next)).toEqual(next);
    expect(mergeLiveCounterFields('[]', next)).toEqual(next);
    expect(mergeLiveCounterFields('null', next)).toEqual(next);
  });

  it('keeps the higher advisory count from either side', () => {
    const higherPrevious = mergeLiveCounterFields(
      JSON.stringify({ injectionCount: 4, useCount: 7 }),
      makeMemory({ injectionCount: 1, useCount: 2 }),
    );
    expect(higherPrevious.injectionCount).toBe(4);
    expect(higherPrevious.useCount).toBe(7);

    const higherNext = mergeLiveCounterFields(
      JSON.stringify({ injectionCount: 1, useCount: 3 }),
      makeMemory({ injectionCount: 5, useCount: 2 }),
    );
    expect(higherNext.injectionCount).toBe(5);
    expect(higherNext.useCount).toBe(3);
  });

  it('carries previous counters when the incoming memory has none', () => {
    const merged = mergeLiveCounterFields(
      JSON.stringify({ injectionCount: 2, useCount: 1 }),
      makeMemory(),
    );
    expect(merged.injectionCount).toBe(2);
    expect(merged.useCount).toBe(1);
  });

  it('leaves counter keys absent when neither side has them', () => {
    const merged = mergeLiveCounterFields(JSON.stringify({ text: 'x' }), makeMemory());
    expect(merged.injectionCount).toBeUndefined();
    expect(merged.useCount).toBeUndefined();
  });

  it('keeps the newer advisory timestamps', () => {
    const merged = mergeLiveCounterFields(
      JSON.stringify({
        lastAccessedAt: '2026-09-15T10:00:00.000Z',
        lastUsedAt: '2026-09-15T09:00:00.000Z',
      }),
      makeMemory({
        lastAccessedAt: '2026-09-15T08:00:00.000Z',
        lastUsedAt: '2026-09-15T12:00:00.000Z',
      }),
    );
    expect(merged.lastAccessedAt).toBe('2026-09-15T10:00:00.000Z');
    expect(merged.lastUsedAt).toBe('2026-09-15T12:00:00.000Z');
  });

  it('ignores non-finite counts and invalid stamps from a corrupt previous row', () => {
    const merged = mergeLiveCounterFields(
      JSON.stringify({ injectionCount: 'many', lastUsedAt: 'yesterday' }),
      makeMemory({ injectionCount: 1, lastUsedAt: '2026-09-15T09:00:00.000Z' }),
    );
    expect(merged.injectionCount).toBe(1);
    expect(merged.lastUsedAt).toBe('2026-09-15T09:00:00.000Z');
  });

  it('always takes content fields from the incoming memory', () => {
    const merged = mergeLiveCounterFields(
      JSON.stringify({ text: 'old text', importance: 0.99 }),
      makeMemory({ text: 'new text' }),
    );
    expect(merged.text).toBe('new text');
    expect(merged.importance).toBe(0.5);
  });
});

describe('H6 store-level interleaving', () => {
  let directory: string;
  let stores: SqliteSageStore[];

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-sage-counter-merge-'));
    stores = [];
  });

  afterEach(async () => {
    anchorGate.blocked = false;
    anchorGate.release?.();
    for (const store of stores) store.close();
    await fs.rm(directory, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function createStore(): SqliteSageStore {
    const store = new SqliteSageStore({ projectRoot: directory });
    stores.push(store);
    return store;
  }

  it('an advisory bump landing inside an in-flight verification survives the write-back', async () => {
    const store = createStore();
    await fs.writeFile(path.join(directory, 'h6.ts'), 'export const h6 = 1;\n');
    const memory = await store.rememberSage({
      text: 'H6 counter reconciliation regression',
      kind: 'file_note',
      scope: 'project',
      anchors: [{ type: 'file', path: 'h6.ts' }],
    });
    expect(memory.anchors).toHaveLength(1);

    await store.recordInjection([memory.id], 'test', 'session-1');

    // Park verification after its row read, so a second counter-chain bump
    // commits while the content write is still in flight.
    anchorGate.blocked = true;
    const verifyPromise = store.verify();
    await store.recordInjection([memory.id], 'test', 'session-1');
    anchorGate.release?.();
    const results = await verifyPromise;
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('verified');

    const after = await store.getSage(memory.id);
    // Both bumps (pre-verify and in-flight) survive the write-back.
    expect(after?.injectionCount).toBe(2);
    expect(after?.lastAccessedAt).toBeDefined();
    // The verification itself still applied.
    expect(after?.status).toBe('active');
    expect(after?.lastVerifiedAt).toBeDefined();
  });
});
