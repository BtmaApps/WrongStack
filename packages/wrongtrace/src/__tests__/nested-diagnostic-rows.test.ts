import { expect, it } from 'vitest';
import { getRecentActivity, summarizeFriction } from '../agent-helpers.js';
import type { WrongTraceClient } from '../types.js';

it.each([null, [], false, {}, 1, { author_model: 1, overwriter_model: 'b' }])(
  'ignores invalid friction entry %j',
  (bad) => {
    const valid = { author_model: 'a', overwriter_model: 'b' };
    expect(summarizeFriction({ edges: [bad] }).totalCollisions).toBe(0);
    expect(summarizeFriction([bad, valid]).totalCollisions).toBe(1);
    expect(summarizeFriction({ edges: [bad, valid], total_collisions: 5 }).totalCollisions).toBe(5);
  },
);
it('retains valid activity beside malformed event/collision entries', async () => {
  const event = { file_path: 'x', author_time: '2026-01-01T00:00:00Z', author_model: 'a' };
  const matrix = Object.assign([], {
    events: [null, [], false, {}, event],
    recent_collisions: [
      null,
      { ...event, overwriter_time: '2026-02-01T00:00:00Z', overwriter_model: 'b' },
    ],
  });
  const client = {
    isAvailable: true,
    getFrictionMatrix: async () => matrix,
  } as unknown as WrongTraceClient;
  expect(await getRecentActivity(client, 'x', 1)).toEqual([
    { at: '2026-02-01T00:00:00Z', actor: 'b', action: 'MODIFIED' },
  ]);
  expect(await getRecentActivity(client, 'missing')).toEqual([]);
  expect(await getRecentActivity(client, 'x', 0)).toEqual([]);
});
