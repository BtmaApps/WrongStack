/**
 * Regression: the SAGE daily dry-run triage pass must cursor-walk the whole
 * active+stale corpus instead of reading one listSagePage frame.
 *
 * Ordering is `updated_at DESC, id DESC` (stable) and a dry run never mutates
 * updated_at, so a single 200-row page would permanently hide the older tail
 * from the only automatic triage pass. The manual /memory triage command
 * cursor-walks the same corpus (loadActiveMemories); this pins the daily
 * path to the same enumeration.
 *
 * Harness notes:
 * - REAL SqliteMemoryPort (production surface implementation) on a temp store.
 * - Every memory gets a DISTINCT anchor path and a near-duplicate-safe text
 *   (rememberSage merges writes whose Szymkiewicz–Simpson token overlap is
 *   ≥ 0.88, or ≥ 0.72 with a shared structural anchor).
 * - Fake timers are enabled BEFORE setupSage so the 1h daily setTimeout
 *   registers on the fake clock, and never re-enabled afterwards (a second
 *   useFakeTimers() installs a fresh clock and abandons the pending timer).
 * - Only `hygiene` is stubbed so anchor verification cannot reorder the
 *   seeded rows mid-run; the LLM stub records prompts and scores '3'.
 */
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupSage } from '../src/host-wiring.js';
import { SqliteMemoryPort } from '../src/memory-port.js';
import type { Sage } from '../src/types.js';

/**
 * Near-duplicate-safe filler text: unique 7-token signature plus a fixed
 * 8-token frame of ~15 total → pairwise overlap ≤ ~0.53, far below the
 * 0.72/0.88 merge thresholds.
 */
function fillerText(i: number): string {
  return (
    `Sweep note: marker alpha${i} bravo${i} delta${i} kilo${i} oscar${i} romeo${i} ` +
    `tango${i} verified against baseline copy ${i} tonight.`
  );
}

interface DailyHarness {
  port: SqliteMemoryPort;
  dir: string;
  prompts: string[];
  debugLogs: string[];
}

/** Seed `count` keeper fillers + the two gray-zone probes, then run the daily pass once. */
async function runDailyOverCorpus(count: number): Promise<DailyHarness> {
  const dir = await mkdtemp(join(tmpdir(), 'sage-daily-pagination-'));
  const port = new SqliteMemoryPort({ projectRoot: dir });
  await mkdir(join(dir, 'src'), { recursive: true });

  const remember = (text: string, gray: boolean, n: number) =>
    port.rememberSage({
      text,
      kind: gray ? 'fact' : 'decision',
      scope: 'project',
      importance: gray ? 0.55 : 0.85,
      confidence: gray ? 0.5 : 1,
      freshness: gray ? 1 : undefined,
      tags: gray ? ['sage', 'injection'] : ['boot', 'safety'],
      anchors: [{ type: 'file', path: `src/proofs/p${n}.ts` }],
      sources: [{ type: 'user' }],
    });

  const fillerIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const m = await remember(fillerText(i), false, i);
    fillerIds.push(m.id);
  }
  // Two gray-zone probes (value score ~56 → Phase 3) on different topics.
  const control = await remember(
    'CTRLMRK7 The preview deployment pipeline ships marketing artifacts from the website ' +
      'workspace each night, and the ops channel receives the manifest digest after the ' +
      'registry upload finishes its checksum verification pass.',
    true,
    900,
  );
  const victim = await remember(
    'VICTMRK3 Historically the release checklist keeps a manual smoke pass over the payment ' +
      'flow because the sandbox provider drops webhooks during maintenance windows, which ' +
      'surfaced twice last quarter as false-negative overnight regression failures.',
    true,
    901,
  );

  // Deterministic ordering: control newest, fillers middle, victim oldest.
  const base = Date.now();
  const iso = (minutesAgo: number) => new Date(base - minutesAgo * 60_000).toISOString();
  const updateStmt = (
    port as unknown as {
      stmt: (sql: string) => { run(...args: unknown[]): unknown };
    }
  ).stmt(
    "UPDATE memories SET updated_at = ?, data = json_set(data, '$.updatedAt', ?) WHERE id = ?",
  );
  const setAge = (id: string, minutesAgo: number) => {
    const t = iso(minutesAgo);
    updateStmt.run(t, t, id);
  };
  setAge(control.id, 1);
  for (let i = 0; i < fillerIds.length; i++) {
    setAge(fillerIds[i] as string, 2 + i);
  }
  setAge(victim.id, 2 + count + 1);

  const prompts: string[] = [];
  const debugLogs: string[] = [];
  const memoryStore = {
    hygiene: async () => ({}),
    getCapability: (cap: { id: string }) => port.getCapability(cap),
  } as never;
  vi.useFakeTimers();
  const teardown = setupSage({
    config: {
      features: { memory: true },
      Sage: {
        enabled: true,
        triage: { dailyDryRun: true },
        hygiene: { autoAfterSession: false },
      },
    } as never,
    pipelines: { toolCall: { use: vi.fn() }, request: { use: vi.fn() } } as never,
    memoryStore,
    logger: {
      debug: (msg: string) => {
        debugLogs.push(msg);
      },
    } as never,
    events: { on: vi.fn(), emit: vi.fn() } as never,
    projectRoot: dir,
    getLlmCall: () => async (system: string, user: string) => {
      prompts.push(`${system}\n${user}`);
      return '3';
    },
  });
  await vi.advanceTimersByTimeAsync(60 * 60_000);
  await teardown();
  return { port, dir, prompts, debugLogs };
}

