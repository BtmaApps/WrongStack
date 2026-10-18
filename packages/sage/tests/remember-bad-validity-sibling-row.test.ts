/**
 * A stored row that DECODES cleanly but carries a validity violating today's
 * rules must not fail unrelated writes.
 *
 * The corrupt-row family (rounds 1-11) covered only unparseable JSON
 * (`data = '{broken'`). `validateMemoryShape` checks the required fields and
 * the stamps and deliberately does not inspect optional fields, so a row with
 * valid JSON and all required fields but an older/invalid `validity` — an
 * absolute check path an earlier schema accepted, or a hand-edit — decodes
 * fine. `rememberSqliteSage` then passed `decoded.validity` to `validityKey`,
 * which delegated to the strict `normalizeValidity` and THREW. That throw sat
 * outside the loop's decode-guard `catch`, so one such row failed every
 * subsequent `rememberSage`, which is exactly what that loop exists to prevent:
 * "a corrupt row can still match here and must not fail a write."
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validityKey } from '../src/shared/memory-validity.js';
import { SqliteSageStore } from '../src/sqlite-store.js';

let directory: string;
let store: SqliteSageStore;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-sage-badvalidity-'));
  store = new SqliteSageStore({ projectRoot: directory });
  await store.initialize();
});

afterEach(async () => {
  store.close();
  await fs.rm(directory, { recursive: true, force: true });
});

/**
 * Rewrite a stored row so it stays valid JSON with every required field, but
 * carries a validity whose check paths are absolute — rejected by today's
 * `normalizeValidity`.
 */
function poisonValidity(id: string): void {
  const db = (store as unknown as { db: DatabaseSync }).db;
  const row = db.prepare('SELECT data FROM memories WHERE id = ?').get(id) as { data: string };
  const record = JSON.parse(row.data) as Record<string, unknown>;
  record.validity = {
    statement: 'holds only on POSIX',
    checks: [
      { type: 'source_contains', path: '/etc/passwd', text: 'root' },
      { type: 'source_contains', path: 'C:\\Windows\\win.ini', text: '[fonts]' },
    ],
  };
  db.prepare('UPDATE memories SET data = ? WHERE id = ?').run(JSON.stringify(record), id);
}

const TEXT = 'Deploys run from the main branch only';

describe('rememberSage with a row whose stored validity violates current rules', () => {
  it('writes an unrelated memory instead of throwing', async () => {
    const first = await store.rememberSage({ text: TEXT, kind: 'fact' });
    poisonValidity(first.id);

    const other = await store.rememberSage({
      text: 'Rollback uses the previously published tag.',
      kind: 'fact',
    });
    expect((await store.getSage(other.id))?.status).toBe('active');
  });

  it('still re-remembers the same text without throwing', async () => {
    const first = await store.rememberSage({ text: TEXT, kind: 'fact' });
    poisonValidity(first.id);

    // The poisoned row cannot be a dedupe match (its validity is unusable),
    // so this stores a fresh row rather than merging — but it must not throw.
    await expect(store.rememberSage({ text: TEXT, kind: 'fact' })).resolves.toBeDefined();
  });

  it('keeps writing after the poisoned row is encountered', async () => {
    const first = await store.rememberSage({ text: TEXT, kind: 'fact' });
    poisonValidity(first.id);

    await store.rememberSage({ text: 'Nightly builds publish provenance.', kind: 'fact' });
    await expect(
      store.rememberSage({ text: 'Rollbacks restore the prior tag.', kind: 'fact' }),
    ).resolves.toBeDefined();
  });
});

describe('validityKey is a total function', () => {
  it('returns a key for a validity the normalizer rejects', () => {
    const key = validityKey({
      statement: 'holds only on POSIX',
      checks: [{ type: 'source_contains', path: '/etc/passwd', text: 'root' }],
    } as never);
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('never lets an unusable validity collide with a usable one', () => {
    const bad = validityKey({
      statement: 'applies on POSIX',
      checks: [{ type: 'source_contains', path: '/etc/passwd', text: 'root' }],
    } as never);
    const good = validityKey({ statement: 'applies on POSIX' } as never);
    expect(bad).not.toBe(good);
  });

  it('still normalizes well-formed validity (control)', () => {
    expect(validityKey({ statement: '  applies on POSIX  ', checks: [] } as never)).toBe(
      JSON.stringify({ statement: 'applies on POSIX' }),
    );
    expect(validityKey(undefined)).toBe('null');
    expect(validityKey({ statement: 'applies on POSIX' } as never)).toBe(
      validityKey({ statement: 'applies on POSIX', checks: [] } as never),
    );
  });
});
