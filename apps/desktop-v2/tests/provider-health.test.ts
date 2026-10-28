import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { mergeQuotaSnapshots, QuotaReading, quotaPercent } from '../src/ProviderHealth';

describe('provider quota readings', () => {
  it('does not round a nearly exhausted account into a reported cutoff', () => {
    expect(quotaPercent(99.96)).toBe('99%');
    expect(quotaPercent(0)).toBe('0%');
    expect(quotaPercent(100)).toBe('100%');
    expect(quotaPercent(Number.NaN)).toBe('Not reported');
  });
  it('retains other providers when a live quota push contains one provider', () => {
    const first = { providerId: 'first', meterId: 'default' };
    const second = { providerId: 'second', meterId: 'default' };
    expect(
      mergeQuotaSnapshots([first, second], {
        providerId: 'first',
        snapshots: [{ ...first, capturedAt: 2 }],
      }),
    ).toEqual([second, { ...first, capturedAt: 2 }]);
    expect(mergeQuotaSnapshots([first, second], { snapshots: [] })).toEqual([]);
  });
  it('renders recorded quota, balance, gateway identity and estimates without inventing a reset', () => {
    const output = renderToStaticMarkup(
      createElement(QuotaReading, {
        snapshot: {
          providerId: 'gateway',
          meterId: 'account-one',
          via: 'relay',
          capturedAt: 1700000000000,
          windows: [{ id: 'monthly', usedPercent: 99.96 }],
          credits: { hasCredits: true, unlimited: false, balance: '$12.50' },
        },
      }),
    );
    expect(output).toContain('99%');
    expect(output).toContain('$12.50');
    expect(output).toContain('Pool account reported through');
    expect(output).toContain('Not reported');
    expect(output).toContain('recorded reading');
    expect(output).not.toContain('Limit reached');
  });
});
