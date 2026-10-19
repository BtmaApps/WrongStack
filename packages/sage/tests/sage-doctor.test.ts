import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SageDoctorReport } from '../src/memory-doctor-types.js';
import { SqliteSageStore } from '../src/sqlite-store.js';

let directory: string;
let store: SqliteSageStore;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-sage-doctor-'));
  store = new SqliteSageStore({ projectRoot: directory });
  await store.initialize();
});

afterEach(async () => {
  store.close();
  await fs.rm(directory, { recursive: true, force: true });
});

function db(): DatabaseSync {
  return (store as unknown as { db: DatabaseSync }).db;
}

function addEdge(from: string, to: string, relation: string): void {
  db()
    .prepare(
      'INSERT INTO edges (from_node, to_node, relation, weight, created_at) VALUES (?, ?, ?, 1, ?)',
    )
    .run(from, to, relation, '2026-07-19T00:00:00.000Z');
}

function checkOf(report: SageDoctorReport, id: string) {
  const found = report.checks.find((check) => check.id === id);
  if (!found) throw new Error(`missing doctor check ${id}`);
  return found;
}

/** Seeds one instance of every defect the doctor exists to catch. */
async function seedDefects(): Promise<{ modeScopedId: string; roleModeId: string }> {
  await store.rememberSage({
    text: 'Session digest for an old session that should have been garbage collected long ago.',
    kind: 'session_digest',
    scope: 'session',
    ownerSessionId: 'sess_old',
    persistence: 'short_lived',
    expiresAt: '2020-01-01T00:00:00.000Z',
  });
  const modeScoped = await store.rememberSage({
    text: 'Vitest mocks for constructor-based modules need a class-shaped factory to work.',
    kind: 'anti_pattern',
    audience: { modes: ['default'] },
  });
  const roleMode = await store.rememberSage({
    text: 'Reviewers must check the snapshot guard before approving shared worktree commits.',
    kind: 'convention',
    audience: { roles: ['reviewer'], modes: ['default'] },
  });
  await store.recordInjection([modeScoped.id], 'subagent_audience');
  addEdge(`mem:${modeScoped.id}`, 'mem:hub', 'same_topic');
  for (let i = 0; i < 80; i++) addEdge(`mem:noise${i}`, 'mem:hub', 'same_topic');
  addEdge(`mem:${roleMode.id}`, 'mem:ghost-memory-id', 'related_to');
  return { modeScopedId: modeScoped.id, roleModeId: roleMode.id };
}

describe('SAGE doctor', () => {
  it('reports a clean store as healthy', async () => {
    const report = await store.doctor();
    expect(
      report.checks.filter((check) => check.severity === 'warn' || check.severity === 'error'),
    ).toEqual([]);
    expect(checkOf(report, 'sqlite-integrity').severity).toBe('ok');
  });

  it('detects every seeded defect with a matching repair', async () => {
    await seedDefects();
    const report = await store.doctor();

    expect(checkOf(report, 'expired-active')).toMatchObject({
      severity: 'warn',
      count: 1,
      fix: 'hygiene',
    });
    expect(checkOf(report, 'graph-hubs')).toMatchObject({
      severity: 'warn',
      count: 1,
      fix: 'graph-hubs',
    });
    expect(checkOf(report, 'dangling-edges')).toMatchObject({
      severity: 'warn',
      fix: 'dangling-edges',
    });
    expect(checkOf(report, 'audience-runtime-mode')).toMatchObject({
      severity: 'warn',
      count: 2,
      fix: 'audience-runtime-mode',
    });
    expect(report.metrics.active).toBe(3);
  });

  it('repairs every defect without deleting a single memory, and is idempotent', async () => {
    const { modeScopedId, roleModeId } = await seedDefects();
    const repaired = await store.doctor({
      fix: ['hygiene', 'graph-hubs', 'dangling-edges', 'audience-runtime-mode', 'fts-rebuild'],
    });

    for (const id of ['expired-active', 'graph-hubs', 'dangling-edges', 'audience-runtime-mode']) {
      expect(checkOf(repaired, id).severity).toBe('ok');
    }
    expect(repaired.fixesApplied?.map((fix) => fix.fix)).toEqual([
      'hygiene',
      'graph-hubs',
      'dangling-edges',
      'audience-runtime-mode',
      'fts-rebuild',
    ]);
    // The expired digest is tombstoned (recoverable), not physically removed.
    const rows = db().prepare('SELECT COUNT(*) AS n FROM memories').get() as { n: number };
    expect(rows.n).toBe(3);

    // A mode-only audience is lifted entirely, so path injection sees it again;
    // a role audience keeps the role and drops only the runtime mode.
    expect((await store.getSage(modeScopedId))?.audience).toBeUndefined();
    // Counts earned only through subagent spawns are reset with the audience.
    expect((await store.getSage(modeScopedId))?.injectionCount ?? 0).toBe(0);
    expect((await store.getSage(roleModeId))?.audience).toEqual({ roles: ['reviewer'] });

    const again = await store.doctor({
      fix: ['graph-hubs', 'dangling-edges', 'audience-runtime-mode'],
    });
    expect(again.fixesApplied?.every((fix) => fix.changed === 0)).toBe(true);
  });

  it('measures injection precision over active memories', async () => {
    const memory = await store.rememberSage({
      text: 'The daemon is the sole SQLite writer for the SAGE store in production builds.',
      kind: 'fact',
    });
    await store.recordInjection([memory.id, memory.id, memory.id, memory.id], 'read');
    await store.recordUse([memory.id], 'assistant_reference');
    const report = await store.doctor();
    expect(report.metrics.injections).toBeGreaterThan(0);
    expect(report.metrics.precision).toBeCloseTo(report.metrics.uses / report.metrics.injections);
  });
});
