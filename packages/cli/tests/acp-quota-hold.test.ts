import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearQuotaHolds, runWithQuotaHold } from '../src/fleet/acp-quota-hold.js';

afterEach(() => clearQuotaHolds());

const quota = {
  kind: 'provider_quota',
  message: 'claude-code: usage quota spent',
  retryable: false,
  backoffMs: 60_000,
};

describe('runWithQuotaHold', () => {
  it('holds an agent after a quota failure and fails at once until the reset', async () => {
    let t = 1_000_000;
    const now = () => t;
    const start = vi.fn(async () => {
      throw quota;
    });
    await expect(runWithQuotaHold('claude-code', start, now)).rejects.toBe(quota);

    t += 30_000;
    const again = vi.fn(async () => 'ran');
    await expect(runWithQuotaHold('claude-code', again, now)).rejects.toMatchObject({
      kind: 'provider_quota',
      retryable: false,
      backoffMs: 30_000,
      message: expect.stringContaining('not started: claude-code is held until'),
    });
    expect(again).not.toHaveBeenCalled();
    // Another agent is not held.
    await expect(runWithQuotaHold('codex-cli', again, now)).resolves.toBe('ran');

    t += 31_000;
    await expect(runWithQuotaHold('claude-code', again, now)).resolves.toBe('ran');
  });

  it('does not hold on any other failure', async () => {
    const other = { kind: 'provider_rate_limit', message: 'x', retryable: true, backoffMs: 1 };
    await expect(runWithQuotaHold('a', async () => Promise.reject(other))).rejects.toBe(other);
    await expect(runWithQuotaHold('a', async () => 'ok')).resolves.toBe('ok');
  });
});
