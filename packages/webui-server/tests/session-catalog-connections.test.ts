import { WRONGSTACK_RUNTIME_VERSION } from '@wrongstack/primitives';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { callExisting, close, ping } = vi.hoisted(() => ({
  callExisting: vi.fn(),
  close: vi.fn(async () => undefined),
  ping: vi.fn(),
}));

vi.mock('@wrongstack/core/session-catalog', () => ({
  SessionCatalogProjectClient: class {
    callExisting = callExisting;
    close = close;
    ping = ping;
  },
}));

import { sessionCatalogHealth } from '../src/server/connections/collector.js';

describe('Session Catalog connections health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('probes an existing daemon without spawning one', async () => {
    callExisting.mockResolvedValue({
      runtimeVersion: WRONGSTACK_RUNTIME_VERSION,
      pid: 42,
      endpoint: 'catalog-pipe',
      databasePath: '/state/catalog.sqlite',
      uptimeMs: 5_000,
      clients: 2,
      activeRequests: 0,
      catalogRows: 7,
      liveLeases: 1,
      reservations: 0,
      maintenanceLeases: 0,
      damagedRows: 0,
    });

    await expect(sessionCatalogHealth('/project')).resolves.toMatchObject({
      id: 'session-catalog',
      status: 'healthy',
      ownerPid: 42,
    });
    expect(callExisting).toHaveBeenCalledWith('ping', {}, { timeoutMs: 3_000 });
    expect(ping).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it('reports a sleeping daemon as offline without waking it', async () => {
    callExisting.mockRejectedValue(new Error('connect ENOENT'));

    await expect(sessionCatalogHealth('/project')).resolves.toMatchObject({
      id: 'session-catalog',
      status: 'offline',
    });
    expect(ping).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
});

it.each(['0.0.1', '999.0.0', undefined])(
  'reports daemon release skew (%s) without spawning',
  async (runtimeVersion) => {
    callExisting.mockResolvedValue({ runtimeVersion, pid: 42, damagedRows: 0 });
    const result = await sessionCatalogHealth('/project');
    expect(result).toMatchObject({ status: 'degraded', versionMismatch: true });
    expect(result.detail).toContain('client ' + WRONGSTACK_RUNTIME_VERSION);
    expect(result.detail.toLowerCase()).toContain('restart');
    expect(ping).not.toHaveBeenCalled();
  },
);
