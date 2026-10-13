import { describe, expect, it } from 'vitest';
import {
  classifyAgentFailure,
  DEFAULT_QUOTA_HOLD_MS,
  parseQuotaResetAt,
} from '../src/integration/acp-agent-failure.js';

// 2026-10-13 10:00 local.
const NOW = new Date(2026, 9, 13, 10, 0, 0, 0).getTime();
const at = (h: number, m = 0, dayOffset = 0) =>
  new Date(2026, 9, 13 + dayOffset, h, m, 0, 0).getTime();

describe('classifyAgentFailure', () => {
  it("reads Claude's usage-limit error as a spent quota, held until its reset", () => {
    const err = classifyAgentFailure(
      {
        code: -32603,
        message: "Internal error: You've hit your limit · resets 3pm (Europe/Istanbul)",
        data: { errorKind: 'rate_limit' },
      },
      'claude-code',
      NOW,
    );
    expect(err).toEqual({
      kind: 'provider_quota',
      message:
        "claude-code: usage quota spent — You've hit your limit · resets 3pm (Europe/Istanbul)",
      retryable: false,
      backoffMs: at(15) - NOW,
    });
  });

  it('treats billing and on-hold accounts as spent, with a default hold', () => {
    for (const errorKind of ['billing_error', 'account_on_hold']) {
      expect(
        classifyAgentFailure(
          { code: -32603, message: 'Internal error', data: { errorKind } },
          'w',
          NOW,
        ),
      ).toMatchObject({
        kind: 'provider_quota',
        retryable: false,
        backoffMs: DEFAULT_QUOTA_HOLD_MS,
      });
    }
  });

  it('maps short rate limits, overload and sign-in failures to their retry policy', () => {
    const c = (errorKind: string, code = -32603) =>
      classifyAgentFailure({ code, message: 'Internal error: x', data: { errorKind } }, 'w', NOW);
    expect(c('rate_limit')).toMatchObject({ kind: 'provider_rate_limit', retryable: true });
    expect(c('overloaded')).toMatchObject({ kind: 'provider_5xx', retryable: true });
    expect(c('authentication_failed')).toMatchObject({ kind: 'provider_auth', retryable: false });
    expect(
      classifyAgentFailure({ code: -32000, message: 'Authentication required' }, 'w', NOW),
    ).toMatchObject({ kind: 'provider_auth' });
    expect(classifyAgentFailure({ code: -32603, message: 'Internal error: boom' }, 'w', NOW)).toBe(
      undefined,
    );
  });
});

describe('parseQuotaResetAt', () => {
  it('reads the reset clock time, rolling a past one to tomorrow', () => {
    expect(parseQuotaResetAt('resets 3pm', NOW)).toBe(at(15));
    expect(parseQuotaResetAt('resets at 14:30', NOW)).toBe(at(14, 30));
    expect(parseQuotaResetAt('resets 9am', NOW)).toBe(at(9, 0, 1));
    expect(parseQuotaResetAt('resets 12am', NOW)).toBe(at(0, 0, 1));
    expect(parseQuotaResetAt('Claude AI usage limit reached|1760356800', NOW)).toBe(1760356800000);
  });

  it('gives up on text without a usable time', () => {
    expect(parseQuotaResetAt("You've hit your limit", NOW)).toBeUndefined();
    expect(parseQuotaResetAt('resets 15', NOW)).toBeUndefined();
    expect(parseQuotaResetAt('resets 25:00', NOW)).toBeUndefined();
  });
});
