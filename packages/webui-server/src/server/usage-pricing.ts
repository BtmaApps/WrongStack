/** Additive estimate detail. Legacy stats.cost remains unchanged for older clients. */
export function usagePricing(
  usage: {
    input: number;
    output: number;
    cacheRead?: number | undefined;
    cacheWrite?: number | undefined;
  },
  model: unknown,
  customModelsDev?: unknown,
) {
  const object = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const cost = { ...object(object(model)['cost']), ...object(object(customModelsDev)['cost']) };
  const rate = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  const input = rate(cost['input']);
  const categories = [
    ['input', usage.input, rate(cost['input']), 'catalog'],
    ['output', usage.output, rate(cost['output']), 'catalog'],
    [
      'cache-read',
      usage.cacheRead ?? 0,
      cost['cache_read'] === undefined ? input : rate(cost['cache_read']),
      cost['cache_read'] === undefined ? 'input-fallback' : 'catalog',
    ],
    [
      'cache-write',
      usage.cacheWrite ?? 0,
      cost['cache_write'] === undefined ? input : rate(cost['cache_write']),
      cost['cache_write'] === undefined ? 'input-fallback' : 'catalog',
    ],
  ] as const;
  const parts = categories.map(([kind, rawTokens, rateUsdPerMillion, source]) => {
    const tokens = Number.isFinite(rawTokens) && rawTokens >= 0 ? rawTokens : 0;
    return {
      kind,
      tokens,
      rateUsdPerMillion,
      rateSource: rateUsdPerMillion === null ? 'unavailable' : source,
      estimateUsd: rateUsdPerMillion === null ? null : (tokens * rateUsdPerMillion) / 1_000_000,
    };
  });
  const known = parts.filter((part) => part.rateUsdPerMillion !== null).length;
  const knownCostUsd = known ? parts.reduce((sum, part) => sum + (part.estimateUsd ?? 0), 0) : null;
  return {
    currency: 'USD',
    basis: 'current-model-aggregate-rates',
    coverage: known === 4 ? 'complete' : known ? 'partial' : 'unavailable',
    estimateUsd:
      known && parts.every((part) => part.tokens === 0 || part.rateUsdPerMillion !== null)
        ? knownCostUsd
        : null,
    knownCostUsd,
    parts,
  };
}
