/**
 * Governance project server idle shutdown.
 *
 * Governance was the only project daemon with no idle path at all: once
 * started it held its endpoint and SQLite handles until something killed it.
 * The shape here has to differ from the sibling daemons, and the differences
 * are what these tests pin:
 *
 *  - It is REQUEST-PER-CONNECTION. The client opens a socket, writes one frame
 *    and closes it, so `sockets.size === 0` is the normal state between calls
 *    and is not an idleness signal. Activity is stamped in `handleLine`.
 *  - A live credential grant BLOCKS the stop. The client's lease rotates on a
 *    60 minute TTL renewed 5 minutes early, i.e. roughly every 55 minutes, so
 *    a live session can legitimately be silent for a long time. That is why
 *    the production window is 90 minutes rather than the siblings' 5.
 *  - `idleMs`/`onIdle` are constructor options, not environment variables:
 *    `governanceDaemonEnvironment()` passes the child an allowlist, so a
 *    `WRONGSTACK_*` knob would never reach it. That choice is what makes a
 *    short window testable here at all.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { GovernanceProjectServer } from '../src/index.js';

const temporaryDirectories: string[] = [];
const servers: GovernanceProjectServer[] = [];

function projectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'wrongstack-governance-idle-'));
  temporaryDirectories.push(root);
  return root;
}

afterEach(async () => {
  for (const server of servers.splice(0).reverse()) await server.close();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

describe('governance project server idle shutdown', () => {
  it('asks the host to stop once nothing has used it for the idle window', async () => {
    const root = projectRoot();
    let resolveIdle: (() => void) | undefined;
    const idle = new Promise<void>((resolve) => {
      resolveIdle = resolve;
    });
    const server = new GovernanceProjectServer({
      projectRoot: root,
      projectId: 'project-idle',
      idleMs: 50,
      onIdle: () => resolveIdle?.(),
    });
    servers.push(server);
    await server.start();
    await expect(
      Promise.race([
        idle.then(() => 'idle' as const),
        new Promise<'timeout'>((resolve) => {
          const timer = setTimeout(() => resolve('timeout'), 5_000);
          timer.unref?.();
        }),
      ]),
    ).resolves.toBe('idle');
  });

  it('never arms an idle timer when the host supplies no onIdle callback', async () => {
    // Existing callers construct the server without these options; they must
    // keep their previous behaviour exactly, with no timer and no stop.
    const root = projectRoot();
    const server = new GovernanceProjectServer({
      projectRoot: root,
      projectId: 'project-no-callback',
      idleMs: 20,
    });
    servers.push(server);
    await server.start();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(server.ready).toBe(true);
  });

  it('does not stop while a capability grant is still live', async () => {
    const root = projectRoot();
    let fired = false;
    const server = new GovernanceProjectServer({
      projectRoot: root,
      projectId: 'project-live-grant',
      // Comfortably longer than the gap between `start()` resolving and the
      // grant being issued below, so the first timer cannot fire in between.
      idleMs: 300,
      onIdle: () => {
        fired = true;
      },
    });
    servers.push(server);
    await server.start();
    server.issueGrant({
      clientId: 'admin-holding-a-lease',
      capabilities: ['daemon_control', 'capability_admin'],
      ttlMs: 60_000,
    });
    // Three full windows. A grant-blind implementation stops in the first one.
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    expect(fired).toBe(false);
    expect(server.ready).toBe(true);
  });
});
