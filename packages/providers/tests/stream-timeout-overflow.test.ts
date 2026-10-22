import { expect, it } from 'vitest';
import { streamTimeoutOverflow } from './helpers/stream-timeout-overflow.js';

it.each([2_147_483_648, 3_000_000_000, Number.MAX_SAFE_INTEGER])(
  'keeps a configured %s ms header watchdog from overflowing to 1 ms',
  async (value) => {
    expect(await streamTimeoutOverflow(value)).toEqual({
      configured: 2_147_483_647,
      timers: [{ requested: 2_147_483_647, effective: 2_147_483_647 }],
    });
  },
);

it.each([0, 120_000, 2_147_483_647])('preserves the supported %s ms watchdog', async (value) => {
  expect(await streamTimeoutOverflow(value)).toEqual({
    configured: value,
    timers: value === 0 ? [] : [{ requested: value, effective: value }],
  });
});
