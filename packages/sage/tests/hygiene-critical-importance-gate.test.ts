import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteSageStore } from '../src/sqlite-store.js';

/**
 * Regression: hygiene's automatic destructive proposals must honor the
 * importance safety gate.
 *
 * `importance >= 0.9` means task "user-designated critical":
 *  - `triage/pre-filter.ts` KEEP rule 1 skips such a memory entirely, and
 *  - `triage/action-dispatcher.ts` states "Safety gate: importance >= 0.9
 *    memories never get destructive proposals".
 *
 * Hygiene's `injected_never_used` rule is a statistical signal ("injected N
 * times, never used") and used to recommend `delete` regardless of importance,
 * so a critical memory could be proposed for deletion on non-use alone. The
 * review candidate must still be filed — as non-destructive `investigate`.
 */
const DAY_MS = 86_400_000;

describe('hygiene importance safety gate', () => {
  const stores: SqliteSageStore[] = [];
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(stores.splice(0).map((store) => store.close()));
    await Promise.all(
      directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
    );
  });

  /** Store whose clock the test advances, so retention ages are deterministic. */
  async function createStore(): Promise<{
    store: SqliteSageStore;
    advance: (days: number) => void;
  }> {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sage-hygiene-gate-'));
    directories.push(projectRoot);
    let clock = Date.parse('2026-01-01T00:00:00.000Z');
    const store = new SqliteSageStore({ projectRoot, now: () => new Date(clock) });
    stores.push(store);
    await store.initialize();
    return { store, advance: (days) => (clock += days * DAY_MS) };
  }

  /** Drive a memory to the `injected_never_used` condition. */
  async function ageIntoUnused(store: SqliteSageStore, id: string): Promise<void> {
    for (let i = 0; i < 10; i++) await store.recordInjection([id], 'tool_result');
  }

  it('files an investigate proposal instead of a delete proposal for a critical memory', async () => {
    const { store, advance } = await createStore();
    const critical = await store.rememberSage({
      text: 'Never delete the memory store without taking a verified backup first.',
      kind: 'fact',
      importance: 0.95,
      confidence: 0.9,
    });
    const ordinary = await store.rememberSage({
      text: 'Ordinary note about where the retry helper lives in the utils module.',
      kind: 'fact',
      importance: 0.5,
      confidence: 0.8,
    });
    await ageIntoUnused(store, critical.id);
    await ageIntoUnused(store, ordinary.id);
    advance(31);

    const report = await store.hygiene({ verify: false });
    const pending = await store.listCandidates(false);
    const criticalProposal = pending.find((c) => c.targetMemoryId === critical.id);
    const ordinaryProposal = pending.find((c) => c.targetMemoryId === ordinary.id);

    // The signal is preserved for review — only its destructiveness is gated.
    expect(criticalProposal?.reviewReason).toBe('injected_never_used');
    expect(criticalProposal?.suggestedAction).toBe('investigate');
    // Control: below the floor the rule still recommends deletion.
    expect(ordinaryProposal?.reviewReason).toBe('injected_never_used');
    expect(ordinaryProposal?.suggestedAction).toBe('delete');
    expect(report.reviewCandidatesCreated).toBe(2);
    expect(report.deleted).toBe(0);
  });

  it('gates at exactly 0.9 and leaves 0.89 below the floor', async () => {
    const { store, advance } = await createStore();
    const atFloor = await store.rememberSage({
      text: 'Boundary memory pinned at the documented critical importance floor.',
      kind: 'fact',
      importance: 0.9,
      confidence: 0.9,
    });
    const justBelow = await store.rememberSage({
      text: 'Boundary memory sitting one step under the critical importance floor.',
      kind: 'fact',
      importance: 0.89,
      confidence: 0.9,
    });
    await ageIntoUnused(store, atFloor.id);
    await ageIntoUnused(store, justBelow.id);
    advance(31);

    await store.hygiene({ verify: false });
    const pending = await store.listCandidates(false);

    expect(pending.find((c) => c.targetMemoryId === atFloor.id)?.suggestedAction).toBe(
      'investigate',
    );
    expect(pending.find((c) => c.targetMemoryId === justBelow.id)?.suggestedAction).toBe('delete');
  });

  it('still skips permanent high-importance memories entirely', async () => {
    const { store, advance } = await createStore();
    const permanent = await store.rememberSage({
      text: 'Permanent invariant memory that hygiene must never touch at all.',
      kind: 'fact',
      importance: 0.95,
      confidence: 0.9,
      persistence: 'permanent',
    });
    await ageIntoUnused(store, permanent.id);
    advance(31);

    const report = await store.hygiene({ verify: false });
    const pending = await store.listCandidates(false);

    expect(pending.some((c) => c.targetMemoryId === permanent.id)).toBe(false);
    expect(report.reviewCandidatesCreated).toBe(0);
    expect(report.deleted).toBe(0);
    expect(report.archived).toBe(0);
  });
});
