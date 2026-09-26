/**
 * Regression: the agent-publish throttle timer launches `void flushAgents()`
 * fire-and-forget (registry.ts). Before the fix, an IPC failure inside that
 * timer-driven flush escaped as an UNHANDLED rejection and killed the whole
 * vitest worker — the fatal `connect ENOENT ... session-catalog` flake in
 * hq-mailbox-mutation whose throwing site vitest.config.ts documents as
 * unidentified (the audited probe sites at registry list/:310/:334 all
 * swallow; this timer site did not).
 *
 * Contract after the fix: a publish failure is contained (never unhandled),
 * the eager caller-visible path no longer rejects on a transient IPC blip,
 * and the next updateAgents() publishes a fresh full snapshot.
 *
 * @see packages/core/src/session-catalog/registry.ts (flushAgents)
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const callMock = vi.hoisted(() => vi.fn());

vi.mock('../src/session-catalog/client.js', () => ({
  SessionCatalogProjectClient: vi.fn().mockImplementation(function MockSessionCatalogClient() {
    return {
      call: callMock,
      callExisting: vi.fn(),
      close: vi.fn(async () => undefined),
    };
  }),
}));

import { ProjectSessionRegistry } from '../src/session-catalog/registry.js';

describe('ProjectSessionRegistry agent flush failure handling', () => {
  let tempRoot: string;
  let registry: ProjectSessionRegistry;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-reg-flush-'));
    registry = new ProjectSessionRegistry(tempRoot);
    callMock.mockReset();
    callMock.mockImplementation(async (op: string) => {
      if (op === 'claim_new' || op === 'heartbeat') return { token: 'cred' };
      if (op === 'publish_agents') throw new Error('connect ENOENT session-catalog blip');
      return {};
    });
    await registry.register({
      sessionId: 'session-flush-1',
      projectSlug: 'flush-proj',
      projectRoot: path.join(tempRoot, 'flush-proj'),
      pid: process.pid,
      surface: 'test',
      startedAt: new Date().toISOString(),
      clientVersion: 'test',
    } as never);
  });

  afterEach(async () => {
    await registry.dispose().catch(() => undefined);
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('contains a timer-path publish failure instead of rejecting unhandled', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      // First flush is EAGER (throttle window elapsed) — caller-visible path.
      // A transient IPC blip must not reject the caller either: agents are
      // full snapshots, the next updateAgents() republishes fresh state.
      await registry.updateAgents([{ id: 'a1', name: 'agent-1', status: 'idle' }] as never);
      // Second flush inside the throttle window goes through the TIMER path
      // (`void this.flushAgents()`) — before the fix its rejection escaped
      // unhandled and killed the worker.
      await registry.updateAgents([{ id: 'a2', name: 'agent-2', status: 'active' }] as never);
      // AGENT_WRITE_THROTTLE_MS is 300ms; let the timer fire and settle.
      await new Promise((resolve) => setTimeout(resolve, 700));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('publishes a fresh snapshot on the next updateAgents after a blip', async () => {
    await registry.updateAgents([{ id: 'stale', name: 'stale-agent', status: 'idle' }] as never);
    await new Promise((resolve) => setTimeout(resolve, 500));

    callMock.mockImplementation(async (op: string) => {
      if (op === 'claim_new' || op === 'heartbeat') return { token: 'cred' };
      return {};
    });
    await registry.updateAgents([{ id: 'fresh', name: 'fresh-agent', status: 'active' }] as never);

    const publish = callMock.mock.calls.filter(([op]) => op === 'publish_agents').pop();
    expect(publish).toBeDefined();
    if (publish === undefined) return;
    const batch = (publish[1] as { agents: Array<{ id: string }> }).agents;
    expect(batch.map((agent) => agent.id)).toEqual(['fresh']);
  });
});
