import { expect, it } from 'vitest';
import { queueStartCapacity } from './helpers/queue-start-capacity.js';

it.each([false, true, 'error'] as const)(
  'reserves capacity while turn startup is pending and later returns %s',
  async (outcome) => {
    expect(await queueStartCapacity(100, outcome)).toEqual({
      accepted: false,
      length: outcome === true ? 99 : 100,
      first: outcome === true ? 'item-1' : 'item-0',
      other: true,
    });
  },
);

it('allows a new prompt inside the limit while preserving a failed start', async () => {
  expect(await queueStartCapacity(99, false)).toMatchObject({
    accepted: true,
    length: 100,
    first: 'item-0',
  });
});
