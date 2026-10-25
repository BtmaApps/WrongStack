import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acceptDueConsolidations } from '../src/consolidation/auto-accept.js';
import {
  buildConsolidationBatches,
  proposedMemberIds,
  selectConsolidationPool,
} from '../src/consolidation/batches.js';
import { parseConsolidationResponse } from '../src/consolidation/distill.js';
import { runConsolidationPass } from '../src/consolidation/run.js';
import { scheduleConsolidation } from '../src/consolidation/schedule.js';
import { SqliteSageStore } from '../src/sqlite-store.js';
import type { MemoryCandidate, Sage } from '../src/types.js';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-25T00:00:00Z');

function memory(id: string, overrides: Partial<Sage> = {}): Sage {
  return {
    id,
    revision: 1,
    text: `Bug-hunt round ${id}/25 (2026-10-20, HEAD abc1234def): NO-PROVEN-BUG, zero edits.`,
    kind: 'task_outcome',
    scope: 'project',
    status: 'active',
    importance: 0.6,
    confidence: 0.8,
    freshness: 1,
    tags: [],
    anchors: [{ type: 'file', path: 'packages/tui/src/hooks/use-brain-panel.ts' }],
    sources: [{ type: 'session', sessionId: 's1' }],
    createdAt: new Date(NOW - 5 * DAY).toISOString(),
    updatedAt: new Date(NOW - 5 * DAY).toISOString(),
    ...overrides,
  } as Sage;
}

describe('consolidation pool and batches', () => {
  it('selects progress logs and aged-out notes, never evergreen, pinned or unanchored ones', () => {
    const pool = selectConsolidationPool(
      [
        memory('1'),
        memory('2', {
          text: 'The cache key includes the model id.',
          kind: 'fact',
          createdAt: new Date(NOW - 60 * DAY).toISOString(),
        }),
        memory('3', { text: 'Always run biome on owned files only.', kind: 'convention' }),
        memory('4', { importance: 0.95 }),
        memory('5', { anchors: [] }),
        memory('6', { persistence: 'permanent' }),
        memory('7', { status: 'stale' }),
      ],
      NOW,
    );
    expect(pool.map((m) => m.id)).toEqual(['1', '2']);
  });

  it('excludes members already proposed, until a rejection cools down', () => {
    const candidate = (status: MemoryCandidate['status'], updatedAt: number) =>
      ({
        suggestedAction: 'consolidate',
        status,
        updatedAt: new Date(updatedAt).toISOString(),
        supersedesMemoryIds: ['a'],
      }) as MemoryCandidate;
    expect(proposedMemberIds([candidate('pending', NOW)], NOW).has('a')).toBe(true);
    expect(proposedMemberIds([candidate('rejected', NOW - 10 * DAY)], NOW).has('a')).toBe(true);
    expect(proposedMemberIds([candidate('rejected', NOW - 100 * DAY)], NOW).has('a')).toBe(false);
  });

  it('groups by shared file anchor, then by directory, in prompt-sized batches', () => {
    const file = (id: string, p: string) => memory(id, { anchors: [{ type: 'file', path: p }] });
    const batches = buildConsolidationBatches(
      [
        ...Array.from({ length: 14 }, (_, i) => file(`a${i}`, 'packages/tui/src/hooks/a.ts')),
        file('b1', 'packages/tui/src/hooks/b.ts'),
        file('b2', 'packages/tui/src/hooks/c.ts'),
        file('b3', 'packages/tui/src/hooks/d.ts'),
        file('lonely', 'packages/other/x.ts'),
      ],
      { maxMembers: 12 },
    );
    expect(batches.map((b) => [b.key, b.members.length])).toEqual([
      ['packages/tui/src/hooks/a.ts', 12],
      ['packages/tui/src/hooks', 3],
    ]);
  });
});

