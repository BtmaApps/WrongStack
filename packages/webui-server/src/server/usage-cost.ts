/**
 * Token-usage cost math for the WebUI server.
 *
 * models.dev pricing is expressed in **dollars per 1,000,000 tokens**, and
 * providers omit the field entirely for free/unmetered plans. Both the
 * `session.start` payload (which ships the per-token rates to the client) and
 * `stats.get` (which reports an actual dollar figure) repeated the same
 * "read `model.cost.*` with a `?? 0` fallback, then divide by 1e6" logic
 * inline. Pulling it here keeps the rate normalization and the cost formula in
 * one tested place — a wrong field name or a missing `/ 1e6` silently produces
 * a plausible-but-wrong number, which is exactly what a unit test should pin.
 */

/** Per-1,000,000-token pricing, normalized to numbers (0 when unpriced). */
export interface CostRates {
  /** $ per 1M input tokens. */
  input: number;
  /** $ per 1M output tokens. */
  output: number;
  /** $ per 1M cache-read tokens (the input rate when the catalog has none). */
  cacheRead: number;
  /**
   * $ per 1M cache-written tokens (the input rate when the catalog has none).
   * Optional for callers built before it existed; absent counts as 0.
   */
  cacheWrite?: number | undefined;
}

/** Token counts for a turn/session. The cache counts are optional (older counters). */
export interface TokenUsage {
  input: number;
  output: number;
  cacheRead?: number | undefined;
  cacheWrite?: number | undefined;
}

function safeNonNegative(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Normalize a models.dev model object's pricing into {@link CostRates}.
 * Missing model or missing `cost` yields 0 — free/unmetered plans report `$0`
 * rather than crashing. A missing cache price falls back to the input price.
 */
export function getCostRates(model: unknown): CostRates {
  const cost = (
    model as
      | {
          cost?: {
            input?: number | undefined;
            output?: number | undefined;
            cache_read?: number | undefined;
            cache_write?: number | undefined;
          };
        }
      | null
      | undefined
  )?.cost;
  // Usage counts cache tokens OUTSIDE `input`; without a cache price they are
  // still billed, at the input rate — never for free.
  const input = safeNonNegative(cost?.input);
  const output = safeNonNegative(cost?.output);
  const cacheRead = cost?.cache_read != null ? safeNonNegative(cost.cache_read) : input;
  const cacheWrite = cost?.cache_write != null ? safeNonNegative(cost.cache_write) : input;

  return {
    input,
    output,
    cacheRead,
    cacheWrite,
  };
}

/**
 * Dollar cost of `usage` at the given per-1M-token `rates`. Returns 0 when all
 * rates are 0 (unpriced plan).
 */
export function computeUsageCost(usage: TokenUsage, rates: CostRates): number {
  if (!usage || typeof usage !== 'object') return 0;
  const input = safeNonNegative(usage.input);
  const output = safeNonNegative(usage.output);
  const cacheRead = safeNonNegative(usage.cacheRead);
  const cacheWrite = safeNonNegative(usage.cacheWrite);

  const rateInput = safeNonNegative(rates?.input);
  const rateOutput = safeNonNegative(rates?.output);
  const rateCacheRead = safeNonNegative(rates?.cacheRead);
  const rateCacheWrite = safeNonNegative(rates?.cacheWrite);

  return (
    (input * rateInput +
      output * rateOutput +
      cacheRead * rateCacheRead +
      cacheWrite * rateCacheWrite) /
    1_000_000
  );
}
