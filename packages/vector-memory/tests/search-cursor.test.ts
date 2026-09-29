/**
 * Focused tests for `VectorMemoryStore.search` ranked-cursor pagination
 * (B2), deterministic tie-breaking, whole-corpus scope/kind filters
 * (B3), and the typed embedding failure surfaced by
 * `failOnEmbeddingError` (B4).
 *
 * Tie engineering: FakeEmbeddingProvider derives a vector from the first
 * `dimensions` (64) chars, so texts that are identical for 64+ chars
 * embed identically → identical cosine scores → rank ties. That is what
 * pins the id-ASC tiebreak contract.
 */
import * as os from 'node:os';
import * as path from 'node:path';
import type { EmbeddingProvider } from '@wrongstack/sage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  VectorMemoryError,
  VectorMemoryProviderUnavailableError,
  VectorMemoryStore,
} from '../src/index.js';
import { FakeEmbeddingProvider } from './fake-provider.js';

const testRunId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function makeStore(provider?: EmbeddingProvider): VectorMemoryStore {
  const projectRoot = path.join(
    os.tmpdir(),
    `wrongstack-vm-cursor-${testRunId}-${Math.random().toString(36).slice(2, 8)}`,
  );
  return new VectorMemoryStore({
    provider: provider ?? new FakeEmbeddingProvider({ dimensions: 64 }),
    projectRoot,
  });
}

/** Provider whose every embed call rejects — simulates a provider outage. */
class ThrowingProvider implements EmbeddingProvider {
  readonly id = 'throwing-v1';
  readonly dimensions = 8;
  async embed(): Promise<Float32Array[]> {
    throw new Error('simulated provider outage');
  }
}

/** Provider that resolves without a vector — the silent-outage shape. */
class EmptyResultProvider implements EmbeddingProvider {
  readonly id = 'empty-v1';
  readonly dimensions = 8;
  async embed(): Promise<Float32Array[]> {
    return [];
  }
}

describe('VectorMemoryStore.search — deterministic ranking', () => {
  let store: VectorMemoryStore;

  beforeEach(() => {
    store = makeStore();
  });

  afterEach(() => {
    store.close();
  });

  it('breaks score ties by entry id ASC, making the order a contract', async () => {
    // Same text in all three scopes → three rows, identical vectors, identical scores.
    const text = 'tied score across scopes'.padEnd(70, ' ');
    const entries = [
      await store.remember({ text, scope: 'session' }),
      await store.remember({ text, scope: 'user' }),
      await store.remember({ text, scope: 'project' }),
    ];
    const hits = await store.search(text, { limit: 10 });
    expect(hits).toHaveLength(3);
    const scores = hits.map((h) => h.score);
    expect(new Set(scores).size).toBe(1);
    const ids = hits.map((h) => h.entry.id);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids)).toEqual(new Set(entries.map((e) => e.id)));
    // Deterministic across repeated calls.
    const again = await store.search(text, { limit: 10 });
    expect(again.map((h) => h.entry.id)).toEqual(ids);
  });
});

