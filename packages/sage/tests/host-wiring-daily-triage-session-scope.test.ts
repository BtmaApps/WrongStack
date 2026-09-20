/**
 * Regression: the SAGE daily dry-run triage pass must list the corpus with
 * includeAllSessions so owned session-scoped memories are not silently
 * excluded by buildSessionClause's default
 * `(scope != 'session' OR owner_session_id IS NULL)`.
 *
 * The manual /memory triage command passes the same flag
 * (loadActiveMemories); the daily pass is the same kind of admin surface.
 *
 * Discriminating design — three gray-zone memories with the same shape:
 *   control  (project scope)              → visible under the default clause
 *   unowned  (session scope, owner NULL)  → visible under the default clause
 *   victim   (session scope, owner set)   → visible only with the flag
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupSage } from '../src/host-wiring.js';
import { SqliteMemoryPort } from '../src/memory-port.js';

describe('daily dry-run triage session scope', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('considers a session-scoped memory owned by another session', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sage-daily-session-scope-'));
    const port = new SqliteMemoryPort({ projectRoot: dir });
    try {
      const remember = (text: string, n: number, session?: string) =>
        port.rememberSage({
          text,
          kind: 'fact',
          scope: 'project',
          importance: 0.55,
          confidence: 0.5,
          freshness: 1,
          persistence: 'long_lived',
          tags: ['sage', 'injection'],
          anchors: [{ type: 'file', path: `src/proofs/p${n}.ts` }],
          sources: [{ type: 'user' }],
          ...(session ? { scope: 'session' as const, ownerSessionId: session } : {}),
        });

      const control = await remember(
        'CTRLMRK7 The preview deployment pipeline ships marketing artifacts from the website ' +
          'workspace each night, and the ops channel receives the manifest digest after the ' +
          'registry upload finishes its checksum verification pass.',
        900,
      );
      const unowned = await remember(
        'UNOWNMRK5 The telemetry sampler aggregates per-channel latency buckets every fifteen ' +
          'minutes and rolls the oldest window into the weekly capacity report that the ' +
          'planning committee reviews each Monday morning before standup.',
        901,
      );
      const victim = await remember(
        'VICTMRK3 Historically the release checklist keeps a manual smoke pass over the payment ' +
          'flow because the sandbox provider drops webhooks during maintenance windows, which ' +
          'surfaced twice last quarter as false-negative overnight regression failures.',
        902,
        'sess-proof-owner-1',
      );

      // `unowned` becomes a session-scoped row with a NULL owner via surgery:
      // the remember API documents ownerSessionId as required for session
      // scope, so the unowned variant cannot be written through it.
      (
        port as unknown as {
          stmt: (sql: string) => { run(...args: unknown[]): unknown };
        }
      )
        .stmt(
          "UPDATE memories SET scope = 'session', data = json_set(data, '$.scope', 'session') WHERE id = ?",
        )
        .run(unowned.id);

      // The unflagged listing hides the OWNED session row (session clause
      // applies to count and page alike — total 2 is the exclusion itself).
      const probeA = await port.listSagePage({ statuses: ['active', 'stale'], limit: 50 });
      expect(probeA.total).toBe(2);
      expect(probeA.memories.some((m) => m.id === control.id)).toBe(true);
      expect(probeA.memories.some((m) => m.id === unowned.id)).toBe(true);
      expect(probeA.memories.some((m) => m.id === victim.id)).toBe(false);

      // The flagged listing includes everything — the flag, not the row
      // shape, is the mechanism.
      const probeB = await port.listSagePage({
        statuses: ['active', 'stale'],
        limit: 50,
        includeAllSessions: true,
      });
      expect(probeB.total).toBe(3);
      expect(probeB.memories.some((m) => m.id === victim.id)).toBe(true);

      // Real daily dry-run with a recording neutral LLM: all three gray
      // probes must reach Phase 3.
      vi.useFakeTimers();
      const prompts: string[] = [];
      const memoryStore = {
        hygiene: async () => ({}),
        getCapability: (cap: { id: string }) => port.getCapability(cap),
      } as never;
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
        logger: { debug: (_msg: string) => {} } as never,
        events: { on: vi.fn(), emit: vi.fn() } as never,
        projectRoot: dir,
        getLlmCall: () => async (system: string, user: string) => {
          prompts.push(`${system}\n${user}`);
          return '3';
        },
      });
      await vi.advanceTimersByTimeAsync(60 * 60_000);
      await teardown();

      expect(prompts.some((p) => p.includes('CTRLMRK7'))).toBe(true);
      expect(prompts.some((p) => p.includes('UNOWNMRK5'))).toBe(true);
      expect(prompts.some((p) => p.includes('VICTMRK3'))).toBe(true);
    } finally {
      try {
        await port.dispose();
      } catch {
        /* best-effort close */
      }
      vi.useRealTimers();
      await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(
        () => {},
      );
    }
  });
});
