import { describe, expect, it } from 'vitest';
import {
  buildCanvasGuidedTour,
  type CodeMapGraphResponse,
  collapseGraphClusters,
  computeBlastRadiusOverlay,
  findShortestPathBetweenNodes,
  inferGraphCommunities,
  layoutGraph,
  listGraphClusters,
  sliceCanvasExecutionFlow,
} from '../../src/components/codemap-model.js';

describe('Phase 4.2: WebUI CodeMap 2.0 — BFS Shortest Path & Louvain Subsystem Layout', () => {
  const sampleGraph: CodeMapGraphResponse = {
    nodes: [
      { id: 'a1', label: 'login.ts', kind: 'file', rank: 0.9 },
      { id: 'a2', label: 'session.ts', kind: 'file', rank: 0.7 },
      { id: 'a3', label: 'token.ts', kind: 'file', rank: 0.5 },
      { id: 'b1', label: 'invoice.ts', kind: 'file', rank: 0.8 },
      { id: 'b2', label: 'ledger.ts', kind: 'file', rank: 0.6 },
      { id: 'b3', label: 'stripe.ts', kind: 'file', rank: 0.4 },
    ],
    edges: [
      { source: 'a1', target: 'a2', weight: 5, refType: 'call' },
      { source: 'a2', target: 'a3', weight: 5, refType: 'call' },
      { source: 'a1', target: 'a3', weight: 4, refType: 'import' },
      { source: 'b1', target: 'b2', weight: 5, refType: 'call' },
      { source: 'b2', target: 'b3', weight: 5, refType: 'call' },
      { source: 'b1', target: 'b3', weight: 4, refType: 'import' },
      // Directed bridge from a2 -> b1
      { source: 'a2', target: 'b1', weight: 1, refType: 'call' },
    ],
  };

  it('finds shortest directed and undirected paths between nodes', () => {
    const forward = findShortestPathBetweenNodes(sampleGraph, 'a1', 'b3');
    expect(forward).not.toBeNull();
    expect(forward?.directed).toBe(true);
    expect(forward?.nodes.map((n) => n.id)).toEqual(['a1', 'a2', 'b1', 'b3']);

    // Reverse direction has no directed path, so 'auto' falls back to undirected
    const reverseDirectedOnly = findShortestPathBetweenNodes(sampleGraph, 'b3', 'a1', {
      mode: 'directed',
    });
    expect(reverseDirectedOnly).toBeNull();

    const reverseAuto = findShortestPathBetweenNodes(sampleGraph, 'b3', 'a1', {
      mode: 'auto',
    });
    expect(reverseAuto).not.toBeNull();
    expect(reverseAuto?.directed).toBe(false);
    expect(reverseAuto?.nodes.map((n) => n.id)).toEqual(['b3', 'b1', 'a2', 'a1']);
  });

  it('infers deterministic Louvain communities and separates ungrouped nodes into visual bands in subsystems layout', () => {
    const communities = inferGraphCommunities(sampleGraph);
    expect(communities.get('a1')).toBe(communities.get('a2'));
    expect(communities.get('a2')).toBe(communities.get('a3'));
    expect(communities.get('b1')).toBe(communities.get('b2'));
    expect(communities.get('b2')).toBe(communities.get('b3'));
    expect(communities.get('a1')).not.toBe(communities.get('b1'));

    const positioned = layoutGraph(sampleGraph, 'subsystems');
    const yById = new Map(positioned.map((p) => [p.node.id, p.position.y]));
    // Cluster A and Cluster B are placed in distinct horizontal bands (different Y coordinates)
    expect(yById.get('a1')).toBe(yById.get('a2'));
    expect(yById.get('b1')).toBe(yById.get('b2'));
    expect(yById.get('a1')).not.toBe(yById.get('b1'));
  });

  it('computes 0-hop, 1-hop, and 2-hop incoming blast radius overlays and builds a foundation-first guided tour', () => {
    const overlay = computeBlastRadiusOverlay(sampleGraph, ['b3']);
    expect([...overlay.direct]).toEqual(['b3']);
    expect([...overlay.firstHop].sort()).toEqual(['b1', 'b2']);
    expect([...overlay.secondHop]).toEqual(['a2']);
    expect(overlay.allImpacted.has('a2')).toBe(true);

    const tour = buildCanvasGuidedTour(sampleGraph, 6);
    expect(tour).toHaveLength(6);
    // Foundational leaf nodes (b3/a3 with high incoming, 0 outgoing) precede entry-point a1
    const idsInOrder = tour.map((s) => s.node.id);
    expect(idsInOrder.indexOf('b3')).toBeLessThan(idsInOrder.indexOf('a1'));
    expect(idsInOrder.indexOf('a3')).toBeLessThan(idsInOrder.indexOf('a1'));
    expect(tour[0]?.stage).toBe('foundation');
    expect(tour.find((s) => s.node.id === 'a1')?.stage).toBe('entry');

    const juniorTour = buildCanvasGuidedTour(sampleGraph, 6, 'junior');
    expect(juniorTour[0]?.explanation).toContain('Start here');

    const nonTechTour = buildCanvasGuidedTour(sampleGraph, 6, 'non-technical');
    expect(nonTechTour[0]?.explanation).toContain('Serves 9 upstream workflow(s)');

    const flow = sliceCanvasExecutionFlow(sampleGraph, 'a1', 4);
    expect(flow).not.toBeNull();
    expect(flow?.directed).toBe(true);
    expect(flow?.nodes.map((n) => n.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('collapses Louvain/subsystem clusters into container nodes and aggregates cross-cluster edges', () => {
    const clusters = listGraphClusters(sampleGraph);
    expect(clusters).toHaveLength(2);
    const firstCluster = clusters[0]!;
    expect(firstCluster.count).toBe(3);

    const collapsed = collapseGraphClusters(sampleGraph, new Set([firstCluster.name]));
    // 3 member nodes replaced by 1 container node -> 1 + 3 = 4 nodes total
    expect(collapsed.nodes).toHaveLength(4);
    const containerNode = collapsed.nodes.find((n) => n.id.startsWith('cluster-container:'));
    expect(containerNode).toBeDefined();
    expect(containerNode?.fileCount).toBe(3);

    // Bridge edge between the two clusters is preserved and points from/to the container
    const hasCrossEdge = collapsed.edges.some(
      (e) => e.source === containerNode?.id || e.target === containerNode?.id,
    );
    expect(hasCrossEdge).toBe(true);
  });
});
