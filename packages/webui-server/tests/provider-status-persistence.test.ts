import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProviderModelStatusTracker } from '@wrongstack/coordination';
import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { handleProviderRoute, type ProviderRouteHandlers } from '../src/server/provider-routes.js';
import { createProviderStatusPersistence } from '../src/server/provider-status-persistence.js';

describe('standalone provider health persistence', () => {
  it('restores canonical blocked state, releases and clears it through the real route and retains peer rows', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wrongstack-status-control-'));
    try {
      const source = new ProviderModelStatusTracker();
      source.recordFailure('account', 'model', 'quota_exhausted', 429, 'Recorded quota failure');
      source.recordFailure('peer', 'other', 'quota_exhausted', 429, 'Peer quota failure');
      await writeFile(join(dir, 'provider-status.json'), JSON.stringify(source.getSnapshot()));
      const tracker = new ProviderModelStatusTracker();
      const persistence = createProviderStatusPersistence(tracker, join(dir, 'config.json'));
      const routes = {
        statusTracker: tracker,
        prepareProviderStatus: persistence.prepare,
        persistProviderStatusControl: persistence.persistControl,
        providerAuditFile: persistence.auditFile,
      } as unknown as ProviderRouteHandlers;
      const frames: Array<{ type: string; payload: Record<string, unknown> }> = [];
      const ws = {
        readyState: 1,
        bufferedAmount: 0,
        send: (value: string) => frames.push(JSON.parse(value)),
      } as unknown as WebSocket;
      await handleProviderRoute(
        ws,
        { type: 'provider.status.get', payload: { requestId: 'restore' } },
        routes,
      );
      expect(tracker.getStatus('account', 'model')?.state).toBe('blocked');
      expect(frames[0]?.payload['requestId']).toBe('restore');
      await handleProviderRoute(
        ws,
        {
          type: 'provider.status.retry',
          payload: { providerId: 'account', model: 'model', requestId: 'retry' },
        },
        routes,
      );
      expect(tracker.getStatus('account', 'model')?.state).not.toBe('blocked');
      await handleProviderRoute(
        ws,
        {
          type: 'provider.status.clear',
          payload: { providerId: 'account', model: 'model', requestId: 'clear' },
        },
        routes,
      );
      expect(tracker.getStatus('account', 'model')).toBeUndefined();
      const stored = JSON.parse(await readFile(join(dir, 'provider-status.json'), 'utf8'));
      expect(stored.statuses.map((row: { providerId: string }) => row.providerId)).toEqual([
        'peer',
      ]);
      const reopened = new ProviderModelStatusTracker();
      await createProviderStatusPersistence(reopened, join(dir, 'config.json')).prepare();
      expect(reopened.getStatus('account', 'model')).toBeUndefined();
      expect(reopened.getStatus('peer', 'other')?.state).toBe('blocked');
      await handleProviderRoute(
        ws,
        { type: 'provider.audit.get', payload: { requestId: 'audit' } },
        routes,
      );
      expect(frames.at(-1)?.payload['lines']).toMatchObject([
        { reason: 'manual_clear' },
        { reason: 'manual_retry' },
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('retries a failed restore after the saved document is repaired', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wrongstack-status-read-'));
    try {
      const persistence = createProviderStatusPersistence(
        new ProviderModelStatusTracker(),
        join(dir, 'config.json'),
      );
      await writeFile(join(dir, 'provider-status.json'), 'null');
      await expect(persistence.prepare()).rejects.toThrow('invalid');
      await writeFile(join(dir, 'provider-status.json'), JSON.stringify({ statuses: [] }));
      await expect(persistence.prepare()).resolves.toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
