import { describe, expect, it } from 'vitest';
import { atlasTour, dependencyPath } from '../src/atlas-analysis';
import { atlasGraph, placeGraph } from '../src/graph-model';

const graph = atlasGraph({
  nodes: ['a', 'b', 'c', 'd'].map((id, index) => ({
    id,
    label: id,
    kind: 'file',
    rank: index / 4,
  })),
  edges: [
    { source: 'a', target: 'b' },
    { source: 'b', target: 'c' },
    { source: 'a', target: 'c' },
    { source: 'c', target: 'a' },
  ],
});
describe('native atlas analysis', () => {
  it('traces the actual shortest directed route and handles cycles and disconnected nodes', () => {
    expect(dependencyPath(graph, 'a', 'c')).toEqual(['a', 'c']);
    expect(dependencyPath(graph, 'b', 'a')).toEqual(['b', 'c', 'a']);
    expect(dependencyPath(graph, 'a', 'd')).toBeNull();
    expect(dependencyPath(graph, 'd', 'd')).toEqual(['d']);
    expect(dependencyPath(graph, 'missing', 'a')).toBeNull();
  });
  it('orders a grounded architecture tour by reported centrality', () => {
    expect(atlasTour(graph).map((node) => node.id)).toEqual(['d', 'c', 'b', 'a']);
  });
  it('keeps every layout deterministic and finite even when dependencies cycle', () => {
    for (const layout of ['clusters', 'layers', 'orbit'] as const) {
      const nodes = placeGraph(graph, layout);
      expect(nodes).toEqual(placeGraph(graph, layout));
      expect(nodes).toHaveLength(4);
      expect(nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true);
    }
    expect(placeGraph(graph, 'orbit')).not.toEqual(placeGraph(graph, 'layers'));
  });
});
