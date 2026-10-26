import { describe, expect, it } from 'vitest';
import { atlasImpact, atlasSubsystems } from '../src/atlas-views-model';
import { atlasGraph } from '../src/graph-model';

const graph = atlasGraph({
  nodes: [
    { id: 'a', label: 'app', kind: 'file', subsystem: 'UI' },
    { id: 'b', label: 'bridge', kind: 'file', subsystem: 'Runtime' },
    { id: 'c', label: 'core', kind: 'file', subsystem: 'Runtime' },
    { id: 'd', label: 'unrelated', kind: 'file', subsystem: 'Other' },
  ],
  edges: [
    { source: 'a', target: 'b' },
    { source: 'b', target: 'c' },
    { source: 'c', target: 'b' },
    { source: 'ghost', target: 'a' },
  ],
});
describe('Atlas view analysis', () => {
  it('separates dependents from dependencies, respecting depth and cycles', () => {
    expect([...atlasImpact(graph, 'c', 1, 'incoming')]).toEqual([
      ['c', 0],
      ['b', 1],
    ]);
    expect([...atlasImpact(graph, 'c', 2, 'incoming')]).toEqual([
      ['c', 0],
      ['b', 1],
      ['a', 2],
    ]);
    expect([...atlasImpact(graph, 'c', 5, 'outgoing')]).toEqual([
      ['c', 0],
      ['b', 1],
    ]);
    expect([...atlasImpact(graph, 'a', 0, 'outgoing')]).toEqual([['a', 0]]);
    expect([...atlasImpact(graph, 'missing', 2, 'incoming')]).toEqual([]);
  });
  it('counts actual cross-boundary references without fabricating connectivity', () => {
    const groups = atlasSubsystems(graph);
    expect(groups.map((g) => [g.name, g.nodes.length, g.internal, g.incoming, g.outgoing])).toEqual(
      [
        ['Runtime', 2, 2, 1, 0],
        ['Other', 1, 0, 0, 0],
        ['UI', 1, 0, 0, 1],
      ],
    );
    expect(atlasSubsystems({ nodes: [], edges: [] })).toEqual([]);
  });
});
