import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteSageStore } from '../src/sqlite-store.js';

/**
 * Hygiene evaluates a memory's own `validity` source checks: the anchor file
 * can still exist while the literal the claim depends on is gone. On the live
 * store 16 of 133 active memories with checks failed them and stayed active.
 * The existence pass must not revive such a memory on the next run, or every
 * scheduled pass flips it back and forth (a revision and an HQ change each).
 */

const FILE = 'src/config.ts';
const OPTS = {
  verify: true,
  verifyDepth: 'existence',
  retentionDays: 3650,
  archiveLowConfidenceAfterDays: 3650,
  archiveUnusedAfterDays: 3650,
  unusedMinInjections: 100,
} as const;

describe('hygiene and validity checks', () => {
  let tmpDir: string;
  let store: SqliteSageStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sage-validity-hygiene-'));
    await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, FILE), 'export const MAX_RETRIES = 5;\n');
    store = new SqliteSageStore({ projectRoot: tmpDir });
  });

  afterEach(async () => {
    store.close();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('demotes a failing claim, keeps it stale on later runs, and revives it when the text returns', async () => {
    const memory = await store.rememberSage({
      text: `Provider retries in ${FILE} default to 5 attempts (MAX_RETRIES).`,
      kind: 'fact',
      anchors: [{ type: 'file', path: FILE }],
      validity: {
        statement: 'While MAX_RETRIES is 5.',
        checks: [{ type: 'source_contains', path: FILE, text: 'MAX_RETRIES = 5' }],
      },
    });

    await store.hygiene(OPTS);
    expect((await store.getSage(memory.id))?.status).toBe('active');

    await fs.writeFile(path.join(tmpDir, FILE), 'export const MAX_RETRIES = 3;\n');
    await store.hygiene(OPTS);
    const demoted = await store.getSage(memory.id);
    expect(demoted?.status).toBe('stale');

    // The anchor file still exists: the existence pass must not revive it.
    await store.hygiene(OPTS);
    const again = await store.getSage(memory.id);
    expect(again?.status).toBe('stale');
    expect(again?.revision).toBe(demoted?.revision);

    await fs.writeFile(path.join(tmpDir, FILE), 'export const MAX_RETRIES = 5;\n');
    await store.hygiene(OPTS);
    expect((await store.getSage(memory.id))?.status).toBe('active');
  });

  it('leaves a memory whose source is unreadable as it is', async () => {
    const memory = await store.rememberSage({
      text: `Provider retries in ${FILE} are bounded by the gateway budget.`,
      kind: 'fact',
      anchors: [{ type: 'file', path: FILE }],
      validity: {
        statement: 'While the budget file exists.',
        checks: [{ type: 'source_contains', path: 'src/missing.ts', text: 'budget' }],
      },
    });
    await store.hygiene(OPTS);
    expect((await store.getSage(memory.id))?.status).toBe('active');
  });
});
