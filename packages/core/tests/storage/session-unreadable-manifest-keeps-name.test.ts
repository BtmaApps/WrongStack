import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A rename lives only in the `.summary.json` manifest and the catalog row; the
 * writer never sees it. At close the summary tracker re-reads the manifest for
 * the name and the close writes the final summary over both. When the manifest
 * was momentarily unreadable (EBUSY/EPERM from an AV scanner right after the
 * last checkpoint's atomic write), that read used to collapse to "no name" and
 * the close erased the rename for good. The close now leaves both untouched;
 * the counters it would have written are rebuildable from the transcript.
 * A move read the name the same way, then deleted the manifest and re-indexed
 * the session without it; it now refuses before touching anything. The idle
 * archive took a busy manifest for a missing one and wrote a nameless header
 * over it; it now skips that session until the next pass. A listing rebuilt the
 * summary from the journal over a busy manifest and cached the nameless row in
 * the shard manifest; it now lists the header for that call only.
 */

const gate = vi.hoisted(() => ({
  failCode: null as string | null,
  reads: Number.POSITIVE_INFINITY,
}));

vi.mock('node:fs/promises', async () => {
  const real = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...real,
    readFile: (async (file: Parameters<typeof real.readFile>[0], ...rest: unknown[]) => {
      if (gate.failCode && gate.reads > 0 && String(file).endsWith('.summary.json')) {
        gate.reads--;
        throw Object.assign(new Error(`${gate.failCode}: injected`), { code: gate.failCode });
      }
      return (real.readFile as (...a: unknown[]) => Promise<unknown>)(file, ...rest);
    }) as typeof real.readFile,
  };
});

import { DefaultSessionStore } from '../../src/storage/session-store.js';

const NAME = 'Release notes work';
let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-close-name-'));
});

afterEach(async () => {
  gate.failCode = null;
  gate.reads = Number.POSITIVE_INFINITY;
  await fs.rm(dir, { recursive: true, force: true });
});

async function manifestPathOf(): Promise<string> {
  const files = (await fs.readdir(dir, { recursive: true })).map(String);
  const transcript = files.find((f) => f.endsWith('.jsonl') && !f.endsWith('_index.jsonl'));
  if (!transcript) throw new Error('no transcript file');
  return path.join(dir, transcript.replace(/\.jsonl$/, '.summary.json'));
}

async function renameThenClose(opts: { failCode: string | null; resume?: boolean }) {
  const store = new DefaultSessionStore({ dir });
  let writer = await store.create({ id: '', title: '', model: 'm', provider: 'p' } as never);
  const id = writer.id;
  await writer.append({
    type: 'user_input',
    ts: new Date().toISOString(),
    content: 'hello',
  } as never);
  if (opts.resume) {
    await writer.close();
    writer = (await store.resume(id)).writer;
  }
  const manifestPath = await manifestPathOf();
  // No checkpoint may have landed yet; a rename then creates the manifest.
  const current = JSON.parse(
    await fs.readFile(manifestPath, 'utf8').catch(() => JSON.stringify({ id })),
  ) as Record<string, unknown>;
  await fs.writeFile(manifestPath, JSON.stringify({ ...current, name: NAME, messageCount: 0 }));

  gate.failCode = opts.failCode;
  try {
    await writer.close();
  } finally {
    gate.failCode = null;
  }
  const after = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {
    name?: string;
    messageCount?: number;
  };
  const listed = (await store.list()).find((s) => s.id === id);
  return { after, listedName: listed?.name };
}

describe('session close with an unreadable manifest', () => {
  it.each(['EBUSY', 'EPERM', 'EIO'])('keeps the rename on %s', async (code) => {
    const { after, listedName } = await renameThenClose({ failCode: code });
    expect(after.name).toBe(NAME);
    expect(listedName).toBe(NAME);
  });

  it('keeps the rename on a resumed writer', async () => {
    const { after, listedName } = await renameThenClose({ failCode: 'EBUSY', resume: true });
    expect(after.name).toBe(NAME);
    expect(listedName).toBe(NAME);
  });

  it('still writes the final summary when the manifest is readable', async () => {
    const { after, listedName } = await renameThenClose({ failCode: null });
    expect(after.name).toBe(NAME);
    expect(after.messageCount).toBeGreaterThanOrEqual(1);
    expect(listedName).toBe(NAME);
  });
});

