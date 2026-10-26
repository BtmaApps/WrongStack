import type { VisualGraph } from './graph-model';

/** Walk actual directed references, retaining shortest-hop distance and cycles safely. */
export function atlasImpact(
  graph: VisualGraph,
  root: string,
  depth: number,
  direction: 'incoming' | 'outgoing',
) {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const distances = new Map<string, number>();
  if (!ids.has(root)) return distances;
  distances.set(root, 0);
  const adjacent = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    const from = direction === 'incoming' ? e.target : e.source;
    const to = direction === 'incoming' ? e.source : e.target;
    adjacent.set(from, [...(adjacent.get(from) ?? []), to]);
  }
  const queue = [root];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]!;
    const hop = distances.get(current)!;
    if (hop >= depth) continue;
    for (const next of adjacent.get(current) ?? [])
      if (!distances.has(next)) {
        distances.set(next, hop + 1);
        queue.push(next);
      }
  }
  return distances;
}

export function atlasSubsystems(graph: VisualGraph) {
  const groups = new Map<string, typeof graph.nodes>();
  const owner = new Map(graph.nodes.map((n) => [n.id, n.group]));
  for (const node of graph.nodes) groups.set(node.group, [...(groups.get(node.group) ?? []), node]);
  return [...groups]
    .map(([name, nodes]) => ({
      name,
      nodes: [...nodes].sort(
        (a, b) =>
          Number(b.data['rank'] ?? 0) - Number(a.data['rank'] ?? 0) ||
          a.label.localeCompare(b.label),
      ),
      internal: graph.edges.filter(
        (e) => owner.get(e.source) === name && owner.get(e.target) === name,
      ).length,
      incoming: graph.edges.filter(
        (e) => owner.get(e.target) === name && owner.has(e.source) && owner.get(e.source) !== name,
      ).length,
      outgoing: graph.edges.filter(
        (e) => owner.get(e.source) === name && owner.has(e.target) && owner.get(e.target) !== name,
      ).length,
    }))
    .sort((a, b) => b.nodes.length - a.nodes.length || a.name.localeCompare(b.name));
}
