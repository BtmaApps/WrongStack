import { expect, it } from 'vitest';
import { refreshHandoff } from './helpers/oauth-refresh-handoff.js';

it.each(['pending', 'settled'] as const)(
  'shares token exchange and committed rotation with a %s sibling',
  async (mode) => {
    expect(await refreshHandoff(mode)).toEqual({
      calls: 1,
      persisted: 1,
      applied: 2,
      outcomes: ['fulfilled', 'fulfilled'],
    });
  },
);
