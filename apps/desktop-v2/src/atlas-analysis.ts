import type { VisualGraph } from './graph-model';
export function dependencyPath(
  graph: VisualGraph,
  source: string,
  target: string,
): string[] | null {
  const ids = new Set(graph.nodes.map((node) => node.id));
  if (!ids.has(source) || !ids.has(target)) return null;
  const queue = [source],
    previous = new Map<string, string | null>([[source, null]]),
    outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const rows = outgoing.get(edge.source) ?? [];
    rows.push(edge.target);
    outgoing.set(edge.source, rows);
  }
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]!;
    if (current === target) {
      const result: string[] = [];
      let node: string | null = current;
      while (node !== null) {
        result.push(node);
        node = previous.get(node) ?? null;
      }
      return result.reverse();
    }
    for (const next of outgoing.get(current) ?? [])
      if (ids.has(next) && !previous.has(next)) {
        previous.set(next, current);
        queue.push(next);
      }
  }
  return null;
}
export function atlasTour(graph: VisualGraph) {
  return [...graph.nodes]
    .sort(
      (a, b) =>
        Number(b.data['rank'] ?? 0) - Number(a.data['rank'] ?? 0) ||
        graph.edges.filter((edge) => edge.source === b.id || edge.target === b.id).length -
          graph.edges.filter((edge) => edge.source === a.id || edge.target === a.id).length ||
        a.label.localeCompare(b.label),
    )
    .slice(0, 8);
}
