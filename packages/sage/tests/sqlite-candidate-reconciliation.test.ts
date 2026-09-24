import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteSageStore } from '../src/sqlite-store.js';
import type { MemoryCandidate } from '../src/types.js';

/**
 * H2 regression (docs/sage-phase4-design.md): a hard crash between
 * `rememberSage` and the memoryId annotation leaves a candidate `accepted`
 * without `memoryId`, and the claim CAS makes re-accept a no-op. The
 * initialize-time sweep (`reconcileAcceptedCandidates`) closes that window:
 * it re-links the candidate to the ACTIVE memory with the same canonical
 * text — matching on the shared `normalizeTextKey` key every writer uses
 * (remember dedupe, upsert column, initialize backfill) — or
 * releases it back to `pending`. Fully annotated candidates and candidates
 * inside the grace window are left alone.
 */

type StoreInternals = {
  stmt: (sql: string) => ReturnType<DatabaseSync['prepare']>;
};
const internals = (store: SqliteSageStore): StoreInternals => store as unknown as StoreInternals;

let directory: string;
let stores: SqliteSageStore[];

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-sage-h2-reconcile-'));
  stores = [];
});

afterEach(async () => {
  for (const store of stores) store.close();
  await fs.rm(directory, { recursive: true, force: true });
});

function createStore(): SqliteSageStore {
  const store = new SqliteSageStore({ projectRoot: directory });
  stores.push(store);
  return store;
}

async function candidateRow(
  store: SqliteSageStore,
  candidateId: string,
): Promise<{ status: string; memoryId?: string; updatedAt: string }> {
  // Lazy initialize: the first store call runs initializeOnce → the H2 sweep.
  await store.getSage('__initialize__');
  const row = internals(store)
    .stmt('SELECT data, status, updated_at FROM candidates WHERE id = ?')
    .get(candidateId) as { data: string; status: string; updated_at: string } | undefined;
  expect(row, `candidate ${candidateId} must exist`).toBeTruthy();
  const parsed = JSON.parse(row!.data) as { memoryId?: string };
  return {
    status: row!.status,
    ...(parsed.memoryId !== undefined ? { memoryId: parsed.memoryId } : {}),
    updatedAt: row!.updated_at,
  };
}

/** Simulate the hard-crash window: claimed to `accepted`, never annotated. */
function craftAccepted(
  store: SqliteSageStore,
  candidate: MemoryCandidate,
  memoryId: string | undefined,
  updatedAt: string,
): void {
  internals(store)
    .stmt("UPDATE candidates SET data = ?, status = 'accepted', updated_at = ? WHERE id = ?")
    .run(
      JSON.stringify({
        ...candidate,
        status: 'accepted',
        updatedAt,
        ...(memoryId ? { memoryId } : {}),
      }),
      updatedAt,
      candidate.id,
    );
}

const STALE = '2026-09-15T00:00:00.000Z';

describe('H2 accepted-candidate reconciliation sweep', () => {
  it('re-links an accepted candidate to the active memory with the same canonical text', async () => {
    const store = createStore();
    const memory = await store.rememberSage({
      text: 'H2 relink target sentence.',
      kind: 'fact',
      scope: 'project',
    });
    const candidate = await store.createCandidate({
      text: 'H2 relink target sentence.',
      kind: 'fact',
      scope: 'project',
    });
    craftAccepted(store, candidate, undefined, STALE);
    store.close();

    // Re-opening the store runs the initialize-time sweep.
    const reopened = createStore();
    const after = await candidateRow(reopened, candidate.id);
    expect(after.status).toBe('accepted');
    expect(after.memoryId).toBe(memory.id);
    expect(after.updatedAt).not.toBe(STALE);

    const audit = await reopened.readAudit(100);
    expect(audit.some((entry) => entry.event === 'memory.candidate_accept_reconciled')).toBe(true);
  });

  it('releases an accepted candidate back to pending when no active memory matches', async () => {
    const store = createStore();
    const candidate = await store.createCandidate({
      text: 'H2 release case sentence.',
      kind: 'fact',
      scope: 'project',
    });
    craftAccepted(store, candidate, undefined, STALE);
    store.close();

    const reopened = createStore();
    const after = await candidateRow(reopened, candidate.id);
    expect(after.status).toBe('pending');
    expect(after.memoryId).toBeUndefined();

    const audit = await reopened.readAudit(100);
    expect(
      audit.some(
        (entry) =>
          entry.event === 'memory.candidate_accept_reconciled' &&
          (entry.details as { outcome?: string } | undefined)?.outcome === 'released',
      ),
    ).toBe(true);
  });

  it('leaves fully annotated accepted candidates alone', async () => {
    const store = createStore();
    const memory = await store.rememberSage({
      text: 'H2 annotated case.',
      kind: 'fact',
      scope: 'project',
    });
    const candidate = await store.createCandidate({
      text: 'H2 annotated case.',
      kind: 'fact',
      scope: 'project',
    });
    // The normal post-accept row: accepted AND annotated.
    craftAccepted(store, candidate, memory.id, STALE);
    store.close();

    const reopened = createStore();
    const after = await candidateRow(reopened, candidate.id);
    expect(after.status).toBe('accepted');
    expect(after.memoryId).toBe(memory.id);
    // The sweep skipped it: the annotation timestamp is untouched.
    expect(after.updatedAt).toBe(STALE);
  });

  it('does not relink an accepted candidate across memory scopes', async () => {
    const store = createStore();
    const projectMemory = await store.rememberSage({
      text: 'H2 scope isolation sentence.',
      scope: 'project',
      kind: 'fact',
    });
    const candidate = await store.createCandidate({
      text: 'H2 scope isolation sentence.',
      scope: 'project',
      kind: 'fact',
    });
    craftAccepted(store, candidate, undefined, STALE);

    // Identical text is a different memory when it belongs to another scope.
    const otherScopeMemory = await store.rememberSage({
      text: 'H2 scope isolation sentence.',
      scope: 'session',
      ownerSessionId: 'other-session',
      kind: 'fact',
    });
    store.close();

    const reopened = createStore();
    const after = await candidateRow(reopened, candidate.id);
    expect(after.memoryId).toBe(projectMemory.id);
    expect(after.memoryId).not.toBe(otherScopeMemory.id);
  });

  it('skips candidates inside the grace window', async () => {
    const store = createStore();
    const candidate = await store.createCandidate({
      text: 'H2 grace window case.',
      scope: 'project',
      kind: 'fact',
    });
    // A live accept in a concurrent opener: accepted seconds ago, no
    // memoryId yet. The sweep must not preempt it mid-write.
    craftAccepted(store, candidate, undefined, new Date().toISOString());
    store.close();

    const reopened = createStore();
    const after = await candidateRow(reopened, candidate.id);
    expect(after.status).toBe('accepted');
    expect(after.memoryId).toBeUndefined();
  });
});
