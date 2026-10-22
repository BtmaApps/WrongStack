import { expect, it } from 'vitest';
import { redirectBodyDisposal } from './helpers/redirect-body-disposal.js';

it.each(['protocol', 'private'] as const)(
  'releases the response body when rejecting a %s redirect',
  async (mode) => {
    const actual = await redirectBodyDisposal(mode);
    expect(actual).toMatchObject({ cancelled: 1, calls: 1, used: true });
    expect(actual.outcome).toMatch(mode === 'protocol' ? /non-HTTP/ : /private\/loopback/);
  },
);

it.each(['reject', 'throw'] as const)(
  'preserves the redirect error when cancellation can %s',
  async (failure) => {
    expect(await redirectBodyDisposal('protocol', failure)).toMatchObject({
      cancelled: 1,
      calls: 1,
      outcome: expect.stringContaining('non-HTTP'),
    });
  },
);

it('still drains an accepted redirect and follows it', async () => {
  expect(await redirectBodyDisposal('control')).toEqual({
    cancelled: 0,
    calls: 2,
    used: true,
    outcome: 'ok',
  });
});
