import { describe, expect, it } from 'vitest';
import { directMemoryEdges, memoryDate } from '../src/lib/memory-view';

describe('focused memory relationships', () => {
  it('retains incoming, outgoing and source links, excluding shared-anchor neighbors', () => {
    const own = [
      { from: 'mem:a', to: 'mem:b', relation: 'supports' },
      { from: 'mem:c', to: 'mem:a', relation: 'contradicts' },
      { from: 'mem:a', to: 'file:src/index.ts', relation: 'anchored_to' },
    ];
    const graph = [
      ...own,
      ...Array.from({ length: 100 }, (_, i) => ({
        from: 'file:src/index.ts',
        to: `mem:other-${i}`,
      })),
      { from: 'mem:b', to: 'mem:d' },
    ];
    expect(directMemoryEdges('a', graph)).toEqual(own);
    expect(directMemoryEdges('absent', graph)).toEqual([]);
  });
  it('removes duplicate and invalid links without merging distinct relation types', () => {
    const a = { from: 'mem:a', to: 'mem:b', relation: 'supports' };
    const b = { ...a, relation: 'supersedes' };
    expect(
      directMemoryEdges('a', [
        a,
        { ...a, id: 'duplicate' },
        b,
        { from: 'mem:a', to: 'mem:a' },
        { from: 'mem:a' },
        null,
      ]),
    ).toEqual([a, b]);
    expect(directMemoryEdges('a', undefined)).toEqual([]);
  });
  it('does not display invalid or absent dates', () => {
    expect(memoryDate('invalid')).toBe('Not reported');
    expect(memoryDate(undefined)).toBe('Not reported');
    expect(memoryDate('2026-10-17T12:00:00Z')).not.toBe('Not reported');
  });
});
