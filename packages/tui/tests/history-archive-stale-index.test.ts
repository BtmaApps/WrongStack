import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HistoryArchive } from '../src/history-archive.js';
import type { HistoryEntry } from '../src/history-entry.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

const entry = (n: number): HistoryEntry => ({ id: n, kind: 'user', text: `m${n}` }) as HistoryEntry;

/** Hold the index scan's first file read on a latch so an append can land mid-scan. */
function gateFirstRead(archive: HistoryArchive) {
  let release: () => void = () => undefined;
  const latch = new Promise<void>((resolve) => {
    release = resolve;
  });
  let signalHit: () => void = () => undefined;
  const hit = new Promise<void>((resolve) => {
    signalHit = resolve;
  });
  const internals = archive as unknown as { ensureOpen: () => Promise<fs.FileHandle> };
  const realEnsureOpen = internals.ensureOpen.bind(archive);
  let first = true;
  internals.ensureOpen = async () => {
    const handle = await realEnsureOpen();
    return new Proxy(handle, {
      get(target, prop) {
        if (prop === 'read') {
          return async (...args: unknown[]) => {
            if (first) {
              first = false;
              signalHit();
              await latch;
            }
            return (target.read as (...a: unknown[]) => Promise<unknown>)(...args);
          };
        }
        const value = (target as unknown as Record<string | symbol, unknown>)[prop];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  };
  return { release, hit };
}

describe('HistoryArchive index invalidation', () => {
  it('does not cache a scan that an append outran', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-archive-stale-'));
    directories.push(dir);
    const archive = new HistoryArchive(dir);
    for (let i = 0; i < 3; i++) archive.append(entry(i));

    const gate = gateFirstRead(archive);
    const firstLoad = archive.loadRange(0, 10);
    await gate.hit;
    archive.append(entry(3)); // lands while the scan is held
    await (archive as unknown as { writeChain: Promise<void> }).writeChain;
    gate.release();

    expect(await firstLoad).toHaveLength(4);
    expect(await archive.loadRange(0, 10)).toHaveLength(4);
    expect(archive.archivedCount).toBe(4);
    await archive.close();
  });

  it('control: without a concurrent append the scan is cached and append still invalidates it', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-archive-stale-'));
    directories.push(dir);
    const archive = new HistoryArchive(dir);
    for (let i = 0; i < 2; i++) archive.append(entry(i));
    expect(await archive.loadRange(0, 10)).toHaveLength(2);
    archive.append(entry(2));
    expect(await archive.loadRange(0, 10)).toHaveLength(3);
    await archive.close();
  });
});
