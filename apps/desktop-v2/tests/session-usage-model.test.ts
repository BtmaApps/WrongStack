import { describe, expect, it } from 'vitest';
import { usagePricing } from '../../../packages/webui-server/src/server/usage-pricing';
import { inlineUsageEstimate, usageMoney, usageSnapshot } from '../src/session-usage-model';

function payload() {
  const usage = { input: 220, output: 25, cacheRead: 480, cacheWrite: 0 };
  return {
    sessionId: 'owner',
    provider: 'local',
    model: 'model',
    usage,
    cache: {
      readTokens: 480,
      writeTokens: 0,
      hitRatio: 480 / 700,
      savedUsd: 0,
      last: { input: 120, cacheRead: 480, cacheWrite: 0, hitRatio: 0.8 },
      providers: [
        { provider: 'local', input: 220, cacheRead: 480, cacheWrite: 0, hitRatio: 480 / 700 },
      ],
    },
    currentRequest: { input: 30, cacheRead: 0, cacheWrite: 0 },
    pricing: usagePricing(usage, { cost: { input: 2, output: 4, cache_read: 0.2 } }),
  };
}
describe('conversation usage presentation', () => {
  it('keeps unknown or legacy zero prices out of the resting chat cost chip', () => {
    expect(inlineUsageEstimate({ cost: 0 })).toBeUndefined();
    expect(
      inlineUsageEstimate({ cost: 0, pricing: { estimateUsd: null, coverage: 'unavailable' } }),
    ).toBeUndefined();
    expect(inlineUsageEstimate({ pricing: { estimateUsd: 0, coverage: 'complete' } })).toBe(0);
    expect(inlineUsageEstimate({ cost: 0.25 })).toBe(0.25);
  });
  it('keeps cumulative traffic, last provider request and current context separate', () => {
    const result = usageSnapshot(payload(), 'owner');
    expect(result.total).toBe(725);
    expect(result.last?.cacheRead).toBe(480);
    expect(result.last?.hitRatio).toBe(0.8);
    expect(result.current?.input).toBe(30);
    expect(result.cache.hitRatio).toBeCloseTo(480 / 700);
    expect(result.cache.write5m).toBeNull();
    expect(result.cache.write1h).toBeNull();
    expect(result.cache.providers[0]?.input).toBe(220);
  });
  it('does not equate a legacy $0 estimate, absent pricing or partial prices with a free model', () => {
    const input: Record<string, unknown> = payload();
    delete input['pricing'];
    input['cost'] = 0;
    expect(usageSnapshot(input, 'owner').pricing).toBeNull();
    input['pricing'] = usagePricing(payload().usage, {});
    expect(usageSnapshot(input, 'owner').pricing?.estimateUsd).toBeNull();
    input['pricing'] = usagePricing(payload().usage, { cost: { input: 0, output: 0 } });
    expect(usageSnapshot(input, 'owner').pricing?.estimateUsd).toBe(0);
    expect(usageMoney(null)).toBe('Unavailable');
    expect(usageMoney(0)).toBe('$0.0000');
  });
  it('refuses other sessions and invalid token counters', () => {
    expect(() => usageSnapshot(payload(), 'other')).toThrow('another conversation');
    expect(() => usageSnapshot({ ...payload(), usage: { input: -1, output: 5 } }, 'owner')).toThrow(
      'incomplete',
    );
  });
  it('rejects invented complete pricing and false zero values for unknown rates', () => {
    const input = payload();
    input.pricing = usagePricing(input.usage, {});
    input.pricing.estimateUsd = 0;
    expect(() => usageSnapshot(input, 'owner')).toThrow('inconsistent');
    input.pricing.estimateUsd = null;
    input.pricing.coverage = 'complete';
    expect(() => usageSnapshot(input, 'owner')).toThrow('inconsistent');
  });
  it('rejects mismatched price categories and arithmetic without displaying fabricated totals', () => {
    const input = payload();
    input.pricing.parts[0]!.tokens = 999;
    expect(() => usageSnapshot(input, 'owner')).toThrow('invalid pricing');
    input.pricing = payload().pricing;
    input.pricing.parts[0]!.estimateUsd = 500;
    expect(() => usageSnapshot(input, 'owner')).toThrow('inconsistent');
  });
});
