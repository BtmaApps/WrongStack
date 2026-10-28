import { DefaultTokenCounter } from '@wrongstack/core/infrastructure';
import { describe, expect, it } from 'vitest';
import { handleIntrospectionRoute } from '../src/server/introspection-routes.js';
import { usagePricing } from '../src/server/usage-pricing.js';

describe('explicit session pricing coverage', () => {
  const usage = { input: 1000, output: 100, cacheRead: 9000, cacheWrite: 200 };
  it('prices disjoint categories and labels the current-rate basis', () => {
    const result = usagePricing(usage, {
      cost: { input: 2, output: 4, cache_read: 0.2, cache_write: 3 },
    });
    expect(result.coverage).toBe('complete');
    expect(result.basis).toBe('current-model-aggregate-rates');
    expect(result.estimateUsd).toBeCloseTo(0.0048, 8);
    expect(result.parts.map((part) => part.tokens)).toEqual([1000, 100, 9000, 200]);
  });
  it('distinguishes unknown prices, partial rates and explicitly free models', () => {
    expect(usagePricing(usage, {}).estimateUsd).toBeNull();
    expect(usagePricing(usage, {}).knownCostUsd).toBeNull();
    const partial = usagePricing(usage, { cost: { input: 2 } });
    expect(partial.coverage).toBe('partial');
    expect(partial.estimateUsd).toBeNull();
    expect(partial.parts[1]?.rateUsdPerMillion).toBeNull();
    const free = usagePricing(usage, { cost: { input: 0, output: 0 } });
    expect(free.coverage).toBe('complete');
    expect(free.estimateUsd).toBe(0);
  });
  it('merges saved model price overrides and identifies cache input-rate fallback', () => {
    const result = usagePricing(
      usage,
      { cost: { input: 2, output: 4 } },
      { cost: { input: 1, cache_read: 0 } },
    );
    expect(result.parts[0]?.rateUsdPerMillion).toBe(1);
    expect(result.parts[1]?.rateUsdPerMillion).toBe(4);
    expect(result.parts[2]).toMatchObject({ rateUsdPerMillion: 0, rateSource: 'catalog' });
    expect(result.parts[3]).toMatchObject({ rateUsdPerMillion: 1, rateSource: 'input-fallback' });
  });
  it.each([-1, Infinity, NaN])('does not treat invalid rate %s as a free price', (input) => {
    const result = usagePricing(usage, { cost: { input, output: 4 } });
    expect(result.parts[0]?.rateUsdPerMillion).toBeNull();
    expect(result.estimateUsd).toBeNull();
  });
  it('returns the asking session counters, keeping last provider request distinct from a changed context snapshot', async () => {
    const owner = new DefaultTokenCounter();
    owner.account({ input: 100, output: 5 }, 'model', 'local');
    owner.account({ input: 120, output: 20, cacheRead: 480 }, 'model', 'local');
    owner.setCurrentRequestTokens(30, 0, 0);
    const other = new DefaultTokenCounter();
    other.account({ input: 9999, output: 9999 });
    const agent = (counter: DefaultTokenCounter) => ({
      ctx: {
        provider: { id: 'local' },
        model: 'model',
        tokenCounter: counter,
        messages: [],
        readFiles: new Set(),
        sideEffects: [],
      },
      tools: { list: () => [] },
    });
    const sent: Array<{ payload: Record<string, unknown> }> = [];
    await handleIntrospectionRoute(
      {
        agent: agent(other) as never,
        getAgent: (id) => (id === 'owner' ? (agent(owner) as never) : undefined),
        getConfig: () =>
          ({
            providers: {
              local: {
                customModels: {
                  model: { modelsDev: { cost: { input: 2, output: 4, cache_read: 0.2 } } },
                },
              },
            },
          }) as never,
        getProjectRoot: () => '.',
        getSessionId: () => 'other',
        getSessionStartedAt: () => Date.now(),
        getModeId: () => 'default',
        send: (_ws, frame) => sent.push(frame as never),
      },
      {} as never,
      { type: 'stats.get', payload: { sessionId: 'owner', requestId: 'usage-owner' } },
    );
    expect(sent[0]?.payload).toMatchObject({
      sessionId: 'owner',
      requestId: 'usage-owner',
      usage: { input: 220, output: 25, cacheRead: 480 },
      currentRequest: { input: 30, cacheRead: 0 },
      cache: { last: { input: 120, cacheRead: 480, hitRatio: 0.8 } },
      pricing: { coverage: 'complete' },
    });
    expect((sent[0]!.payload['cache'] as { hitRatio: number }).hitRatio).toBeCloseTo(480 / 700);
  });
});