describe('parseConsolidationResponse grounding gate', () => {
  const batch = {
    key: 'packages/tui/src/hooks/use-brain-panel.ts',
    members: [memory('m1'), memory('m2', { revision: 3 }), memory('m3')],
  };
  const answer = (lesson: unknown) => JSON.stringify({ lesson });
  const good = {
    text: 'packages/tui/src/hooks/use-brain-panel.ts was audited clean for focus handling; its double interval with use-app-environment is idempotent and is not a bug to re-raise.',
    kind: 'anti_pattern',
    anchors: [{ type: 'file', path: 'packages/tui/src/hooks/use-brain-panel.ts' }],
    tags: ['tui'],
    sourceIds: ['m1', 'm2', 'invented'],
  };

  it('keeps a grounded lesson with real sources and their revisions', () => {
    const lesson = parseConsolidationResponse(answer(good), batch);
    expect(lesson?.sourceIds).toEqual(['m1', 'm2']);
    expect(lesson?.sourceRevisions).toEqual([1, 3]);
    expect(lesson?.tags).toContain('consolidated');
  });

  it('accepts a fenced answer', () => {
    expect(parseConsolidationResponse(`\`\`\`json\n${answer(good)}\n\`\`\``, batch)).not.toBeNull();
  });

  it.each([
    ['no lesson', null],
    ['one source', { ...good, sourceIds: ['m1'] }],
    ['invented anchor', { ...good, anchors: [{ type: 'file', path: 'src/elsewhere.ts' }] }],
    ['unknown kind', { ...good, kind: 'memory_review' }],
    [
      'another progress log',
      {
        ...good,
        text: 'Bug-hunt round 4/25 (HEAD abc1234): NO-PROVEN-BUG, all suites 120/120 green.',
      },
    ],
  ])('drops %s', (_label, lesson) => {
    expect(parseConsolidationResponse(answer(lesson), batch)).toBeNull();
  });
});

