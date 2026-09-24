import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteMemoryPort } from '../src/memory-port.js';

let dir: string | undefined;
let store: SqliteMemoryPort | undefined;

afterEach(async () => {
  try {
    await store?.dispose?.();
  } catch {
    // Best effort; test assertions are the result signal.
  }
  if (dir) await fs.rm(dir, { recursive: true, force: true });
  dir = undefined;
  store = undefined;
});

describe('hygiene exact-dedup listing/mutation gap', () => {
  it('does not merge or revert a memory updated after the duplicate snapshot', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sage-exact-dedup-toctou-'));
    const currentStore = new SqliteMemoryPort({ projectRoot: dir });
    store = currentStore;

    const changed = await currentStore.rememberSage({ text: 'Shared fact before the update.' });
    const changedPeer = await currentStore.rememberSage({
      text: 'A distinct seed for the changed pair.',
    });
    const control = await currentStore.rememberSage({ text: 'Unaffected duplicate fact.' });
    const controlPeer = await currentStore.rememberSage({
      text: 'A distinct seed for the control pair.',
    });
    await currentStore.updateSage(changedPeer.id, { text: 'Shared fact before the update.' });
    await currentStore.updateSage(controlPeer.id, { text: 'Unaffected duplicate fact.' });

    const realList = currentStore.listMemories.bind(currentStore);
    let activeListCalls = 0;
    let gapFired = false;
    (currentStore as unknown as { listMemories: typeof currentStore.listMemories }).listMemories =
      async (opts) => {
        const rows = await realList(opts);
        if (opts?.status === 'active') {
          activeListCalls += 1;
          if (activeListCalls === 2) {
            await currentStore.updateSage(changed.id, {
              text: 'Concurrent update made this fact unique.',
              importance: 0.8,
            });
            gapFired = true;
          }
        }
        return rows;
      };

    const report = await currentStore.hygiene({ verify: false, nearDedup: false });
    const changedAfter = await currentStore.getSage(changed.id);
    const controlStatuses = await Promise.all(
      [control.id, controlPeer.id].map(async (id) => (await currentStore.getSage(id))?.status),
    );

    expect(gapFired).toBe(true);
    expect(report.deduplicated).toBe(1);
    expect(changedAfter?.status).toBe('active');
    expect(changedAfter?.text).toBe('Concurrent update made this fact unique.');
    expect(changedAfter?.importance).toBe(0.8);
    expect(controlStatuses.filter((status) => status === 'superseded')).toHaveLength(1);
  });
});
