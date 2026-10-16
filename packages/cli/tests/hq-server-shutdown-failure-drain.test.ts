import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createHqServerShutdown } from '../src/hq-server/server-lifecycle.js';

describe('HQ shutdown drain failure isolation', () => {
  it.each(['none', 'login', 'eventLog', 'snapshotStore', 'timeseries', 'kanban', 'sage'])(
    'waits for sibling drains when %s fails',
    async (failed) => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const drain = (name: string) => async () => {
        if (name === failed) throw new Error(`${name} failed`);
        await gate;
      };
      const close = createHqServerShutdown({
        stopAlertEngine() {},
        authWatcher: { close() {} },
        snapshotBroadcaster: { close() {} },
        bootstrapStore: { clear() {} },
        persistence: {
          timeseries: { flush() {}, drain: drain('timeseries') },
          eventLog: { drain: drain('eventLog') },
          snapshotStore: { drain: drain('snapshotStore') },
          kanban: { drain: drain('kanban') },
          sage: { drain: drain('sage') },
        },
        browsers: new Set(),
        clients: new Map(),
        wss: { close() {} },
        mailboxManager: {
          close() {},
          mailboxGateways: new Map(),
          mailboxGatewayLastUsed: new Map(),
        },
        loginAttempts: { flush: drain('login') },
        httpServer: {
          close(callback: () => void) {
            callback();
          },
        },
        dataDir: join(tmpdir(), `wrongstack-hq-drain-${randomUUID()}`),
        hqUrl: 'http://proof.invalid',
      } as never);
      let settled = false;
      const pending = close().then(() => {
        settled = true;
      });
      try {
        // Advance a scheduler turn while every successful drain stays behind its gate.
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(settled).toBe(false);
      } finally {
        release();
        await pending;
      }
      expect(settled).toBe(true);
    },
  );
});
