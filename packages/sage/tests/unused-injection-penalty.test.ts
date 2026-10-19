import { describe, expect, it } from 'vitest';
import {
  computeInjectionProof,
  DEFAULT_MIN_SCORE,
} from '../src/middleware/tool-call-memory-scoring.js';
import type { Sage } from '../src/types.js';

function memory(injectionCount: number, useCount = 0): Sage {
  return {
    id: 'm',
    revision: 1,
    scope: 'project',
    kind: 'file_note',
    status: 'active',
    persistence: 'long_lived',
    text: 'A well anchored, important file note.',
    importance: 0.85,
    confidence: 0.85,
    freshness: 0.9,
    tags: [],
    anchors: [{ type: 'file', path: 'src/a.ts' }],
    sources: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    injectionCount,
    useCount,
  } as unknown as Sage;
}

/** The penalty as `computeInjectionProof` applies it (0 when absent). */
function unusedInjectionPenalty(injections: number, uses: number): number {
  const term = computeInjectionProof(memory(injections, uses), 0.9).terms.find((item) =>
    item.label.startsWith('unused after'),
  );
  return term ? -term.value : 0;
}

describe('unused injection penalty', () => {
  it('keeps growing with sustained non-use instead of saturating', () => {
    expect(unusedInjectionPenalty(2, 0)).toBe(0);
    expect(unusedInjectionPenalty(50, 0)).toBeCloseTo(0.18);
    expect(unusedInjectionPenalty(500, 0)).toBeGreaterThan(unusedInjectionPenalty(50, 0));
    expect(unusedInjectionPenalty(5_000, 0)).toBeGreaterThan(unusedInjectionPenalty(500, 0));
    expect(unusedInjectionPenalty(1_000_000, 0)).toBeLessThanOrEqual(0.43);
  });

  it('lifts entirely after a single recorded use', () => {
    expect(unusedInjectionPenalty(10_000, 1)).toBe(0);
  });

  it('drops a perfectly matched memory below the gate after thousands of unused injections', () => {
    expect(computeInjectionProof(memory(0), 0.98).score).toBeGreaterThan(DEFAULT_MIN_SCORE);
    expect(computeInjectionProof(memory(10_000), 0.98).score).toBeLessThan(DEFAULT_MIN_SCORE);
    expect(computeInjectionProof(memory(10_000, 3), 0.98).score).toBeGreaterThan(DEFAULT_MIN_SCORE);
  });
});
