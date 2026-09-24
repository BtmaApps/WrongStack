/**
 * Linked git worktrees share the main checkout's project directory, so one
 * Session Catalog daemon serves every checkout. A daemon started from the
 * main checkout used to refuse a client in a linked worktree ("project
 * identity mismatch"): `wstack --resume` there failed while anything ran in
 * the main checkout. Identity is the canonical root.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionCatalogProjectClient } from '../../src/session-catalog/client.js';
import {
  sessionCatalogProjectServerEndpoint,
  sessionCatalogProjectServerMetadataPath,
} from '../../src/session-catalog/endpoint.js';
import { SESSION_CATALOG_PROTOCOL_VERSION } from '../../src/session-catalog/protocol.js';

let tmp: string;
let server: net.Server | undefined;

beforeEach(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-catalog-wt-')));
});
afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
  await fs.rm(tmp, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore', windowsHide: true });
}

/** A catalog daemon stand-in that greets as if started from `daemonRoot`. */
async function fakeDaemon(projectDir: string, daemonRoot: string): Promise<void> {
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(
    sessionCatalogProjectServerMetadataPath(projectDir),
    JSON.stringify({ pid: process.pid, projectRoot: daemonRoot, authToken: 't' }),
  );
  const endpoint = sessionCatalogProjectServerEndpoint(projectDir);
  server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    socket.write(
      `${JSON.stringify({
        type: 'hello',
        protocolVersion: SESSION_CATALOG_PROTOCOL_VERSION,
        pid: process.pid,
        projectDir,
        projectRoot: daemonRoot,
        endpoint,
        databasePath: path.join(projectDir, 'catalog.db'),
        instanceId: 'fake',
        startedAt: new Date().toISOString(),
      })}\n`,
    );
    let buffer = '';
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      for (let i = buffer.indexOf('\n'); i >= 0; i = buffer.indexOf('\n')) {
        const request = JSON.parse(buffer.slice(0, i)) as { id: number };
        buffer = buffer.slice(i + 1);
        socket.write(
          `${JSON.stringify({ type: 'response', id: request.id, ok: true, result: [] })}\n`,
        );
      }
    });
  });
  await new Promise<void>((resolve) => server?.listen(endpoint, resolve));
}

describe('Session Catalog identity across git worktrees', () => {
  it('a client in a linked worktree talks to the daemon the main checkout started', async () => {
    const main = path.join(tmp, 'main');
    const feature = path.join(tmp, 'feature');
    await fs.mkdir(main);
    git(main, 'init', '-q');
    git(
      main,
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'i',
    );
    git(main, 'worktree', 'add', '-q', feature, '-b', 'feature');

    const projectDir = path.join(tmp, 'project-dir');
    await fakeDaemon(projectDir, main);
    const client = new SessionCatalogProjectClient({ projectDir, projectRoot: feature });
    try {
      await expect(client.callExisting('list_live', {})).resolves.toEqual([]);
    } finally {
      await client.close();
    }
  });

  it('still refuses a daemon that belongs to a different repository', async () => {
    const mine = path.join(tmp, 'mine');
    const other = path.join(tmp, 'other');
    await fs.mkdir(mine);
    await fs.mkdir(other);
    const projectDir = path.join(tmp, 'project-dir');
    await fakeDaemon(projectDir, other);
    const client = new SessionCatalogProjectClient({ projectDir, projectRoot: mine });
    try {
      await expect(client.callExisting('list_live', {}, { timeoutMs: 2_000 })).rejects.toThrow(
        /identity mismatch|unavailable/,
      );
    } finally {
      await client.close();
    }
  });
});
