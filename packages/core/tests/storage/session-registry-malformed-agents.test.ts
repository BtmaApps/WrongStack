import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionRegistry } from '../../src/session-catalog/session-registry.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    expect(
      path.resolve(root).startsWith(path.join(os.tmpdir(), 'wrongstack-registry-agents-')),
    ).toBe(true);
    await fs.rm(root, { recursive: true, force: true });
  }
});

describe('registry persisted agent validation', () => {
  it.each(
    [null, [], false, 42, 'bad', { id: 'worker', lastActivityAt: { toString: null } }].map(
      (value) => [value],
    ),
  )('keeps healthy agents and their session beside a malformed agent (%j)', async (invalid) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-registry-agents-'));
    roots.push(root);
    const now = Date.parse('2026-10-16T12:00:00Z');
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const registry = new SessionRegistry(root);
    const leader = {
      id: 'leader',
      name: 'leader',
      status: 'idle',
      lastActivityAt: new Date(now).toISOString(),
    };
    const worker = { ...leader, id: 'worker' };
    await fs.writeFile(
      registry.registryPath,
      JSON.stringify({
        live: {
          sessionId: 'live',
          pid: process.pid,
          startedAt: new Date(now).toISOString(),
          projectSlug: 'proof',
          lastHeartbeatAt: new Date(now).toISOString(),
          status: 'active',
          agents: [leader, invalid, worker],
          agentCount: 3,
        },
      }),
    );
    const sessions = await registry.list();
    expect(sessions.map((session) => session.sessionId)).toEqual(['live']);
    expect(sessions[0]?.agents).toEqual([leader, worker]);
    expect(sessions[0]?.agentCount).toBe(2);
    const saved = JSON.parse(await fs.readFile(registry.registryPath, 'utf8'));
    expect(saved.live.agents).toEqual([leader, worker]);
  });
});