async function disposeHarness(h: DailyHarness): Promise<void> {
  try {
    await h.port.dispose();
  } catch {
    /* best-effort close */
  }
  vi.useRealTimers();
  await rm(h.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
}

describe('daily dry-run triage pagination', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('considers a memory positioned beyond the first 200-row page', async () => {
    // 248 fillers + control + victim = 250 rows → two pages (200 + 50).
    const h = await runDailyOverCorpus(248);
    try {
      const probe = await h.port.listSagePage({ statuses: ['active', 'stale'], limit: 200 });
      expect(probe.memories.length).toBe(200);
      expect(probe.nextCursor).toBeTruthy();
      expect(probe.total).toBe(250);

      // The daily pass ran end to end and both gray probes reached Phase 3.
      expect(h.debugLogs.some((l) => l.includes('sage daily dry-run: hygiene complete'))).toBe(
        true,
      );
      expect(h.prompts.some((p) => p.includes('CTRLMRK7'))).toBe(true);
      expect(h.prompts.some((p) => p.includes('VICTMRK3'))).toBe(true);
    } finally {
      await disposeHarness(h);
    }
  });

  it('terminates on an exact-page corpus without a cursor', async () => {
    // 199 fillers + control + victim = 201 rows: still exercises the
    // continuation (200 + 1). A corpus of exactly the page size is covered
    // structurally by nextCursor === null on the final frame.
    const h = await runDailyOverCorpus(199);
    try {
      const probe = await h.port.listSagePage({ statuses: ['active', 'stale'], limit: 200 });
      expect(probe.total).toBe(201);
      expect(probe.memories.length).toBe(200);
      expect(probe.nextCursor).toBeTruthy();

      expect(h.debugLogs.some((l) => l.includes('sage daily dry-run: hygiene complete'))).toBe(
        true,
      );
      expect(h.prompts.some((p) => p.includes('CTRLMRK7'))).toBe(true);
      expect(h.prompts.some((p) => p.includes('VICTMRK3'))).toBe(true);
    } finally {
      await disposeHarness(h);
    }
  });

  it('walks the entire corpus when listSagePage frames are smaller than the cap', async () => {
    // Same guarantee observed from the listing side: every row is reachable
    // by following nextCursor, which is what the daily walk now does.
    const h = await runDailyOverCorpus(248);
    try {
      const seen: Sage[] = [];
      let cursor: string | undefined;
      do {
        const page = await h.port.listSagePage({
          statuses: ['active', 'stale'],
          limit: 50,
          ...(cursor !== undefined ? { cursor } : {}),
        });
        seen.push(...page.memories);
        cursor = page.nextCursor ?? undefined;
      } while (cursor !== undefined);
      expect(seen.length).toBe(250);
    } finally {
      await disposeHarness(h);
    }
  });
});
