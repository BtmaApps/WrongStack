/**
 * FS-P0.GATE verification: compaction test.
 *
 * AC8 requires: "Compaction removes findings older than the configured TTL
 * without affecting active findings."
 *
 * Existing store tests cover upsert, transition, list, and getEvents.
 * Compaction is the only untested store operation.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JsonlFindingStore } from '../../src/plugins/review-finding-store.js';
import type { ChimeraFinding, FindingStatus } from '../../src/plugins/review-finding-types.js';

let dir: string;
let store: JsonlFindingStore;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'finding-compact-'));
  store = new JsonlFindingStore(dir);
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const ctx = {
  sessionId: 'compact-test',
  reportId: 'r1',
  agentId: 'test-agent',
  model: 'test-model',
};

describe('FS-P0.GATE — Compaction', () => {
  it('removes old resolved findings', async () => {
    // Create a resolved finding with a very old timestamp
    const old = await store.upsert(
      [
        {
          id: 'old-resolved',
          fingerprint: 'fp-old',
          severity: 'critical' as const,
          source: 'chimera' as const,
          location: { file: 'old.ts', line: 1 },
          title: 'Old resolved',
          description: 'Should be compacted',
          status: 'resolved' as const,
          createdAt: new Date(Date.now() - 40 * 86400_000).toISOString(), // 40 days ago
          originReport: { reportId: 'r-old', sessionId: 's-old', agentId: 'a', reviewerModel: 'm' },
        },
      ],
      ctx,
    );
    expect(old.created).toBe(1);

    // Create an active finding (same age, but active — should be kept)
    const active = await store.upsert(
      [
        {
          id: 'old-active',
          fingerprint: 'fp-active',
          severity: 'high' as const,
          source: 'chimera' as const,
          location: { file: 'active.ts', line: 2 },
          title: 'Old but active',
          description: 'Should survive compaction',
          status: 'active' as const,
          createdAt: new Date(Date.now() - 40 * 86400_000).toISOString(),
          originReport: { reportId: 'r-old', sessionId: 's-old', agentId: 'a', reviewerModel: 'm' },
        },
      ],
      ctx,
    );
    expect(active.created).toBe(1);

    // Compact with a short retention window
    const result = await store.compact({
      resolvedMaxAgeMs: 30 * 86400_000, // 30 days
      ignoredMaxAgeMs: 14 * 86400_000,
    });

    expect(result.removed).toBe(1); // old resolved removed
    expect(result.eventsFolded).toBeGreaterThanOrEqual(0);

    // Active finding survived
    const remaining = await store.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe('old-active');
  });

  it('removes old ignored findings', async () => {
    const oldIgnored = await store.upsert(
      [
        {
          id: 'old-ignored',
          fingerprint: 'fp-ignored',
          severity: 'low' as const,
          source: 'chimera' as const,
          location: { file: 'ignored.ts', line: 3 },
          title: 'Old ignored',
          description: 'Should be compacted',
          status: 'ignored' as const,
          createdAt: new Date(Date.now() - 20 * 86400_000).toISOString(), // 20 days ago
          originReport: { reportId: 'r-ign', sessionId: 's-ign', agentId: 'a', reviewerModel: 'm' },
        },
      ],
      ctx,
    );
    expect(oldIgnored.created).toBe(1);

    const result = await store.compact({
      resolvedMaxAgeMs: 30 * 86400_000,
      ignoredMaxAgeMs: 14 * 86400_000, // 14 day TTL — our finding is 20 days old
    });

    expect(result.removed).toBe(1);
    const remaining = await store.list();
    expect(remaining).toHaveLength(0);
  });

  it('keeps active findings regardless of age', async () => {
    const veryOld = await store.upsert(
      [
        {
          id: 'very-old-active',
          fingerprint: 'fp-very-old',
          severity: 'medium' as const,
          source: 'chimera' as const,
          location: { file: 'old.ts', line: 10 },
          title: 'Very old but active',
          description: 'Active findings survive even past TTL',
          status: 'active' as const,
          createdAt: new Date(Date.now() - 100 * 86400_000).toISOString(), // 100 days ago!
          originReport: { reportId: 'r-old', sessionId: 's-old', agentId: 'a', reviewerModel: 'm' },
        },
      ],
      ctx,
    );
    expect(veryOld.created).toBe(1);

    const result = await store.compact({
      resolvedMaxAgeMs: 1, // 1ms TTL — would remove anything eligible
      ignoredMaxAgeMs: 1,
    });

    expect(result.removed).toBe(0); // active findings are never removed
    const remaining = await store.list();
    expect(remaining).toHaveLength(1);
  });

  it('compaction is idempotent', async () => {
    await store.upsert(
      [
        {
          id: 'idempotent',
          fingerprint: 'fp-ido',
          severity: 'high' as const,
          source: 'chimera' as const,
          location: { file: 'tmp.ts', line: 1 },
          title: 'Test',
          description: 'Test',
          status: 'resolved' as const,
          createdAt: new Date(Date.now() - 60 * 86400_000).toISOString(),
          originReport: { reportId: 'r', sessionId: 's', agentId: 'a', reviewerModel: 'm' },
        },
      ],
      ctx,
    );

    const r1 = await store.compact({ resolvedMaxAgeMs: 30 * 86400_000 });
    expect(r1.removed).toBe(1);

    const r2 = await store.compact({ resolvedMaxAgeMs: 30 * 86400_000 });
    expect(r2.removed).toBe(0); // already removed
    expect(r2.eventsFolded).toBe(0);
  });

  // ── Bounded retention for non-terminal findings ────────────────────

  const DAY = 86_400_000;
  const aged = (days: number) => new Date(Date.now() - days * DAY).toISOString();

  function finding(id: string, status: FindingStatus, createdAt: string): ChimeraFinding {
    return {
      id,
      fingerprint: `fp-${id}`,
      severity: 'high',
      source: 'chimera',
      location: { file: `${id}.ts`, line: 1 },
      title: id,
      description: id,
      status,
      createdAt,
      originReport: { reportId: 'r', sessionId: 's', agentId: 'a', reviewerModel: 'm' },
    };
  }

  it('never reaches resolved or ignored rows with the non-terminal cap', async () => {
    // All three rows are older than the 10-day non-terminal cap, but the two
    // terminal rows are still INSIDE their own 30d/14d windows. If the new cap
    // leaked onto terminal statuses, both would be deleted here.
    await store.upsert(
      [
        finding('resolved-young', 'resolved', aged(20)),
        finding('ignored-young', 'ignored', aged(8)),
        finding('active-old', 'active', aged(10)),
        finding('triaged-old', 'triaged', aged(10)),
        finding('in_progress-old', 'in_progress', aged(10)),
      ],
      ctx,
    );

    const result = await store.compact({ nonTerminalMaxAgeMs: 10 * DAY });

    // Terminal rows untouched: their own windows are 30d/20d and 14d/8d.
    expect(result.removed).toBe(0);
    expect(result.removedNonTerminal).toBe(3);
    for (const id of ['resolved-young', 'ignored-young']) {
      const kept = await store.get(id);
      expect(kept, id).not.toBeNull();
    }
    for (const id of ['active-old', 'triaged-old', 'in_progress-old']) {
      expect(await store.get(id), id).toBeNull();
    }
  });

  it('keeps the existing terminal retention when a non-terminal cap is active', async () => {
    // resolved at 40d is past its own 30d window, so it is still removed — and
    // still counted as terminal churn, not as a non-terminal eviction.
    await store.upsert(
      [finding('resolved-old', 'resolved', aged(40)), finding('active-old', 'active', aged(40))],
      ctx,
    );

    const result = await store.compact({ nonTerminalMaxAgeMs: 10 * DAY });

    expect(result.removed).toBe(1); // the resolved row, by the 30d rule
    expect(result.removedNonTerminal).toBe(1); // the active row, by the new cap
    expect(await store.get('resolved-old')).toBeNull();
    expect(await store.get('active-old')).toBeNull();
  });

  it('omitting the cap keeps non-terminal findings immortal (legacy contract)', async () => {
    await store.upsert([finding('active-ancient', 'active', aged(400))], ctx);

    const result = await store.compact();

    expect(result.removed).toBe(0);
    expect(result.removedNonTerminal).toBe(0);
    expect(await store.get('active-ancient')).not.toBeNull();
  });

  it('POSITIVE_INFINITY disables the sweep without touching terminal windows', async () => {
    await store.upsert(
      [finding('active-old', 'active', aged(400)), finding('resolved-old', 'resolved', aged(400))],
      ctx,
    );

    const result = await store.compact({ nonTerminalMaxAgeMs: Number.POSITIVE_INFINITY });

    expect(result.removedNonTerminal).toBe(0);
    expect(result.removed).toBe(1); // 400d resolved still past its 30d window
    expect(await store.get('active-old')).not.toBeNull();
  });

  it('records the non-terminal split in the compaction marker', async () => {
    await store.upsert([finding('active-old', 'active', aged(50))], ctx);

    await store.compact({ nonTerminalMaxAgeMs: 10 * DAY });

    const raw = await fs.readFile(store.storePath, 'utf8');
    const marker = raw
      .trim()
      .split(/\r?\n/)
      .map((l) => {
        try {
          return JSON.parse(l) as Record<string, unknown>;
        } catch {
          return {};
        }
      })
      .find((o) => o['__findingCompact'] === 1);
    expect(marker).toMatchObject({ removedFindings: 0, removedNonTerminalFindings: 1 });
  });
});
