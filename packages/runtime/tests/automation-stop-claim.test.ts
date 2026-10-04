import { vi } from 'vitest';
import { AutomationService } from '../src/automation/service.js';

async function exercise(stopAt: 'none' | 'claim' | 'schedule', rejectClaim = false) {
  let entered!: () => void;
  let release!: () => void;
  const enteredPromise = new Promise<void>((r) => {
    entered = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const run = { id: 'run', leaseId: 'lease', jobId: 'job', subjectKey: 'default' };
  let claims = 0;
  const store = {
    directory: '/fixture',
    snapshot: vi.fn(async () => ({ runs: [], jobs: [] })),
    scheduleDue: vi.fn(async () => {
      if (stopAt === 'schedule') {
        entered();
        await gate;
      }
    }),
    claim: vi.fn(async () => {
      if (++claims > 1) return null;
      if (stopAt === 'claim') {
        entered();
        await gate;
      }
      if (rejectClaim) throw new Error('claim failure');
      return run;
    }),
    finish: vi.fn(async () => true),
  };
  const service = new AutomationService(store as never);
  const raw = service as unknown as { run: (r: unknown, s: AbortSignal) => Promise<void> };
  const dispatch = vi.spyOn(raw, 'run').mockResolvedValue(undefined);
  const ticking = service.tick(100);
  const settled = ticking.then(
    () => undefined,
    (error) => error,
  );
  let stopping: Promise<void> | undefined;
  if (stopAt !== 'none') {
    await enteredPromise;
    stopping = service.stop();
    release();
  }
  const error = await settled;
  await stopping;
  await service.idle();
  return { dispatches: dispatch.mock.calls.length, claims, finish: store.finish.mock.calls, error };
}

import { expect, it } from 'vitest';

it('verifies stop during claim, schedule, and failed claim', async () => {
  const claim = await exercise('claim');
  expect(claim.dispatches).toBe(0);
  expect(claim.finish).toEqual([['run', 'lease', { status: 'cancelled' }]]);
  const schedule = await exercise('schedule');
  expect(schedule.claims).toBe(0);
  expect(schedule.dispatches).toBe(0);
  const rejected = await exercise('claim', true);
  expect(rejected.error.message).toBe('claim failure');
  expect(rejected.dispatches).toBe(0);
  expect(rejected.finish).toHaveLength(0);
  const control = await exercise('none');
  expect(control.dispatches).toBe(1);
});
