/**
 * The idle sweep runs on a timer, so it has no caller to receive an error.
 *
 * `startIdleSweep` fires `void this.sweepIdleRuntimes()` from a `setInterval`.
 * A sweep closes each reclaimable runtime through `closeRuntimeInternal`, which
 * ends in `emitChanged()` — a synchronous `EventEmitter.emit` into the main
 * process's `'changed'` listeners (WebUI view sync, menu rebuild, shell
 * broadcast). If one of those throws, the async close rejects, the `for` loop
 * stops, and with no `.catch()` the rejection is unhandled in the Electron main
 * process — once a minute, for as long as the condition holds. The idle
 * runtimes queued behind the failing one are never reclaimed either.
 *
 * These cases drive the real manager through its real interval (only the
 * interval timer is faked) and observe the process-level `unhandledRejection`
 * event.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopRuntimeManager } from '../src/main/runtime-manager.js';

const IDLE_TIMEOUT_MS = 1_000;
const SWEEP_INTERVAL_MS = 60_000;

function idleRuntime(id: string) {
  return {
    id,
    name: id,
    root: `/w/${id}`,
    slug: id,
    kind: 'project' as const,
    status: 'running',
    httpPort: 34560,
    wsPort: 34560,
    url: 'http://127.0.0.1:34560',
    startedAt: '2026-09-09T12:00:00.000Z',
    token: 'token',
    // No child process: termination is a no-op, so the only failure source is
    // the `'changed'` listener under test.
    child: null,
    logs: [],
    logNotifyTimer: null,
    lastActivityAt: Date.now() - 10 * IDLE_TIMEOUT_MS,
  };
}

function managerWith(ids: string[]): DesktopRuntimeManager {
  const manager = new DesktopRuntimeManager();
  const runtimes = (manager as unknown as { runtimes: Map<string, unknown> }).runtimes;
  for (const id of ids) runtimes.set(id, idleRuntime(id));
  return manager;
}

async function unhandledDuringSweep(manager: DesktopRuntimeManager): Promise<unknown[]> {
  const seen: unknown[] = [];
  const onUnhandled = (reason: unknown): void => {
    seen.push(reason);
  };
  process.on('unhandledRejection', onUnhandled);
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  try {
    manager.startIdleSweep({ idleTimeoutMs: IDLE_TIMEOUT_MS });
    vi.advanceTimersByTime(SWEEP_INTERVAL_MS);
    // Real setImmediate: drain the sweep's microtasks, then reach the
    // checkpoint where Node emits `unhandledRejection`.
    for (let turn = 0; turn < 3; turn++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  } finally {
    manager.stopIdleSweep();
    vi.useRealTimers();
    process.off('unhandledRejection', onUnhandled);
  }
  return seen;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DesktopRuntimeManager idle sweep failures', () => {
  it('does not leak a rejection when closing an idle runtime throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const manager = managerWith(['rt-a']);
    manager.on('changed', () => {
      throw new Error('menu rebuild failed');
    });
    const seen = await unhandledDuringSweep(manager);
    expect(seen).toEqual([]);
  });

  it('keeps reclaiming the remaining idle runtimes after one close fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const manager = managerWith(['rt-a', 'rt-b']);
    let calls = 0;
    manager.on('changed', () => {
      calls += 1;
      if (calls === 1) throw new Error('menu rebuild failed');
    });
    await unhandledDuringSweep(manager);
    expect(manager.snapshot().runtimes.map((runtime) => runtime.id)).toEqual([]);
  });

  it('reclaims idle runtimes when nothing fails (control)', async () => {
    const manager = managerWith(['rt-a', 'rt-b']);
    const seen = await unhandledDuringSweep(manager);
    expect(seen).toEqual([]);
    expect(manager.snapshot().runtimes).toEqual([]);
  });
});
