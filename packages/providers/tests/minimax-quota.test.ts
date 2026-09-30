/**
 * MiniMax Token Plan quota reporter — `GET /v1/token_plan/remains` (and
 * `/account/query_balance` for pay-as-you-go keys) mapped onto the
 * provider-neutral snapshot shape.
 *
 * What belongs here is what the wire format does not make obvious: the
 * `*_usage_count` field that has meant both "used" and "remaining", the status
 * enum (2 exhausted, 3 unlimited — and 3+3 with zero totals meaning "not in
 * plan"), the display-only weekly boost, and that non-text meters never reach
 * the status surfaces.
 */

import {
  getProviderQuota,
  type ProviderQuotaSnapshot,
  resetProviderQuota,
} from '@wrongstack/core/quota';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  miniMaxKeyAuthorizesAt,
  miniMaxQuotaResetInMs,
  reportMiniMaxQuota,
} from '../src/minimax-quota.js';

afterEach(() => {
  resetProviderQuota();
});

const NOW = 1_776_366_000_000;
const HOUR = 3_600_000;
const PLAN_KEY = 'plan-key';
// Built by concatenation so the source carries no credential-shaped literal.
const PAYG_KEY = ['sk', 'api', 'abc'].join('-');

function textRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    model_name: 'MiniMax-M*',
    start_time: NOW - 2 * HOUR,
    end_time: NOW + 3 * HOUR,
    remains_time: 3 * HOUR,
    current_interval_total_count: 1500,
    current_interval_usage_count: 300,
    current_interval_remaining_percent: 80,
    current_interval_status: 1,
    current_weekly_total_count: 15000,
    current_weekly_usage_count: 1500,
    current_weekly_remaining_percent: 90,
    current_weekly_status: 1,
    weekly_start_time: NOW - 24 * HOUR,
    weekly_end_time: NOW + 6 * 24 * HOUR,
    weekly_remains_time: 6 * 24 * HOUR,
    ...overrides,
  };
}

function body(rows: unknown[]): Record<string, unknown> {
  return { base_resp: { status_code: 0, status_msg: 'success' }, model_remains: rows };
}

/** Read a canned response through the public reporter. */
function read(json: unknown, apiKey = PLAN_KEY): Promise<ProviderQuotaSnapshot[]> {
  return reportMiniMaxQuota('minimax', {
    apiKey,
    root: 'https://api.minimax.io',
    fetchImpl: vi.fn(async () => new Response(JSON.stringify(json), { status: 200 })) as never,
    now: NOW,
  });
}

