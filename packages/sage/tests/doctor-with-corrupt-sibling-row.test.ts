/**
 * Corrupt-row tolerance for the SAGE doctor — the fifth path of the package
 * convention ("one corrupt row must not hide/abort the operation"), found by
 * the proof-driven hunt on 2026-10-19. `measureMetrics` ran bare
 * `json_extract(data, ...)` aggregates and the `audience-runtime-mode` repair
 * decoded rows with the strict `readSqliteSageRow`, so ONE malformed
 * `memories.data` row aborted the entire health report and every named repair.
 * Fix: `json_valid(data)` guards at every measurement site (mirroring
 * initialize.ts's backfill) and catch-and-skip in the repair loop, with the
 * skip counted in the audit and the reported detail.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteSageStore } from '../src/sqlite-store.js';

let directory: string;
let store: SqliteSageStore;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-sage-doctorcorrupt-'));
  store = new SqliteSageStore({ projectRoot: directory });
  await store.initialize();
});

afterEach(async () => {
  store.close();
  await fs.rm(directory, { recursive: true, force: true });
});

/** Same corruption technique as the codec/delete sibling regression tests. */
function corrupt(id: string, payload: string): void {
  const db = (store as unknown as { db: DatabaseSync }).db;
  db.exec('DROP TRIGGER IF EXISTS memories_au');
  db.prepare('UPDATE memories SET data = ? WHERE id = ?').run(payload, id);
}

async function rememberAudience(text: string): Promise<string> {
  const memory = await store.rememberSage({
    text,
    kind: 'fact',
    audience: { modes: ['default'] },
  });
  return memory.id;
}

describe('doctor with a corrupt sibling row', () => {
  it('control: a store without corrupt rows reports and repairs normally', async () => {
    await store.rememberSage({ text: 'Deploys run from the main branch only', kind: 'fact' });
    const report = await store.doctor();
    expect(report.checks.length).toBeGreaterThan(0);
    expect(report.metrics.total).toBe(1);
  });

  it('health report survives a malformed-JSON data column', async () => {
    const bad = await store.rememberSage({ text: 'Healthy memory', kind: 'fact' });
    await store.rememberSage({ text: 'Another healthy memory', kind: 'fact' });
    corrupt(bad.id, '{broken');

    const report = await store.doctor();
    // The row stays counted by its (intact) status column but contributes no
    // counters — measurement skips it instead of raising "malformed JSON".
    expect(report.checks.length).toBeGreaterThan(0);
    expect(report.metrics.total).toBe(2);
    expect(report.metrics.active).toBe(2);
  });

  it('audience repair lifts healthy rows and skips unreadable siblings', async () => {
    const good = await rememberAudience(
      'Vitest mocks for constructor modules need a class-shaped factory',
    );
    const bad = await rememberAudience('Reviewers must check the snapshot guard first');
    // Valid JSON, wrong shape: the scan finds it via its intact audience
    // column, and only the repair loop's decode can fail.
    corrupt(bad, '{"x":1}');

    const report = await store.doctor({ fix: ['audience-runtime-mode'] });
    const applied = report.fixesApplied?.find((fix) => fix.fix === 'audience-runtime-mode');
    expect(applied?.changed).toBe(1);
    expect(applied?.detail).toContain('skipped 1 unreadable');
    const lifted = await store.getSage(good);
    expect(lifted?.audience?.modes ?? []).not.toContain('default');
    // The unreadable row is left untouched (no partial audience rewrite).
    expect(await store.getSage(bad)).toBeNull();
  });

  it('a fully unreadable audience set still completes the repair mutation', async () => {
    const onlyBad = await rememberAudience('This row will be corrupted below');
    corrupt(onlyBad, '{"x":1}');

    const report = await store.doctor({ fix: ['audience-runtime-mode'] });
    const applied = report.fixesApplied?.find((fix) => fix.fix === 'audience-runtime-mode');
    expect(applied?.changed).toBe(0);
    expect(applied?.detail).toContain('skipped 1 unreadable');
  });
});
