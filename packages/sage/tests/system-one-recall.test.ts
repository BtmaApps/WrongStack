/**
 * The System One recall filter may only DROP turn-context candidates, must
 * cost at most one request per user message, and must drop nothing when the
 * host is resting or failing.
 */

import type { TypeSafeJudge } from '@wrongstack/core/typesafe';
import { describe, expect, it, vi } from 'vitest';
import { createSystemOneRecallFilter } from '../src/retrieval/system-one-recall.js';
import type { Sage } from '../src/types.js';

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

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

  it('never splits a surrogate pair in the capped text sent to the judge', async () => {
    // Memory text is conversation-derived, so astral characters reach the
    // caps routinely. A raw slice(0, cap) whose last kept unit is a high
    // surrogate sends ill-formed UTF-16 to the judge provider — the batch
    // rejects, the fail-open catch keeps every candidate, and the filter
    // silently stops working for that query (failures are never cached).
    const j = judge([0.05]);
    const filter = createSystemOneRecallFilter({ getJudge: () => j });
    const emoji = '😀';
    // Place each emoji's HIGH surrogate exactly on the last kept unit of
    // its cap (799 for MAX_MEMORY_CHARS=800, 3999 for MAX_QUERY_CHARS=4000).
    const text = `${'x'.repeat(799)}${emoji}y`;
    const query = `${'q'.repeat(3_999)}${emoji}z`;
    await filter(query, [memory('emoji', text)]);
    const request = (j.client.systemOne as unknown as { mock: { calls: Array<[unknown]> } }).mock
      .calls[0]?.[0] as { state: { userMessage: string; memories: string[] } };
    expect(request).toBeDefined();
    const sent = [request.state.userMessage, ...request.state.memories].join('\n');
    expect(LONE_SURROGATE.test(sent), 'judge request carries an ill-formed lone surrogate').toBe(
      false,
    );
  });
});
