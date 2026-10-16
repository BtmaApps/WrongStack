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
      path.resolve(root).startsWith(path.join(os.tmpdir(), 'wrongstack-registry-malformed-')),
    ).toBe(true);
    await fs.rm(root, { recursive: true, force: true });
  }
});

describe('session registry malformed members', () => {
  it.each([null, [], false, 42, 'bad'])(
    'preserves a live session beside an invalid record (%j)',
    async (invalid) => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-registry-malformed-'));
      roots.push(root);
      const now = Date.parse('2026-10-16T12:00:00Z');
      vi.spyOn(Date, 'now').mockReturnValue(now);
      const registry = new SessionRegistry(root);
      const live = {
        sessionId: 'live',
        pid: process.pid,
        startedAt: new Date(now).toISOString(),
        projectDir: root,
        projectSlug: 'proof',
        lastHeartbeatAt: new Date(now).toISOString(),
        status: 'active',
        agents: [],
        agentCount: 0,
      };
      await fs.writeFile(registry.registryPath, JSON.stringify({ live, invalid }));
      expect((await registry.list()).map((entry) => entry.sessionId)).toEqual(['live']);
      expect(await registry.get('live')).toEqual(live);
      expect(await registry.get('invalid')).toBeUndefined();
    },
  );
});