describe('VectorMemoryStore.search — ranked cursor', () => {
  let store: VectorMemoryStore;
  const query = 'alpha topic';
  let allIds: string[] = [];

  beforeEach(async () => {
    store = makeStore();
    // A mix of distinct scores plus a deliberate tie pair: same text
    // (identical embedding) in two scopes.
    const tie = 'tied duplicate content'.padEnd(70, ' ');
    await store.remember({ text: `${query} one`, scope: 'project' });
    await store.remember({ text: tie, scope: 'project' });
    await store.remember({ text: tie, scope: 'user' });
    await store.remember({ text: `${query} two about something else`, scope: 'project' });
    const all = await store.search(query, { limit: 10 });
    allIds = all.map((h) => h.entry.id);
    expect(allIds.length).toBeGreaterThanOrEqual(4);
  });

  afterEach(() => {
    store.close();
  });

  it('paginates through the full ranked set in the same order as a single search', async () => {
    const walked: string[] = [];
    let cursor: { score: number; id: string } | undefined;
    // Walk with a small page size so several pages are needed.
    for (let page = 0; page < 20; page++) {
      const hits = await store.search(query, { limit: 2, ...(cursor ? { cursor } : {}) });
      walked.push(...hits.map((h) => h.entry.id));
      if (hits.length < 2) break;
      const tail = hits[hits.length - 1]!;
      cursor = { score: tail.score, id: tail.entry.id };
    }
    expect(walked).toEqual(allIds);
    expect(new Set(walked).size).toBe(walked.length); // no duplicates across pages
  });

  it('resumes strictly after the cursor rank, skipping earlier pages', async () => {
    const page1 = await store.search(query, { limit: 1 });
    const tail = page1[0]!;
    const page2 = await store.search(query, {
      limit: 10,
      cursor: { score: tail.score, id: tail.entry.id },
    });
    expect(page2.map((h) => h.entry.id)).toEqual(allIds.slice(1));
  });

  it('advances past a tie when the cursor sits inside the tie group', async () => {
    // Find the tie pair in the single-shot ranking.
    const all = await store.search(query, { limit: 10 });
    const tieScore =
      all.length > 1 ? all.find((h, i) => all[i - 1]?.score === h.score)?.score : undefined;
    expect(tieScore).toBeDefined();
    const tieHits = all.filter((h) => h.score === tieScore);
    expect(tieHits.length).toBe(2);
    // Cursor at the FIRST member of the tie: the second member must still come back.
    const first = tieHits[0]!;
    const rest = await store.search(query, {
      limit: 10,
      cursor: { score: first.score, id: first.entry.id },
    });
    expect(rest.map((h) => h.entry.id)).toContain(tieHits[1]!.entry.id);
    expect(rest.map((h) => h.entry.id)).not.toContain(first.entry.id);
  });

  it('returns [] when the cursor is past every candidate', async () => {
    const all = await store.search(query, { limit: 10 });
    const worst = all[all.length - 1]!;
    const after = await store.search(query, {
      limit: 10,
      cursor: { score: worst.score, id: worst.entry.id },
    });
    expect(after).toEqual([]);
  });

  it('throws VectorMemoryError on a malformed cursor instead of ignoring it', async () => {
    await expect(
      store.search(query, { cursor: { score: Number.NaN, id: 'x' } }),
    ).rejects.toBeInstanceOf(VectorMemoryError);
    await expect(store.search(query, { cursor: { score: 0.5, id: '' } })).rejects.toBeInstanceOf(
      VectorMemoryError,
    );
    await expect(store.search(query, { cursor: { score: 1.5, id: 'x' } })).rejects.toBeInstanceOf(
      VectorMemoryError,
    );
    // Non-0/1-clamped scores are rejected before any embedding work.
    await expect(store.search(query, { cursor: { score: -0.1, id: 'x' } })).rejects.toBeInstanceOf(
      VectorMemoryError,
    );
  });
});

describe('VectorMemoryStore.search — whole-corpus filters with cursor', () => {
  let store: VectorMemoryStore;

  beforeEach(() => {
    store = makeStore();
  });

  afterEach(() => {
    store.close();
  });

  it('keeps the scope filter server-side across cursor pages', async () => {
    const text = 'scoped content for filtering'.padEnd(70, ' ');
    const project = await store.remember({ text, scope: 'project' });
    await store.remember({ text, scope: 'session' });
    await store.remember({ text, scope: 'user' });

    const page1 = await store.search(text, { limit: 1, scope: 'project' });
    expect(page1.map((h) => h.entry.id)).toEqual([project.id]);

    const tail = page1[0]!;
    const page2 = await store.search(text, {
      scope: 'project',
      cursor: { score: tail.score, id: tail.entry.id },
    });
    // The whole project-scoped ranked set was one entry — the second page
    // must be empty even though user/session rows match the text.
    expect(page2).toEqual([]);
  });

  it('keeps the kind filter server-side across cursor pages', async () => {
    const base = 'kinded content for filtering'.padEnd(70, ' ');
    const fact = await store.remember({ text: base, kind: 'fact', scope: 'project' });
    await store.remember({ text: base, kind: 'note', scope: 'project' });

    const page1 = await store.search(base, { limit: 1, kind: 'fact' });
    expect(page1.map((h) => h.entry.id)).toEqual([fact.id]);
    const tail = page1[0]!;
    const page2 = await store.search(base, {
      kind: 'fact',
      cursor: { score: tail.score, id: tail.entry.id },
    });
    expect(page2).toEqual([]);
  });
});

describe('VectorMemoryStore.search — typed embedding failure (failOnEmbeddingError)', () => {
  it('throws VectorMemoryProviderUnavailableError when the provider rejects and strict is set', async () => {
    const store = makeStore(new ThrowingProvider());
    try {
      await expect(store.search('anything', { failOnEmbeddingError: true })).rejects.toBeInstanceOf(
        VectorMemoryProviderUnavailableError,
      );
    } finally {
      store.close();
    }
  });

  it('returns [] on a provider rejection by default (fail-open)', async () => {
    const store = makeStore(new ThrowingProvider());
    try {
      await expect(store.search('anything')).resolves.toEqual([]);
    } finally {
      store.close();
    }
  });

  it('throws the typed error when the provider resolves without a vector and strict is set', async () => {
    const store = makeStore(new EmptyResultProvider());
    try {
      await expect(store.search('anything', { failOnEmbeddingError: true })).rejects.toBeInstanceOf(
        VectorMemoryProviderUnavailableError,
      );
    } finally {
      store.close();
    }
  });
});
