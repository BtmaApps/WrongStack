/**
 * Regression: the rest gate must never count a caller's own cancellation, but
 * the client wraps every fetch rejection — the caller's abort included — in
 * FetchError(status 0), which weighed 1 like a network error. Two cancelled
 * turns put TypeSafe to rest for every feature sharing the gate. The weight
 * now reads the wrapped cause (as activity.ts already does); real timeouts and
 * network failures still count.
 */
import { describe, expect, it } from 'vitest';
import { createTypeSafeClient } from '../src/typesafe/client.js';
import {
  createTypeSafeRestGate,
  typeSafeFailureWeight,
  withTypeSafeRest,
} from '../src/typesafe/rest.js';

/** fetch-like stub that never answers and rejects when its signal fires. */
const hangingFetch = ((_url: string, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    const onAbort = () => reject(signal?.reason ?? new DOMException('aborted', 'AbortError'));
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
  })) as typeof fetch;

const failingFetch = (async () => {
  throw new TypeError('fetch failed');
}) as unknown as typeof fetch;

async function twoCalls(
  fetchImpl: typeof fetch,
  opts: { timeoutMs: number; cancelAfterMs?: number },
): Promise<{ resting: boolean; weights: number[] }> {
  const gate = createTypeSafeRestGate();
  const client = withTypeSafeRest(
    createTypeSafeClient({ apiKey: 'k', fetchImpl, timeoutMs: opts.timeoutMs, maxAttempts: 1 }),
    gate,
  );
  const weights: number[] = [];
  for (let i = 0; i < 2; i++) {
    const ctrl = new AbortController();
    const pending = client
      .systemOne({ state: {}, questions: {} }, ctrl.signal)
      .catch((error: unknown) => error);
    if (opts.cancelAfterMs !== undefined) setTimeout(() => ctrl.abort(), opts.cancelAfterMs);
    weights.push(typeSafeFailureWeight(await pending));
  }
  return { resting: gate.isResting(), weights };
}

describe('TypeSafe rest gate and cancellation', () => {
  it('does not rest when the caller cancels in-flight requests', async () => {
    expect(await twoCalls(hangingFetch, { timeoutMs: 60_000, cancelAfterMs: 5 })).toEqual({
      resting: false,
      weights: [0, 0],
    });
  });

  it('still rests on two per-attempt timeouts', async () => {
    expect(await twoCalls(hangingFetch, { timeoutMs: 5 })).toEqual({
      resting: true,
      weights: [1, 1],
    });
  });

  it('still rests on two network failures', async () => {
    expect(await twoCalls(failingFetch, { timeoutMs: 60_000 })).toEqual({
      resting: true,
      weights: [1, 1],
    });
  });
});
