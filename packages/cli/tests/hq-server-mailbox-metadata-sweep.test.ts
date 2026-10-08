/**
 * On start the HQ server removes `.mailbox-server.json` of projects whose
 * owner pid is dead. EPERM from `process.kill(pid, 0)` means the process
 * exists but this user may not signal it (an elevated or other-user server):
 * a bare catch read that as dead and deleted a live server's metadata.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type HqServerHandle, startHqServer } from '../src/hq-server.js';

const EPERM_PID = 3_999_001;
const DEAD_PID = 3_999_002;

let handle: HqServerHandle | null = null;
let tempRoot = '';

afterEach(async () => {
  vi.restoreAllMocks();
  if (handle) {
    await handle.close();
    handle = null;
  }
  await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
});

async function seed(slug: string, pid: number): Promise<string> {
  const dir = path.join(tempRoot, 'projects', slug);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, '.mailbox-server.json');
  await fs.writeFile(file, JSON.stringify({ pid }));
  return file;
}

const exists = (file: string) =>
  fs.access(file).then(
    () => true,
    () => false,
  );

describe('HQ start mailbox metadata sweep', () => {
  it('keeps the metadata of an owner it may not signal (EPERM)', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hq-sweep-'));
    const dataDir = path.join(tempRoot, 'hq');
    await fs.mkdir(dataDir, { recursive: true });
    const epermFile = await seed('eperm-owner', EPERM_PID);
    const deadFile = await seed('dead-owner', DEAD_PID);
    const realKill = process.kill.bind(process);
    vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal?: string | number) => {
      if (pid === EPERM_PID) throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' });
      if (pid === DEAD_PID) throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' });
      return realKill(pid, signal);
    }) as typeof process.kill);

    handle = await startHqServer({ host: '127.0.0.1', port: 0, dataDir });
    // Both projects are swept in one Promise.all; the dead one going away
    // marks that the sweep ran.
    await vi.waitFor(async () => expect(await exists(deadFile)).toBe(false), { timeout: 10_000 });
    expect(await exists(epermFile)).toBe(true);
  });
});