describe('consolidation end to end on a real store', () => {
  let tmpDir: string;
  let store: SqliteSageStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sage-consolidation-'));
    store = new SqliteSageStore({ projectRoot: tmpDir });
  });

  afterEach(async () => {
    vi.useRealTimers();
    store.close();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function seedLogs(): Promise<Sage[]> {
    const file = 'packages/tui/src/hooks/use-brain-panel.ts';
    const seeded: Sage[] = [];
    const findings = [
      'keyboard focus trap on the brain overlay checked against the ink input hook',
      'duplicate statusline interval observed beside use-app-environment, idempotent dispatch',
      'decision queue rendering verified for empty, single and overflow states',
    ];
    for (const [index, round] of [3, 7, 11].entries()) {
      seeded.push(
        await store.rememberSage({
          text: `Bug-hunt round ${round}/25 (2026-10-2${round % 10}, HEAD abc${round}234def): NO-PROVEN-BUG, zero edits. ${file}: ${findings[index]}.`,
          kind: 'task_outcome',
          importance: 0.6,
          anchors: [{ type: 'file', path: file }],
          sources: [{ type: 'session', sessionId: `s${round}` }],
        }),
      );
    }
    return seeded;
  }

  it('proposes one lesson, and accepting it supersedes only unchanged members', async () => {
    const logs = await seedLogs();
    const llm = vi.fn(async (_system: string, prompt: string) => {
      const ids = [...prompt.matchAll(/"id": "([^"]+)"/g)].map((m) => m[1]);
      return JSON.stringify({
        lesson: {
          text: 'packages/tui/src/hooks/use-brain-panel.ts focus handling was audited clean three times; its duplicate interval is idempotent and is not a defect to re-raise.',
          kind: 'anti_pattern',
          anchors: [{ type: 'file', path: 'packages/tui/src/hooks/use-brain-panel.ts' }],
          tags: ['tui'],
          sourceIds: ids,
        },
      });
    });

    const report = await runConsolidationPass(store, llm);
    expect(report).toMatchObject({ batches: 1, calls: 1, proposed: 1 });
    const [proposal] = (await store.listCandidates(false)).filter(
      (c) => c.suggestedAction === 'consolidate',
    );
    expect(proposal?.supersedesMemoryIds?.sort()).toEqual(logs.map((m) => m.id).sort());

    // A second pass does not re-propose members already under review.
    expect((await runConsolidationPass(store, llm)).pool).toBe(0);

    // One member is edited after distillation: it keeps its own lifecycle.
    await store.updateSage(logs[0]!.id, { tags: ['edited'] });
    const lesson = await store.acceptCandidate(proposal!.id);
    expect(lesson?.kind).toBe('anti_pattern');
    expect((await store.getSage(logs[0]!.id))?.status).toBe('active');
    for (const member of logs.slice(1)) {
      const after = await store.getSage(member.id);
      expect(after?.status).toBe('superseded');
      expect(after?.supersededBy).toBe(lesson?.id);
    }
  });

  it('skips a batch whose shared path is gone instead of paying for a stale lesson', async () => {
    await seedLogs();
    const llm = vi.fn(async () => JSON.stringify({ lesson: null }));
    const report = await runConsolidationPass(store, llm, { projectRoot: tmpDir });
    expect(report).toMatchObject({ batches: 1, skippedMissing: 1, calls: 0 });
    expect(llm).not.toHaveBeenCalled();
  });

  it('auto-accepts only proposals older than the review window', async () => {
    const logs = await seedLogs();
    const proposal = await store.createCandidate({
      text: 'packages/tui/src/hooks/use-brain-panel.ts focus handling is audited clean; do not re-raise the duplicate interval.',
      kind: 'anti_pattern',
      anchors: [{ type: 'file', path: 'packages/tui/src/hooks/use-brain-panel.ts' }],
      suggestedAction: 'consolidate',
      supersedesMemoryIds: logs.map((m) => m.id),
      supersedesRevisions: logs.map((m) => m.revision),
    });
    const createdAt = Date.parse(proposal.createdAt);

    expect((await acceptDueConsolidations(store, createdAt + 6 * DAY)).accepted).toEqual([]);
    expect((await acceptDueConsolidations(store, createdAt + 8 * DAY)).accepted).toEqual([
      proposal.id,
    ]);
    expect((await store.getSage(logs[0]!.id))?.status).toBe('superseded');
  });

  it('rejects malformed supersede lists', async () => {
    await expect(
      store.createCandidate({
        text: 'A lesson that names its members without revisions.',
        kind: 'fact',
        anchors: [{ type: 'file', path: 'a.ts' }],
        supersedesMemoryIds: ['x'],
      }),
    ).rejects.toThrow(/supersedesMemoryIds/);
  });

  it('the schedule runs once a day per project, only when idle, under the shared lock', async () => {
    await seedLogs();
    let now = NOW;
    const llm = vi.fn(async () => JSON.stringify({ lesson: null }));
    const stateDir = path.join(tmpDir, 'hygiene');
    let listeners: Array<() => void> = [];
    const events = {
      on: (_event: string, fn: () => void) => {
        listeners.push(fn);
        return () => {
          listeners = listeners.filter((l) => l !== fn);
        };
      },
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
    const dispose = scheduleConsolidation({
      surface: store,
      getLlmCall: () => llm,
      stateDir,
      maxCalls: 5,
      logger: { debug: () => {} } as never,
      events: events as never,
      now: () => now,
      firstCheckMs: 1_000,
      checkIntervalMs: 1_000,
      idleMs: 10_000,
    });

    // Busy: the session just ran an iteration.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(llm).not.toHaveBeenCalled();

    now += 20_000;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(llm).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(await fs.readFile(path.join(stateDir, 'consolidation.json'), 'utf8')),
    ).toMatchObject({
      lastReport: { calls: 1, proposed: 0, noLesson: 1 },
    });

    // Same day: no second pass. A foreign lock blocks the next day's.
    now += 60_000;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(llm).toHaveBeenCalledTimes(1);
    now += DAY;
    // A live lock from another host, stamped on the scheduler's clock.
    const lock = path.join(stateDir, 'consolidation.lock');
    await fs.writeFile(lock, '999');
    await fs.utimes(lock, now / 1000, now / 1000);
    for (const listener of listeners) listener();
    now += 20_000;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(llm).toHaveBeenCalledTimes(1);

    // Lock gone, next day: the members the model saw without retiring are
    // not paid for again within the skip window.
    await fs.rm(lock);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(llm).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(await fs.readFile(path.join(stateDir, 'consolidation.json'), 'utf8')).lastReport,
    ).toMatchObject({ pool: 0, calls: 0 });

    dispose();
    expect(listeners).toHaveLength(0);
  });
});
