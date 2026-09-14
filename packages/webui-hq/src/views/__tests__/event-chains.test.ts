/**
 * W4 #4 phase 2 — correlation-chain grouping for the Events timeline.
 *
 * Pure function, so these tests pin the grouping semantics directly rather
 * than through a render. The two cases that carry real weight are the ones a
 * naive `groupBy(correlationId)` would get wrong: an id that reappears LATER
 * must not be folded into the first run (the timeline is in arrival order, and
 * merging would misreport what the operator saw), and a lone correlated row
 * must not claim to be a chain.
 *
 * @module tests/event-chains
 */

import { describe, expect, it } from 'vitest';
import { groupEventChains } from '../events.js';

type Row = { type?: string; correlationId?: string };

function chainsOf(events: readonly Row[]) {
  return groupEventChains(events as never);
}

describe('groupEventChains (W4 #4 phase 2)', () => {
  it('returns nothing for an empty timeline', () => {
    expect(chainsOf([])).toEqual([]);
  });

  it('passes an uncorrelated row through as a standalone', () => {
    const rows = chainsOf([{ type: 'session.snapshot' }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.chainId).toBeUndefined();
    expect(rows[0]?.isChainHead).toBe(false);
    expect(rows[0]?.chainSize).toBe(1);
  });

  it('marks the head and size of a consecutive run', () => {
    const rows = chainsOf([
      { type: 'brain.event', correlationId: 'req-1' },
      { type: 'brain.event', correlationId: 'req-1' },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.isChainHead).toBe(true);
    expect(rows[0]?.chainSize).toBe(2);
    expect(rows[0]?.chainId).toBe('req-1');
    // Only the head prints the id; the continuation still belongs to the chain.
    expect(rows[1]?.isChainHead).toBe(false);
    expect(rows[1]?.chainSize).toBe(2);
    expect(rows[1]?.chainId).toBe('req-1');
  });

  it('does NOT treat a lone correlated row as a chain', () => {
    // Labelling it would promise siblings that do not exist.
    const rows = chainsOf([{ type: 'brain.event', correlationId: 'req-solo' }]);
    expect(rows[0]?.chainId).toBeUndefined();
    expect(rows[0]?.isChainHead).toBe(false);
  });

  it('keeps a reappearing id as a SEPARATE chain, not one merged group', () => {
    // Arrival order is the timeline's meaning; folding these together would
    // pull the unrelated row in between into the middle of the chain.
    const rows = chainsOf([
      { type: 'brain.event', correlationId: 'req-1' },
      { type: 'brain.event', correlationId: 'req-1' },
      { type: 'session.snapshot' },
      { type: 'brain.event', correlationId: 'req-1' },
    ]);
    expect(rows.map((row) => row.chainSize)).toEqual([2, 2, 1, 1]);
    expect(rows.map((row) => row.isChainHead)).toEqual([true, false, false, false]);
    // The trailing mention stands alone, so it is not marked as a chain at all.
    expect(rows[3]?.chainId).toBeUndefined();
  });

  it('treats an empty-string id as absent rather than as a shared chain', () => {
    const rows = chainsOf([
      { type: 'a', correlationId: '' },
      { type: 'b', correlationId: '' },
    ]);
    expect(rows.every((row) => row.chainId === undefined)).toBe(true);
    expect(rows.every((row) => row.chainSize === 1)).toBe(true);
  });

  it('preserves input order', () => {
    const rows = chainsOf([
      { type: 'first' },
      { type: 'second', correlationId: 'c' },
      { type: 'third', correlationId: 'c' },
      { type: 'fourth' },
    ]);
    expect(rows.map((row) => row.event.type)).toEqual(['first', 'second', 'third', 'fourth']);
  });
});
