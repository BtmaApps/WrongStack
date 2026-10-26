import { describe, expect, it } from 'vitest';
import { sageRelationModel } from '../src/sage-relation-model';

describe('SAGE persisted relationship map', () => {
  it('never invents relations between records that share a tag', () => {
    const graph = sageRelationModel(
      [
        { id: 'a', preview: 'One', tags: ['same'] },
        { id: 'b', preview: 'Two', tags: ['same'] },
      ],
      [],
    );
    expect(graph.nodes.map((n) => n.id)).toEqual(['mem:a', 'mem:b']);
    expect(graph.edges).toEqual([]);
  });
  it('retains real direction, type and resource endpoints and deduplicates stored edges', () => {
    const edges = [
      { from: 'mem:a', to: 'mem:b', relation: 'supports', weight: 0.8 },
      { from: 'mem:b', to: 'file:src/main.ts', relation: 'anchored_to' },
    ];
    const graph = sageRelationModel(
      [{ id: 'a', preview: 'Bounded preview', kind: 'decision', status: 'stale' }],
      [...edges, edges[0]],
    );
    expect(graph.edges).toHaveLength(2);
    expect(graph.edges[0]).toMatchObject({
      source: 'mem:a',
      target: 'mem:b',
      label: 'supports',
      weight: 0.8,
    });
    expect(graph.nodes.find((n) => n.id === 'mem:b')?.recordId).toBe('b');
    expect(graph.nodes.find((n) => n.id === 'file:src/main.ts')?.kind).toBe('file');
    expect(graph.nodes[0]).toMatchObject({ label: 'Bounded preview', status: 'stale' });
  });
});
