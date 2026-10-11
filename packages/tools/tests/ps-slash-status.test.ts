import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistentProcessEntry } from '../src/process-registry-persistent.js';
import { createGlobalPsSlashCommand, listInstances } from '../src/ps-slash.js';

const { getGlobalStatus } = vi.hoisted(() => ({ getGlobalStatus: vi.fn() }));
vi.mock('../src/process-registry-persistent.js', () => ({
  getPersistentProcessRegistry: () => ({ getGlobalStatus }),
}));

const timestamp = 1_800_000_000_000;

function entry(hostname: string, age: number, pid: number): PersistentProcessEntry {
  return {
    pid,
    name: 'fixture',
    command: 'fixture',
    startedAt: timestamp - 600_000,
    lastHeartbeat: timestamp - age,
    instanceId: hostname,
    hostname,
    protected: false,
    spawnMode: 'main',
    platform: process.platform,
  };
}

describe('explicit process instance status filters', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(timestamp);
    const entries = [
      entry('active-host', 1_000, 1),
      entry('idle-host', 120_000, 2),
      entry('stale-host', 300_000, 3),
    ];
    getGlobalStatus.mockResolvedValue({
      instances: new Map(entries.map((value) => [value.instanceId, [value]])),
      totalProcesses: 3,
      protectedCount: 0,
      staleCount: 2,
    });
  });

  it('keeps stale instances hidden in the default listing', async () => {
    expect((await listInstances()).map((value) => value.status)).toEqual(['active', 'idle']);
  });

  it('includes stale instances when explicitly requested', async () => {
    expect((await listInstances({ includeStale: true })).map((value) => value.status)).toEqual([
      'active',
      'idle',
      'stale',
    ]);
  });

  it.each(['active', 'idle', 'stale'] as const)(
    'returns the explicitly selected %s state, including exact age thresholds',
    async (status) => {
      expect((await listInstances({ status })).map((value) => value.status)).toEqual([status]);
    },
  );

  it('includes every state for an explicit all filter', async () => {
    expect((await listInstances({ status: 'all' })).map((value) => value.status)).toEqual([
      'active',
      'idle',
      'stale',
    ]);
  });

  it.each(['stale', 'all'] as const)(
    'honors explicit includeStale=false with %s',
    async (status) => {
      const instances = await listInstances({ status, includeStale: false });
      expect(instances.map((value) => value.status)).toEqual(
        status === 'all' ? ['active', 'idle'] : [],
      );
    },
  );

  it('combines an explicit stale filter with the hostname filter', async () => {
    expect(
      (await listInstances({ status: 'stale', hostname: 'stale-*' })).map(
        (value) => value.hostname,
      ),
    ).toEqual(['stale-host']);
    expect(await listInstances({ status: 'stale', hostname: 'active-*' })).toEqual([]);
  });

  it.each(['status stale', 'state all', 'status STALE'])(
    'displays the stale instance through /ps %s',
    async (input) => {
      const result = await createGlobalPsSlashCommand().handler(input);
      expect(result.message).toContain('stale-host');
      expect(result.message).toContain('[ ] stale');
      expect(result.message).not.toContain('No instances found');
    },
  );
});
