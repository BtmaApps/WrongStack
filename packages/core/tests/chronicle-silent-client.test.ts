/**
 * Chronicle reaches its idle stop even when a client connects and says nothing.
 *
 * A socket that connected and then never sent a single byte used to pin the
 * daemon open forever: `clients.add` happens on accept, so `clients.size`
 * stayed above zero, `scheduleIdleStop()` returned early, and the idle timer
 * was never armed. No auth token was needed — the socket is registered before
 * any message is validated. Measured before the fix: with a 2s idle window a
 * silent connection kept the daemon alive past 20s, three runs out of three.
 *
 * The reap keys off "has this socket EVER spoken", not "recently". A client
 * that made a request and then went quiet keeps its connection; only a socket
 * that never spoke is dropped, and nothing can be in flight on such a socket.
 * Chronicle never pushes unsolicited frames, so a silent peer is receiving
 * nothing either, and the client re-establishes through `ensureConnected` on
 * its next call.
 *
 * The sweep must NOT call `scheduleIdleStop()`: doing that from a periodic
 * timer is the re-arm starvation that kept the mailbox and kanban daemons
 * alive forever. `destroy()` fires `close`, and the close handler owns the
 * idle bookkeeping.
 */
import { describe, expect, it } from 'vitest';
import {
  chronicleProjectServerEndpoint,
  chronicleProjectServerMetadataPath,
} from '../src/chronicle/project-server-endpoint.js';
import {
  connectFrame,
  importDaemonInstance,
  makeTempRoot,
  waitForEndpointClosed,
  waitForMetadataFile,
  waitForMetadataRemoval,
} from './helpers/project-server-harness.js';

describe('chronicle project server silent-client reap', () => {
  it('stops when a client connects and never sends a request', async () => {
    const fixture = await makeTempRoot('chronicle-silent-client');
    const endpoint = chronicleProjectServerEndpoint(fixture.root);
    const metadataPath = chronicleProjectServerMetadataPath(fixture.root);
    const previousIdle = process.env['WRONGSTACK_CHRONICLE_SERVER_IDLE_MS'];
    const previousSilent = process.env['WRONGSTACK_CHRONICLE_SERVER_SILENT_CLIENT_MS'];
    process.env['WRONGSTACK_CHRONICLE_SERVER_IDLE_MS'] = '300';
    // 1s silent window => sweep = min(30s, max(1s, 250ms)) = 1s.
    process.env['WRONGSTACK_CHRONICLE_SERVER_SILENT_CLIENT_MS'] = '1000';
    try {
      await importDaemonInstance(
        '../../src/chronicle/project-server.ts',
        [
          '--project-root',
          fixture.root,
          '--global-root',
          `${fixture.root}-global`,
          '--project-id',
          'silent-client',
          '--project-dir',
          fixture.root,
          '--workspace-id',
          'silent-client-ws',
        ],
        Date.now(),
      );
      await waitForMetadataFile<{ authToken: string }>(metadataPath);
      const client = await connectFrame(endpoint);
      expect((await client.nextFrame()).type).toBe('hello');
      // Deliberately send nothing at all — not even an unauthenticated ping.
      await waitForMetadataRemoval(metadataPath, 15_000);
      await waitForEndpointClosed(endpoint, 5_000);
      client.socket.destroy();
    } finally {
      if (previousIdle === undefined) delete process.env['WRONGSTACK_CHRONICLE_SERVER_IDLE_MS'];
      else process.env['WRONGSTACK_CHRONICLE_SERVER_IDLE_MS'] = previousIdle;
      if (previousSilent === undefined) {
        delete process.env['WRONGSTACK_CHRONICLE_SERVER_SILENT_CLIENT_MS'];
      } else {
        process.env['WRONGSTACK_CHRONICLE_SERVER_SILENT_CLIENT_MS'] = previousSilent;
      }
      await fixture.release();
    }
  });
});
