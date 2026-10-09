import * as realFs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Instances register once, at startup, and a shell and its session children
 * start together. The first registry read waits one macrotask turn while the
 * other registration is in flight, so an unguarded read-modify-write reads the
 * same list twice and the later write drops an instance for good.
 */
const gate = vi.hoisted(() => ({ target: '', reads: 0, inFlight: 0 }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: async (...args: unknown[]) => {
      if (gate.target && path.resolve(String(args[0])) === gate.target) {
        gate.reads++;
        if (gate.reads === 1 && gate.inFlight > 1) {
          await new Promise((resolve) => setImmediate(resolve));
        }
      }
      return (actual.readFile as (...a: unknown[]) => Promise<unknown>)(...args);
    },
  };
});

const { registerInstance, registryPath } = await import('../src/server/instance-registry.js');

let tmp = '';
afterEach(async () => {
  gate.target = '';
  if (tmp) await realFs.rm(tmp, { recursive: true, force: true });
});

const record = (pid: number, httpPort: number) => ({
  pid,
  surface: 'webui',
  httpPort,
  host: '127.0.0.1',
  projectRoot: `/p/${httpPort}`,
  projectName: String(httpPort),
  startedAt: '2026-10-09T00:00:00.000Z',
  url: `http://127.0.0.1:${httpPort}`,
});

describe('instance-registry — instances starting together', () => {
  it('records both of two overlapping registrations', async () => {
    tmp = await realFs.mkdtemp(path.join(os.tmpdir(), 'instance-registry-race-'));
    gate.target = path.resolve(registryPath(tmp));
    gate.reads = 0;
    gate.inFlight = 2;

    // Live pids: this process and its parent.
    await Promise.all([
      registerInstance(record(process.pid, 4001), tmp),
      registerInstance(record(process.ppid, 4002), tmp),
    ]);

    const ports = JSON.parse(await realFs.readFile(registryPath(tmp), 'utf8'))
      .instances.map((i: { httpPort: number }) => i.httpPort)
      .sort();
    expect(ports).toEqual([4001, 4002]);
  });
});
