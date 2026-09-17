import * as path from 'node:path';
import { expect, test, vi } from 'vitest';
import { acquireLock } from '../src/process-registry-persistent.js';

// Regression (round 2026-09-17-r2): acquireLock's stale-break (EEXIST) path
// observed the lockfile content once and then unlinked WITHOUT re-verifying.
// Two stealers that both observe the same stale lock can interleave so the
// second unlink lands on the first stealer's freshly-created lock —
// destroying a live holder's lock and admitting two writers into the
// read-modify-write section. The fix re-reads right before unlinking and only
// steals while the file still holds exactly the observed stale content (the
// recheck discipline withFileLock in @wrongstack/persistence applies to its
// stat→unlink gap).
//
// These tests mock node:fs/promises with an in-memory store whose semantics
// match the real fs (wx→EEXIST when present, ENOENT when absent) so the
// interleaving is deterministic: a queued observation models a stealer that
// read the stale content BEFORE the current holder acquired, while its unlink
// acts on the CURRENT store.

const LOCK = path.join('proof', '.process-registry.lock');

const mockStore = new Map<string, string>();
// Observations served by readFile BEFORE the live store content; models a
// stale read that happened before another actor changed the lockfile.
let queuedObservations: Array<string | undefined> = [];

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(async () => undefined),
  writeFile: vi.fn(async (filePath: string, content: string) => {
    if (mockStore.has(filePath)) {
      const err = new Error('EEXIST: file exists') as NodeJS.ErrnoException;
      err.code = 'EEXIST';
      throw err;
    }
    mockStore.set(filePath, content);
  }),
  readFile: vi.fn(async (filePath: string) => {
    const queued = queuedObservations.shift();
    if (queued !== undefined) return queued;
    const content = mockStore.get(filePath);
    if (content === undefined) {
      const err = new Error('ENOENT: no such file') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }
    return content;
  }),
  unlink: vi.fn(async (filePath: string) => {
    mockStore.delete(filePath);
  }),
}));

test('stale steal still succeeds when the content is unchanged (recheck parity)', async () => {
  const stale = `${process.pid}:proof-host:${Date.now() - 31_000}`;
  mockStore.set(LOCK, stale);

  // Single stealer, nobody else touches the lock: the steal must go through,
  // otherwise a crashed holder's lock could never be recovered.
  const release = await acquireLock(LOCK, 5000);
  const holderContent = mockStore.get(LOCK);
  expect(holderContent).toBeDefined();
  expect(holderContent).not.toBe(stale);

  await release();
  expect(mockStore.has(LOCK)).toBe(false);
});

test('stale steal must not unlink a lock that changed after it was observed', async () => {
  const stale = `${process.pid}:proof-host:${Date.now() - 31_000}`;

  // Stealer 1 acquires fully: seeded stale lock → observe C1 → unlink → write
  // own token. It now holds the section.
  mockStore.set(LOCK, stale);
  const release1 = await acquireLock(LOCK, 5000);
  const holderToken = mockStore.get(LOCK);
  expect(holderToken).toBeDefined();
  expect(holderToken).not.toBe(stale); // harness check: holder 1 owns a fresh lock

  // Stealer 2 observed the STALE content before stealer 1 acquired (queued),
  // then acts on the CURRENT store. The only correct outcome: it must NOT
  // acquire while holder 1 is live, and holder 1's lockfile must survive.
  queuedObservations = [stale];
  let outcome: 'acquired' | 'rejected' = 'acquired';
  try {
    const release2 = await acquireLock(LOCK, 600);
    void release2;
  } catch {
    outcome = 'rejected';
  }

  expect(outcome, 'second stealer acquired while holder 1 is live (lock stolen)').toBe('rejected');
  expect(mockStore.get(LOCK), 'holder 1 lockfile was destroyed by the stale steal').toBe(
    holderToken,
  );

  // Control: holder 1's own release still removes its own lock.
  await release1();
  expect(mockStore.has(LOCK)).toBe(false);
});
