/**
 * SAGE reaches its idle stop even when a client connects and says nothing.
 *
 * A socket that connected and then never sent a single byte used to pin the
 * daemon open forever: `clients.add` happens on accept, so `clients.size`
 * stayed above zero, `scheduleIdleStop()` returned early, and the idle timer
 * was never armed. No auth token was needed — the socket is registered before
 * any message is validated. Measured before the fix: with a 2s idle window a
 * silent connection kept the daemon alive past 15s.
 *
 * SAGE was the last of the three to get this, because `broadcast()` writes to
 * every connected socket with no subscription filter, so a legitimately
 * listen-only consumer looked possible. It is not: `onEvent()` is purely local
 * (it appends to a listener Set and sends nothing), the only consumer of SAGE
 * events in the repo is `remote-memory-port.ts`, and that port speaks —
 * `connection.call(op, args, …)` — with no listen-only mode. So keying the
 * reap off "has this socket EVER spoken" cannot cut a real consumer.
 *
 * That unfiltered broadcast remains a SEPARATE finding: events still reach any
 * socket that sends anything at all, authenticated or not. Closing it is an
 * authorization change and is deliberately not bundled with this lifecycle fix.
 *
 * The sweep must NOT call `scheduleIdleStop()`: doing that from a periodic
 * timer is the re-arm starvation that kept the mailbox and kanban daemons
 * alive forever. `destroy()` fires `close`, which owns the idle bookkeeping.
 */
import { describe, expect, it } from 'vitest';
import {
  sageProjectServerEndpoint,
  sageProjectServerMetadataPath,
} from '../../sage/src/project-server-endpoint.js';
import {
  connectFrame,
  importDaemonInstance,
  makeTempRoot,
  waitForEndpointClosed,
  waitForMetadataFile,
  waitForMetadataRemoval,
} from './helpers/project-server-harness.js';

describe('sage project server silent-client reap', () => {
  it('stops when a client connects and never sends a request', async () => {
    const fixture = await makeTempRoot('sage-silent-client');
    const endpoint = sageProjectServerEndpoint(fixture.root);
    const metadataPath = sageProjectServerMetadataPath(fixture.root);
    const previousIdle = process.env['WRONGSTACK_SAGE_SERVER_IDLE_MS'];
    const previousSilent = process.env['WRONGSTACK_SAGE_SERVER_SILENT_CLIENT_MS'];
    process.env['WRONGSTACK_SAGE_SERVER_IDLE_MS'] = '300';
    // 1s silent window => sweep = min(30s, max(1s, 250ms)) = 1s.
    process.env['WRONGSTACK_SAGE_SERVER_SILENT_CLIENT_MS'] = '1000';
    try {
      await importDaemonInstance(
        '../../../sage/src/project-server.ts',
        ['--project-root', fixture.root],
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
      if (previousIdle === undefined) delete process.env['WRONGSTACK_SAGE_SERVER_IDLE_MS'];
      else process.env['WRONGSTACK_SAGE_SERVER_IDLE_MS'] = previousIdle;
      if (previousSilent === undefined) {
        delete process.env['WRONGSTACK_SAGE_SERVER_SILENT_CLIENT_MS'];
      } else {
        process.env['WRONGSTACK_SAGE_SERVER_SILENT_CLIENT_MS'] = previousSilent;
      }
      await fixture.release();
    }
  });
});
