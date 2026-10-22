import { expect, it } from 'vitest';
import { readBodyCapped } from '../src/read-body.js';
import { cappedBodyCancellation } from './helpers/capped-body-cancel.js';

it.each([0, 2])(
  'rejects a body above %s bytes before upstream cancellation finishes',
  async (cap) => {
    const actual = await cappedBodyCancellation(cap);
    expect(actual.beforeCleanup).toContain(`exceeded ${cap} bytes`);
    expect(actual.locked).toBe(false);
  },
);

it('accepts an exact-cap body and an empty zero-cap body', async () => {
  expect(await readBodyCapped(new Response('ok'), 2)).toBe('ok');
  expect(await readBodyCapped(new Response(''), 0)).toBe('');
});
