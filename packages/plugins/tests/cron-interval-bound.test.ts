import { afterEach, describe, expect, it, vi } from 'vitest';
import cronPlugin from '../src/cron/index.js';

/**
 * setTimeout clamps any delay above 2^31-1 ms to 1 ms. cron_schedule accepted
 * `intervalMs: 1e15`, so the job fired on every tick — hundreds of events a
 * second — instead of effectively never (audit 2026-09-15).
 */
function makeApi() {
  const registered: Array<{ name: string; inputSchema: any; execute: (i: any) => Promise<any> }> =
    [];
  return {
    registered,
    api: {
      tools: { register: vi.fn((tool) => registered.push(tool)) },
      config: { extensions: {} },
      extensions: { register: vi.fn(() => vi.fn()) },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      metrics: { counter: vi.fn(), histogram: vi.fn(), gauge: vi.fn() },
      emitCustom: vi.fn(),
      events: { emit: vi.fn(), on: vi.fn() },
      session: { append: vi.fn() },
    },
  };
}

describe('cron_schedule interval bound', () => {
  let teardown: (() => unknown) | undefined;
  afterEach(async () => {
    await teardown?.();
    teardown = undefined;
    vi.useRealTimers();
  });

  it('rejects an interval setTimeout cannot honour and arms no timer', async () => {
    vi.useFakeTimers();
    const { api, registered } = makeApi();
    await cronPlugin.setup(api as never);
    teardown = () => cronPlugin.teardown?.(api as never);
    const schedule = registered.find((t) => t.name === 'cron_schedule');
    if (!schedule) throw new Error('cron_schedule not registered');

    await expect(
      schedule.execute({ name: 'too-far', intervalMs: 1e15, action: 'ping' }),
    ).rejects.toThrow(/intervalMs must be <= 2147483647/);
    vi.advanceTimersByTime(50);
    expect(api.emitCustom).not.toHaveBeenCalledWith('cron:job_fired', expect.anything());

    expect(schedule.inputSchema.properties.intervalMs).toMatchObject({
      minimum: 1000,
      maximum: 2_147_483_647,
    });
  });

  it('still accepts the largest honourable interval', async () => {
    const { api, registered } = makeApi();
    await cronPlugin.setup(api as never);
    teardown = () => cronPlugin.teardown?.(api as never);
    const schedule = registered.find((t) => t.name === 'cron_schedule');
    await expect(
      schedule?.execute({ name: 'max', intervalMs: 2_147_483_647, action: 'ping' }),
    ).resolves.toMatchObject({ ok: true, intervalMs: 2_147_483_647 });
  });
});
