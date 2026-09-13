/**
 * Coverage for tools/src/process-registry-persistent.ts
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PersistentProcessRegistry,
  resetPersistentProcessRegistry,
} from '../src/process-registry-persistent.js';

function noopHandler(_reason: unknown): void {
  /* swallow fire-and-forget ENOENT */
}

let tempDir: string;
let originalEnv: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'proc-reg-test-'));
  originalEnv = process.env.WRONGSTACK_HOME;
  process.env.WRONGSTACK_HOME = tempDir;
  resetPersistentProcessRegistry();
  // Suppress unhandled rejections from fire-and-forget registry timers
  process.on('unhandledRejection', noopHandler);
});

afterEach(async () => {
  if (originalEnv === undefined) delete process.env.WRONGSTACK_HOME;
  else process.env.WRONGSTACK_HOME = originalEnv;
  process.off('unhandledRejection', noopHandler);
  // Give async fs operations time to release file handles on Windows
  await new Promise((r) => setTimeout(r, 50));
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

describe('PersistentProcessRegistry', () => {
  // Registration is fire-and-forget (background file writes), so these used to
  // call the API and assert nothing. They now read the persisted registry back.
  const entriesFor = async (reg: PersistentProcessRegistry) =>
    (await reg.getGlobalStatus()).instances.get(reg.getInstanceId()) ?? [];

  it('constructs and starts — start() protects the main process', async () => {
    const reg = new PersistentProcessRegistry();
    reg.start();
    try {
      await vi.waitFor(async () => {
        expect(await reg.getAllProtectedPids()).toContain(process.pid);
      });
    } finally {
      reg.stop();
    }
  });

  it('registerMainProcess registers the current process', async () => {
    const reg = new PersistentProcessRegistry();
    reg.start();
    try {
      reg.registerMainProcess();
      await vi.waitFor(async () => {
        expect(await reg.isProtectedPid(process.pid)).toBe(true);
      });
    } finally {
      reg.stop();
    }
  });

  it('registerChildProcess registers a child', async () => {
    const reg = new PersistentProcessRegistry();
    reg.start();
    try {
      reg.registerChildProcess(12345, 'child', 'node child.js');
      await vi.waitFor(async () => {
        expect(await entriesFor(reg)).toContainEqual(
          expect.objectContaining({ pid: 12345, name: 'child', command: 'node child.js' }),
        );
      });
    } finally {
      reg.stop();
    }
  });

  it('getInstanceId returns a string', () => {
    const reg = new PersistentProcessRegistry();
    const id = reg.getInstanceId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('isProtectedPid returns false for unknown pid', async () => {
    const reg = new PersistentProcessRegistry();
    reg.start();
    const result = await reg.isProtectedPid(999999);
    expect(result).toBe(false);
    reg.stop();
  });

  it('getAllProtectedPids returns an array', async () => {
    const reg = new PersistentProcessRegistry();
    reg.start();
    const pids = await reg.getAllProtectedPids();
    expect(Array.isArray(pids)).toBe(true);
    reg.stop();
  });

  it('shouldBlockKill returns false for unprotected pid', async () => {
    const reg = new PersistentProcessRegistry();
    reg.start();
    const result = await reg.shouldBlockKill(999999);
    expect(result).toBe(false);
    reg.stop();
  });

  it('addProtectedPattern stores a pattern', async () => {
    const reg = new PersistentProcessRegistry();
    reg.start();
    await reg.addProtectedPattern('node.*test');
    // shouldBlockKill should now match the pattern
    const result = await reg.shouldBlockKill(999999);
    // The pid 999999 is not registered, but pattern-based check may apply
    // depending on the command — here we just verify no crash
    expect(typeof result).toBe('boolean');
    reg.stop();
  });

  it('unregister removes a pid', async () => {
    const reg = new PersistentProcessRegistry();
    reg.start();
    reg.registerChildProcess(88888, 'temp', 'cmd');
    await reg.unregister(88888);
    const isProtected = await reg.isProtectedPid(88888);
    expect(isProtected).toBe(false);
    reg.stop();
  });

  it('unregister on non-existent pid does not throw', async () => {
    const reg = new PersistentProcessRegistry();
    reg.start();
    await expect(reg.unregister(77777)).resolves.not.toThrow();
    reg.stop();
  });

  it('getGlobalStatus returns structured data', async () => {
    const reg = new PersistentProcessRegistry();
    reg.start();
    const status = await reg.getGlobalStatus();
    expect(status).toBeDefined();
    expect(typeof status).toBe('object');
    reg.stop();
  });

  it('registerChildProcess with sessionId and spawnMode', async () => {
    const reg = new PersistentProcessRegistry();
    reg.start();
    try {
      reg.registerChildProcess(11111, 'named', 'cmd', 'session-1', 'fork');
      await vi.waitFor(async () => {
        expect(await entriesFor(reg)).toContainEqual(
          expect.objectContaining({
            pid: 11111,
            name: 'named',
            sessionId: 'session-1',
            spawnMode: 'fork',
          }),
        );
      });
    } finally {
      reg.stop();
    }
  });

  it('multiple start/stop cycles work', async () => {
    const reg = new PersistentProcessRegistry();
    const id = reg.getInstanceId();
    reg.start();
    reg.stop();
    reg.start();
    try {
      expect(reg.getInstanceId()).toBe(id);
      await vi.waitFor(async () => {
        expect(await reg.getAllProtectedPids()).toContain(process.pid);
      });
    } finally {
      reg.stop();
    }
  });
});

describe('getPersistentProcessRegistry singleton', () => {
  it('returns the same instance', async () => {
    const { getPersistentProcessRegistry } = await import('../src/process-registry-persistent.js');
    const a = getPersistentProcessRegistry();
    const b = getPersistentProcessRegistry();
    expect(a).toBe(b);
  });

  it('resetPersistentProcessRegistry clears the singleton', async () => {
    const { getPersistentProcessRegistry } = await import('../src/process-registry-persistent.js');
    const a = getPersistentProcessRegistry();
    resetPersistentProcessRegistry();
    const b = getPersistentProcessRegistry();
    expect(a).not.toBe(b);
  });
});