describe('plan windows', () => {
  it('maps the 5h and weekly windows of the text meter', async () => {
    const [snapshot, ...rest] = await read(body([textRow()]));
    expect(rest).toHaveLength(0);
    expect(snapshot).toMatchObject({
      providerId: 'minimax',
      meterId: 'MiniMax-M*',
      meterLabel: 'MiniMax-M*',
      capturedAt: NOW,
    });
    expect(snapshot?.reachedWindowId).toBeUndefined();
    expect(snapshot?.windows).toEqual([
      {
        id: 'primary',
        usedPercent: 20,
        windowMinutes: 300,
        resetsAt: Math.floor((NOW + 3 * HOUR) / 1000),
      },
      {
        id: 'secondary',
        usedPercent: 10,
        windowMinutes: 10080,
        resetsAt: Math.floor((NOW + 6 * 24 * HOUR) / 1000),
      },
    ]);
    expect(getProviderQuota('minimax')).toHaveLength(1);
  });

  it('reads a bare usage count as REMAINING (legacy meaning), like the vendor CLI', async () => {
    const [snapshot] = await read(
      body([
        textRow({
          current_interval_usage_count: 1200,
          current_interval_remaining_percent: undefined,
          current_weekly_status: 3,
        }),
      ]),
    );
    expect(snapshot?.windows).toEqual([
      expect.objectContaining({ id: 'primary', usedPercent: 20 }),
    ]);
  });

  it('clamps an out-of-range percentage', async () => {
    const [snapshot] = await read(
      body([
        textRow({ current_interval_remaining_percent: 150, current_weekly_remaining_percent: -5 }),
      ]),
    );
    expect(snapshot?.windows.map((w) => w.usedPercent)).toEqual([0, 100]);
  });

  it('marks the exhausted window as reached and full', async () => {
    const [snapshot] = await read(
      body([textRow({ current_interval_status: 2, current_interval_remaining_percent: 3 })]),
    );
    expect(snapshot?.reachedWindowId).toBe('primary');
    expect(snapshot?.windows[0]?.usedPercent).toBe(100);
  });

  it('marks a cut-off weekly window as reached when the short window is fine', async () => {
    const [snapshot] = await read(body([textRow({ current_weekly_status: 2 })]));
    expect(snapshot?.reachedWindowId).toBe('secondary');
  });

  it('omits an unlimited weekly window instead of drawing a permanent bar', async () => {
    const [snapshot] = await read(body([textRow({ current_weekly_status: 3 })]));
    expect(snapshot?.windows.map((w) => w.id)).toEqual(['primary']);
  });

  it('omits a weekly window the plan does not have (zero total, no percent)', async () => {
    const [snapshot] = await read(
      body([
        textRow({
          current_weekly_total_count: 0,
          current_weekly_usage_count: 0,
          current_weekly_remaining_percent: undefined,
        }),
      ]),
    );
    expect(snapshot?.windows.map((w) => w.id)).toEqual(['primary']);
  });

  it('ignores the display-only weekly boost', async () => {
    const [snapshot] = await read(body([textRow({ weekly_boost_permille: 1500 })]));
    expect(snapshot?.windows[1]?.usedPercent).toBe(10);
  });

  it('drops a model that is not part of the plan (3+3 with zero totals)', async () => {
    const snapshots = await read(
      body([
        textRow({
          current_interval_total_count: 0,
          current_weekly_total_count: 0,
          current_interval_status: 3,
          current_weekly_status: 3,
        }),
      ]),
    );
    expect(snapshots).toEqual([]);
  });

  it('keeps only text meters — speech, image and video never reach the chip', async () => {
    const snapshots = await read(
      body([
        textRow({ model_name: 'speech-hd', current_interval_remaining_percent: 0 }),
        textRow({ model_name: 'image-01' }),
        textRow({ model_name: 'video' }),
        textRow({ model_name: 'general' }),
        textRow(),
      ]),
    );
    expect(snapshots.map((s) => s.meterId)).toEqual(['general', 'MiniMax-M*']);
  });

  it('falls back to remains_time when the window bounds are missing', async () => {
    const [snapshot] = await read(body([textRow({ start_time: undefined, end_time: undefined })]));
    expect(snapshot?.windows[0]).toEqual({
      id: 'primary',
      usedPercent: 20,
      resetsAt: Math.floor((NOW + 3 * HOUR) / 1000),
    });
  });

  it('skips unreadable rows, error envelopes and malformed bodies', async () => {
    const unreadable = textRow({
      current_interval_remaining_percent: undefined,
      current_interval_usage_count: undefined,
      current_weekly_status: 3,
    });
    const badCounts = [
      { current_interval_usage_count: 10, current_interval_total_count: 0 },
      { current_interval_usage_count: -1, current_interval_total_count: 10 },
      { current_interval_usage_count: 11, current_interval_total_count: 10 },
    ].map((o) =>
      textRow({ ...o, current_interval_remaining_percent: undefined, current_weekly_status: 3 }),
    );
    for (const json of [
      body([unreadable, ...badCounts]),
      body([null, 7, textRow({ model_name: '' })]),
      { base_resp: { status_code: 1004, status_msg: 'no' }, model_remains: [textRow()] },
      { model_remains: 'x' },
      null,
    ]) {
      await expect(read(json)).resolves.toEqual([]);
    }
    expect(getProviderQuota('minimax')).toEqual([]);
  });
});

