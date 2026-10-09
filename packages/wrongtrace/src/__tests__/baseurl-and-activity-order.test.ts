import { describe, expect, it } from 'vitest';

import { getRecentActivity } from '../agent-helpers.js';
import { discover } from '../discovery.js';
import type { WrongTraceClient } from '../types.js';

const okFetch = (async () =>
  new Response(JSON.stringify({ status: 'ok' }), { status: 200 })) as unknown as typeof fetch;

describe('discover baseUrl normalization', () => {
  it('strips trailing slashes so appended /api paths never start with //', async () => {
    expect((await discover({ baseUrl: 'http://h:1/', fetchImpl: okFetch })).baseUrl).toBe(
      'http://h:1',
    );
    expect((await discover({ baseUrl: 'http://h:1///', fetchImpl: okFetch })).baseUrl).toBe(
      'http://h:1',
    );
    expect((await discover({ baseUrl: 'http://h:1/wt/', fetchImpl: okFetch })).baseUrl).toBe(
      'http://h:1/wt',
    );
  });
});

describe('getRecentActivity ordering', () => {
  const fake = (times: string[]): WrongTraceClient => {
    const rows = [] as unknown[] & { events?: unknown[] };
    rows.events = times.map((t) => ({ file_path: 'a.ts', overwriter_time: t }));
    return {
      isAvailable: true,
      getFrictionMatrix: async () => rows,
    } as unknown as WrongTraceClient;
  };

  it('orders by instant when UTC offsets differ', async () => {
    const out = await getRecentActivity(
      fake(['2026-10-09T10:00:00+03:00', '2026-10-09T08:00:00Z']),
      'a.ts',
    );
    expect(out.map((e) => e.at)).toEqual(['2026-10-09T08:00:00Z', '2026-10-09T10:00:00+03:00']);
  });

  it('falls back to string order for unparseable stamps', async () => {
    const out = await getRecentActivity(fake(['aaa', 'zzz']), 'a.ts');
    expect(out.map((e) => e.at)).toEqual(['zzz', 'aaa']);
  });
});
