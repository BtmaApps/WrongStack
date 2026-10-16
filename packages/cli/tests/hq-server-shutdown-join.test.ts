import { describe, expect, it, vi } from 'vitest';
import { createHqServerShutdown } from '../src/hq-server/server-lifecycle.js';

describe('HQ shutdown completion', () => {
  it.each([false, true])(
    'joins HTTP close and all persistence drains (failure=%s)',
    async (failure) => {
      let closeHttp!: () => void;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const drain = vi.fn(async () => {
        await gate;
        if (failure) throw new Error('disk failure');
      });
      const closeSockets = vi.fn();
      const shutdown = createHqServerShutdown({
        cleanupTimer: undefined,
        browserHeartbeatTimer: undefined,
        timeseriesFlushTimer: undefined,
        sessionCleanupTimer: undefined,
        stopAlertEngine() {},
        authWatcher: { close() {} },
        snapshotBroadcaster: { close() {} },
        bootstrapStore: { clear() {} },
        persistence: {
          timeseries: { flush() {}, drain },
          eventLog: { drain },
          snapshotStore: { drain },
          kanban: { drain },
        },
        browsers: new Set(),
        clients: new Map(),
        wss: { close: closeSockets },
        loginAttempts: { flush: drain },
        mailboxManager: {
          close() {},
          mailboxGateways: new Map(),
          mailboxGatewayLastUsed: new Map(),
        },
        httpServer: {
          close(callback: () => void) {
            closeHttp = callback;
          },
        },
        dataDir: 'nonexistent-hq-shutdown-proof',
        hqUrl: 'http://proof.invalid',
      } as never);
      const first = shutdown();
      const second = shutdown();
      let secondDone = false;
      void second.then(() => {
        secondDone = true;
      });
      await Promise.resolve();
      expect(secondDone).toBe(false);
      closeHttp();
      await Promise.resolve();
      expect(secondDone).toBe(false);
      expect(drain).toHaveBeenCalledTimes(5);
      release();
      await Promise.all([first, second]);
      expect(secondDone).toBe(true);
      await shutdown();
      expect(closeSockets).toHaveBeenCalledTimes(1);
      expect(drain).toHaveBeenCalledTimes(5);
    },
  );
});