describe('pay-as-you-go balance', () => {
  it('reads the balance endpoint for a secret key and records credits', async () => {
    const fetchImpl = vi.fn(
      async (_url: string) =>
        new Response(JSON.stringify({ base_resp: { status_code: 0 }, available_amount: '12.50' }), {
          status: 200,
        }),
    );
    const [snapshot] = await reportMiniMaxQuota('minimax', {
      apiKey: PAYG_KEY,
      root: 'https://api.minimax.cn',
      fetchImpl: fetchImpl as never,
      signal: new AbortController().signal,
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.minimax.cn/account/query_balance');
    expect(snapshot).toMatchObject({
      meterId: 'balance',
      windows: [],
      credits: { hasCredits: true, unlimited: false, balance: '12.50' },
    });
  });

  it('reads a numeric, unparseable or missing balance', async () => {
    expect((await read({ available_amount: 0 }, PAYG_KEY))[0]?.credits).toEqual({
      hasCredits: false,
      unlimited: false,
      balance: '0',
    });
    expect((await read({ available_amount: 'n/a' }, PAYG_KEY))[0]?.credits).toEqual({
      hasCredits: true,
      unlimited: false,
      balance: 'n/a',
    });
    await expect(read({ available_amount: '' }, PAYG_KEY)).resolves.toEqual([]);
    await expect(read('nope', PAYG_KEY)).resolves.toEqual([]);
    await expect(
      read({ base_resp: { status_code: 1004 }, available_amount: '1' }, PAYG_KEY),
    ).resolves.toEqual([]);
  });
});

describe('reportMiniMaxQuota transport', () => {
  it('reads the plan endpoint with a Bearer key', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body([textRow()]))));
    await reportMiniMaxQuota('minimax-coding-plan', {
      apiKey: PLAN_KEY,
      root: 'https://api.minimax.io',
      fetchImpl: fetchImpl as never,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.minimax.io/v1/token_plan/remains');
    expect((init.headers as Record<string, string>)['authorization']).toBe(`Bearer ${PLAN_KEY}`);
    expect(getProviderQuota('minimax-coding-plan')[0]?.meterId).toBe('MiniMax-M*');
  });

  it('is silent on HTTP failures, bad JSON and network errors', async () => {
    for (const impl of [
      async () => new Response('{}', { status: 401 }),
      async () => new Response('not json', { status: 200 }),
      async () => {
        throw new Error('offline');
      },
    ]) {
      await expect(
        reportMiniMaxQuota('minimax', {
          apiKey: PLAN_KEY,
          root: 'https://api.minimax.io',
          fetchImpl: vi.fn(impl) as never,
        }),
      ).resolves.toEqual([]);
    }
    expect(getProviderQuota('minimax')).toEqual([]);
  });
});

describe('miniMaxQuotaResetInMs', () => {
  it('waits for the latest reset among exhausted windows', async () => {
    const snapshots = await read(
      body([textRow({ current_interval_status: 2, current_weekly_status: 2 })]),
    );
    expect(miniMaxQuotaResetInMs(snapshots, NOW)).toBe(6 * 24 * HOUR);
  });

  it('does not invent a reset for a plan that reads healthy', async () => {
    expect(miniMaxQuotaResetInMs(await read(body([textRow()])), NOW)).toBeUndefined();
  });

  it('ignores an exhausted window whose reset is unknown or already past', () => {
    expect(
      miniMaxQuotaResetInMs(
        [
          {
            providerId: 'minimax',
            meterId: 'm',
            windows: [
              { id: 'primary', usedPercent: 100 },
              { id: 'secondary', usedPercent: 100, resetsAt: Math.floor(NOW / 1000) - 10 },
            ],
            capturedAt: NOW,
          },
        ],
        NOW,
      ),
    ).toBeUndefined();
  });
});

describe('miniMaxKeyAuthorizesAt', () => {
  it('needs an explicit success envelope', async () => {
    const ok = vi.fn(
      async () => new Response(JSON.stringify({ base_resp: { status_code: 0 } }), { status: 200 }),
    );
    await expect(
      miniMaxKeyAuthorizesAt('https://api.minimax.cn', PLAN_KEY, { fetchImpl: ok as never }),
    ).resolves.toBe(true);
    const payg = vi.fn(async (_url: string) => new Response('{}', { status: 401 }));
    await miniMaxKeyAuthorizesAt('https://api.minimax.cn', PAYG_KEY, { fetchImpl: payg as never });
    expect(payg.mock.calls[0]?.[0]).toBe('https://api.minimax.cn/account/query_balance');

    for (const impl of [
      async () => new Response('{}', { status: 200 }),
      async () => new Response('null', { status: 200 }),
      async () =>
        new Response(JSON.stringify({ base_resp: { status_code: 2049 } }), { status: 200 }),
      async () => new Response('{}', { status: 401 }),
      async () => {
        throw new Error('offline');
      },
    ]) {
      await expect(
        miniMaxKeyAuthorizesAt('https://api.minimax.cn', PLAN_KEY, {
          fetchImpl: vi.fn(impl) as never,
        }),
      ).resolves.toBe(false);
    }
  });
});
