import { expect, it, vi } from 'vitest';
import { handleStart, handleStop } from '../src/server/goal-ws-run-controls.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
for (const rejects of [false, true]) {
  it(`keeps setup ownership until ${rejects ? 'failed' : 'successful'} canceled setup settles`, async () => {
    const entered = deferred();
    const release = deferred();
    const leaseRelease = vi.fn(async () => {});
    const host: any = {
      startInFlight: false,
      runStatus: 'idle',
      orchestrator: null,
      runPromise: null,
      setupPromise: null,
      stopping: false,
      graph: null,
      store: { acquireRunLease: async () => leaseRelease },
      startRun: async () => {
        entered.resolve();
        await release.promise;
        if (rejects) throw new Error('setup canceled');
      },
      releaseActiveRunLease: async () => {
        const owner = host.releaseRunLease;
        host.releaseRunLease = null;
        await owner?.();
      },
      broadcast: vi.fn(),
      stopBroadcast: vi.fn(),
      persistence: { save: vi.fn() },
    };
    const start = handleStart(host);
    host.setupPromise = start;
    await entered.promise;
    const stop = handleStop(host);
    await Promise.resolve();
    await Promise.resolve();
    expect(leaseRelease).not.toHaveBeenCalled();
    release.resolve();
    await Promise.all([start, stop]);
    expect(leaseRelease).toHaveBeenCalledTimes(1);
  });
}
