/**
 * The System One recall filter may only DROP turn-context candidates, must
 * cost at most one request per user message, and must drop nothing when the
 * host is resting or failing.
 */

import type { TypeSafeJudge } from '@wrongstack/core/typesafe';
import { describe, expect, it, vi } from 'vitest';
import { createSystemOneRecallFilter } from '../src/retrieval/system-one-recall.js';
import type { Sage } from '../src/types.js';

const memory = (id: string, text: string): Sage =>
  ({ id, revision: 1, text, anchors: [], status: 'active' }) as unknown as Sage;

function judge(nouls: number[] | Error): TypeSafeJudge & { calls: () => number } {
  const systemOne = vi.fn(async () => {
    if (nouls instanceof Error) throw nouls;
    return {
      answers: Object.fromEntries(nouls.map((noul, i) => [`m${i}`, { type: 'noul', noul }])),
      usage: { inputTokens: 1, outputTokens: 0 },
    } as never;
  });
  return {
    feature: 'memoryRecall',
    model: 'jev-test',
    client: { systemOne },
    calls: () => systemOne.mock.calls.length,
  };
}

describe('createSystemOneRecallFilter', () => {
  const candidates = [memory('a', 'Config is frozen'), memory('b', 'The CI uses pnpm 10')];

  it('drops only the clearly unhelpful memory', async () => {
    const j = judge([0.9, 0.05]);
    const filter = createSystemOneRecallFilter({ getJudge: () => j });
    expect([...(await filter('why does setConfig throw?', candidates))]).toEqual(['b']);
  });

  it('asks once per message, however many tool-loop requests re-run it', async () => {
    const j = judge([0.9, 0.05]);
    const filter = createSystemOneRecallFilter({ getJudge: () => j });
    await filter('same message', candidates);
    await filter('same message', candidates);
    expect(j.calls()).toBe(1);
  });

  it('keeps everything when the host fails or no judge exists', async () => {
    const failing = createSystemOneRecallFilter({ getJudge: () => judge(new Error('resting')) });
    expect((await failing('q', candidates)).size).toBe(0);
    const absent = createSystemOneRecallFilter({ getJudge: () => undefined });
    expect((await absent('q', candidates)).size).toBe(0);
  });
});