describe('session move with an unreadable manifest', () => {
  async function renameThenMove(failCode: string | null) {
    const checkout = await fs.mkdtemp(path.join(os.tmpdir(), 'session-move-name-'));
    try {
      const store = new DefaultSessionStore({ dir });
      const writer = await store.create({ id: '', title: '', model: 'm', provider: 'p' } as never);
      await writer.append({
        type: 'user_input',
        ts: new Date().toISOString(),
        content: 'hello',
      } as never);
      await writer.close();
      await store.rename(writer.id, NAME);

      gate.failCode = failCode;
      const moved = store.move(writer.id, { store, checkout }).finally(() => {
        gate.failCode = null;
      });
      const settled = await moved.then(
        () => null,
        (err: unknown) => err as Error,
      );
      const listed = (await store.list()).find((s) => s.id === writer.id);
      return { error: settled, listedName: listed?.name };
    } finally {
      await fs.rm(checkout, { recursive: true, force: true });
    }
  }

  it('refuses the move and keeps the rename', async () => {
    const { error, listedName } = await renameThenMove('EBUSY');
    expect(error?.message).toMatch(/EBUSY/);
    expect(listedName).toBe(NAME);
  });

  it('moves and keeps the rename when the manifest is readable', async () => {
    const { error, listedName } = await renameThenMove(null);
    expect(error).toBeNull();
    expect(listedName).toBe(NAME);
  });
});

describe('idle archive with a transiently unreadable manifest', () => {
  const POLICY = { hotKeepSessions: 0, archiveAfterDays: 0 } as never;

  it('skips the session, then archives it with the rename on the next pass', async () => {
    const store = new DefaultSessionStore({ dir });
    const writer = await store.create({ id: '', title: '', model: 'm', provider: 'p' } as never);
    await writer.append({
      type: 'user_input',
      ts: new Date().toISOString(),
      content: 'hello',
    } as never);
    await writer.close();
    await store.rename(writer.id, NAME);

    gate.failCode = 'EBUSY';
    gate.reads = 1;
    const first = await store.archiveIdle(POLICY);
    gate.failCode = null;
    const busy = (await store.list()).find((s) => s.id === writer.id);
    expect(first.archived).toBe(0);
    expect(busy?.name).toBe(NAME);
    expect(busy?.storageState).not.toBe('cold');

    const second = await store.archiveIdle(POLICY);
    const archived = (await store.list()).find((s) => s.id === writer.id);
    expect(second.archived).toBe(1);
    expect(archived?.name).toBe(NAME);
    expect(archived?.storageState).toBe('cold');
  });
});

describe('listing with an unreadable manifest', () => {
  it('neither rebuilds over the manifest nor caches the nameless row', async () => {
    const store = new DefaultSessionStore({ dir });
    const writer = await store.create({ id: '', title: '', model: 'm', provider: 'p' } as never);
    await writer.append({
      type: 'user_input',
      ts: new Date().toISOString(),
      content: 'hello',
    } as never);
    await writer.close();
    await store.rename(writer.id, NAME);

    gate.failCode = 'EBUSY';
    const during = await store.list();
    gate.failCode = null;
    expect(during.some((s) => s.id === writer.id)).toBe(true);

    const manifest = JSON.parse(await fs.readFile(await manifestPathOf(), 'utf8')) as {
      name?: string;
    };
    expect(manifest.name).toBe(NAME);
    const later = (await new DefaultSessionStore({ dir }).list()).find((s) => s.id === writer.id);
    expect(later?.name).toBe(NAME);
  });

  it('an explicit archive refuses instead of rebuilding the summary over it', async () => {
    const store = new DefaultSessionStore({ dir });
    const writer = await store.create({ id: '', title: '', model: 'm', provider: 'p' } as never);
    await writer.append({
      type: 'user_input',
      ts: new Date().toISOString(),
      content: 'hello',
    } as never);
    await writer.close();
    await store.rename(writer.id, NAME);

    gate.failCode = 'EBUSY';
    const archived = await store.archive(writer.id).then(
      () => null,
      (err: unknown) => err as Error,
    );
    gate.failCode = null;
    expect(archived?.message).toMatch(/EBUSY/);
    const later = (await new DefaultSessionStore({ dir }).list()).find((s) => s.id === writer.id);
    expect(later?.name).toBe(NAME);
  });
});
