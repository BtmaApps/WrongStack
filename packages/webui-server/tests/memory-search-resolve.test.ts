import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSageSurface = vi.hoisted(() => vi.fn());
vi.mock('@wrongstack/sage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wrongstack/sage')>()),
  getSageSurface,
}));

import {
  handleMemorySearchResolve,
  isWebuiSearchVisible,
} from '../src/server/http-server/memory-search-resolve.js';

const base = {
  id: '01M00000000000000000000000',
  status: 'active',
  scope: 'project',
  text: 'Visible project memory',
  tags: [],
};

function response() {
  const res = { writeHead: vi.fn(), end: vi.fn() };
  return {
    res: res as unknown as Parameters<typeof handleMemorySearchResolve>[0],
    status: () => res.writeHead.mock.calls[0]?.[0] as number,
    body: () => JSON.parse(String(res.end.mock.calls[0]?.[0])) as Record<string, unknown>,
  };
}

async function resolveRecord(record: Record<string, unknown> | null) {
  const getSage = vi.fn(async () => record);
  getSageSurface.mockReturnValue({ getSage });
  const out = response();
  await handleMemorySearchResolve(out.res, base.id, () => ({}) as never);
  return { ...out, getSage };
}

beforeEach(() => getSageSurface.mockReset());

describe('visibility-checked search ID resolution', () => {
  it('returns the exact project record when visible and allows stale management results', async () => {
    for (const status of ['active', 'stale']) {
      const result = await resolveRecord({ ...base, status });
      expect(result.status()).toBe(200);
      expect(result.body().memory).toMatchObject({ id: base.id, status });
      expect(result.getSage).toHaveBeenCalledWith(base.id);
    }
  });

  it('does not disclose owned or legacy unowned session records', async () => {
    const missing = await resolveRecord(null);
    expect(missing.status()).toBe(404);
    for (const ownerSessionId of ['other-session', undefined]) {
      const hidden = await resolveRecord({ ...base, scope: 'session', ownerSessionId });
      expect(hidden.status()).toBe(404);
      expect(hidden.body()).toEqual(missing.body());
    }
  });

  it('does not distinguish other hidden statuses from missing IDs', async () => {
    const missing = await resolveRecord(null);
    for (const status of ['deleted', 'archived', 'superseded', 'contradicted']) {
      const hidden = await resolveRecord({ ...base, status });
      expect(hidden.status()).toBe(404);
      expect(hidden.body()).toEqual(missing.body());
    }
  });

  it('does not treat audience tags or never-inject as read restrictions for management', () => {
    expect(
      isWebuiSearchVisible({
        ...base,
        audience: { roles: ['reviewer'] },
        contextPolicy: 'never',
      } as never),
    ).toBe(true);
  });

  it('rejects invalid encoded IDs before a store lookup', async () => {
    const out = response();
    const getStore = vi.fn();
    await handleMemorySearchResolve(out.res, '%zz', getStore);
    expect(out.status()).toBe(400);
    expect(getStore).not.toHaveBeenCalled();
  });
});
