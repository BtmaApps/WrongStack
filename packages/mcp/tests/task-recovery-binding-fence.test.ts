import { expect, it } from 'vitest';
import { taskBindingFence } from './helpers/task-binding-fence.js';

it.each(['dispose', 'owner', 'abort'] as const)(
  'does not issue a tool call when %s invalidates a pending task binding',
  async (mode) => {
    expect(await taskBindingFence(mode)).toMatchObject({ calls: 0 });
  },
);

it('allows a tool call when the task binding owner stays current', async () => {
  expect(await taskBindingFence('control')).toEqual({ calls: 1, outcome: 'completed' });
});
