// Regression: close() during an in-flight connect did not end the connection
// election in the Chronicle and Session Catalog clients. close() rejects the
// pending handshake, which the election loop read as one more failed attempt —
// it re-armed the daemon spawn and connected again, so a closed client came
// back to life. The endpoint here accepts and never sends `hello`; spawns are
// stubbed. From src the Chronicle resolver looks for
// src/chronicle/project-server.js, so fs.existsSync (its documented test seam)
// reports that one path present.
import { mkdtempSync, rmSync } from 'node:fs';
import { expect, it, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  const existsSync = ((p: Parameters<typeof real.existsSync>[0]) =>
    /chronicle[\\/]project-server\.js$/.test(String(p)) ||
    real.existsSync(p)) as typeof real.existsSync;
  return { ...real, existsSync, default: { ...real, existsSync } };
});

import * as net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChronicleProjectServerClient } from '../src/chronicle/project-server-client.js';
import { chronicleProjectServerEndpoint } from '../src/chronicle/project-server-endpoint.js';
import { SessionCatalogProjectClient } from '../src/session-catalog/client.js';
import { sessionCatalogProjectServerEndpoint } from '../src/session-catalog/endpoint.js';

interface Case {
  name: string;
  endpoint(projectDir: string): string;
  make(projectDir: string): { call(): Promise<unknown>; close(): Promise<void> };
  stubSpawn(onSpawn: () => void): void;
}

const cases: Case[] = [
  {
    name: 'chronicle',
    endpoint: chronicleProjectServerEndpoint,
    make: (projectDir) => {
      const client = new ChronicleProjectServerClient({
        projectRoot: projectDir,
        globalRoot: projectDir,
        projectId: 'close-mid-connect',
        projectDir,
        workspaceId: 'close-mid-connect',
      });
      return { call: () => client.ping(), close: () => client.close() };
    },
    stubSpawn: (onSpawn) => {
      (
        ChronicleProjectServerClient.prototype as unknown as { spawnDetachedServer(): void }
      ).spawnDetachedServer = () => onSpawn();
    },
  },
  {
    name: 'session-catalog',
    endpoint: sessionCatalogProjectServerEndpoint,
    make: (projectDir) => {
      const client = new SessionCatalogProjectClient({ projectDir, projectRoot: projectDir });
      return { call: () => client.call('list' as never, {} as never), close: () => client.close() };
    },
    stubSpawn: (onSpawn) => {
      (
        SessionCatalogProjectClient.prototype as unknown as { spawnDetached(): undefined }
      ).spawnDetached = () => {
        onSpawn();
        return undefined;
      };
    },
  },
];

it('a project-server client closed mid-connect never reconnects or spawns', async () => {
  const results: Record<string, unknown> = {};
  let ok = true;
  for (const c of cases) {
    const projectDir = mkdtempSync(join(tmpdir(), `close-mid-connect-${c.name}-`));
    let connections = 0;
    const sockets: net.Socket[] = [];
    const waiters: Array<() => void> = [];
    const server = net.createServer((socket) => {
      connections++;
      sockets.push(socket);
      socket.on('error', () => undefined);
      waiters.shift()?.();
    });
    await new Promise<void>((resolve) => server.listen(c.endpoint(projectDir), resolve));
    let spawns = 0;
    c.stubSpawn(() => {
      spawns++;
    });
    const nextConnection = () =>
      new Promise<'reconnected'>((resolve) => waiters.push(() => resolve('reconnected')));

    // CONTROL: closing an idle client opens nothing.
    await c.make(projectDir).close();
    if (connections !== 0) {
      console.log(`INVALID PROOF: ${c.name} control opened a connection`);
      throw new Error('INVALID PROOF');
    }

    const client = c.make(projectDir);
    const first = nextConnection();
    const pending = client.call().then(
      () => 'settled' as const,
      () => 'settled' as const,
    );
    const started = await Promise.race([
      first,
      pending.then(() => 'call-settled-before-connect' as const),
    ]);
    if (started !== 'reconnected') {
      const reason = await client.call().then(
        () => 'ok',
        (e: Error) => e.message,
      );
      console.log(`INVALID PROOF: ${c.name} never reached the endpoint (${reason})`);
      throw new Error('INVALID PROOF');
    }
    const second = nextConnection();
    void client.close();
    const outcome = await Promise.race([pending, second]);
    results[c.name] = { outcome, connections, spawns };
    if (!(outcome === 'settled' && Number(connections) === 1 && spawns === 0)) ok = false;
    void client.close();
    for (const s of sockets) s.destroy();
    server.close();
    rmSync(projectDir, { recursive: true, force: true });
  }

  expect(results).toEqual({
    chronicle: { outcome: 'settled', connections: 1, spawns: 0 },
    'session-catalog': { outcome: 'settled', connections: 1, spawns: 0 },
  });
  expect(ok).toBe(true);
}, 60_000);
