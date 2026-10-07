// Regression (round 2026-10-07): `listSagePage` must not silently swap a
// status filter that matches nothing for the DEFAULT view.
//
// Contract: `normalizeListStatuses` (shared/pagination.ts) documents that an
// explicitly-provided `statuses` array whose members are all unknown returns
// EMPTY — "return empty so the caller notices the mismatch". The WS boundary
// (webui-server memory-handlers.ts) forwards arbitrary client strings, and its
// own fallback emulation returns an empty page for this input, so the native
// store path must agree. Before the fix, an all-unknown filter fell back to
// DEFAULT_PAGE_STATUSES and returned live memories (e.g. a mistyped
// `['deleted']` tab request rendered the default page instead).
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { normalizeListStatuses } from '../src/shared/pagination.js';
import { SqliteSageStore } from '../src/sqlite-store.js';
import type { SageStatus } from '../src/types.js';

// The SageStatus union is compile-time-only: WS clients send arbitrary
// strings and the server forwards them, so unknown names reach the store.
const UNKNOWN = 'totally-bogus-status' as SageStatus;

let tempDir: string;
let store: SqliteSageStore;
const activeStores: SqliteSageStore[] = [];

function trackStore(s: SqliteSageStore): SqliteSageStore {
  activeStores.push(s);
  return s;
}

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sage-list-page-status-'));
  store = trackStore(new SqliteSageStore({ projectRoot: tempDir }));
  await store.rememberSage({
    text: 'status-resolution probe active alpha',
    kind: 'fact',
    importance: 0.8,
    confidence: 0.9,
  });
  const victim = await store.rememberSage({
    text: 'status-resolution probe deleted omega',
    kind: 'fact',
    importance: 0.8,
    confidence: 0.9,
  });
  await store.updateSage(victim.id, { status: 'deleted', deleteAuthorized: true });
});

afterEach(async () => {
  for (const s of activeStores.splice(0)) {
    try {
      s.close();
    } catch {
      // best-effort teardown
    }
  }
  // Windows WAL handle release tick (repo test convention).
  await new Promise((r) => setTimeout(r, 10));
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('listSagePage status filter resolution', () => {
  it('absent statuses use the default view (deleted hidden, active shown)', async () => {
    const page = await store.listSagePage({});
    expect(page.total).toBe(1);
    expect(page.memories.map((m) => m.status)).toEqual(['active']);
  });

  it('a valid subset is honored', async () => {
    const page = await store.listSagePage({ statuses: ['active'] });
    expect(page.total).toBe(1);
    expect(page.memories.every((m) => m.status === 'active')).toBe(true);
  });

  it('an explicitly empty statuses array returns an empty page', async () => {
    const page = await store.listSagePage({ statuses: [] });
    expect(page.total).toBe(0);
    expect(page.memories).toEqual([]);
  });

  it('the canonical helper maps unknown statuses to an empty set', () => {
    expect([...normalizeListStatuses([UNKNOWN])]).toEqual([]);
  });

  it('returns an empty page when every requested status is unknown (no silent default)', async () => {
    const page = await store.listSagePage({ statuses: [UNKNOWN] });
    expect(page.total).toBe(0);
    expect(page.memories).toEqual([]);
  });
});
