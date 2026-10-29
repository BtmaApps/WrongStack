import type { FileNode } from './file-model';

export interface TreeRow {
  node: FileNode;
  depth: number;
  open: boolean;
}

/**
 * Rows the tree shows, in order. Matching is one pass over the tree: a node is
 * kept when its path matches or any descendant does, and a search opens every
 * kept folder so each match is reachable.
 */
export function visibleTreeRows(
  tree: readonly FileNode[],
  expanded: ReadonlySet<string>,
  query: string,
): TreeRow[] {
  const needle = query.trim().toLowerCase();
  const kept = new Set<FileNode>();
  if (needle) {
    const visit = (node: FileNode): boolean => {
      let hit = node.path.toLowerCase().includes(needle);
      for (const child of node.children) if (visit(child)) hit = true;
      if (hit) kept.add(node);
      return hit;
    };
    for (const node of tree) visit(node);
  }
  const rows: TreeRow[] = [];
  const walk = (nodes: readonly FileNode[], depth: number) => {
    for (const node of nodes) {
      if (needle && !kept.has(node)) continue;
      const open = node.type === 'directory' && (Boolean(needle) || expanded.has(node.path));
      rows.push({ node, depth, open });
      if (open) walk(node.children, depth + 1);
    }
  };
  walk(tree, 0);
  return rows;
}

/** Index range of rows to render for a scroll position, with overscan on both sides. */
export function treeWindow(
  count: number,
  scrollTop: number,
  viewport: number,
  rowHeight: number,
  overscan = 12,
): { start: number; end: number } {
  if (count <= 0 || rowHeight <= 0) return { start: 0, end: 0 };
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const visible = Math.ceil(Math.max(viewport, rowHeight) / rowHeight);
  return {
    start: Math.max(0, first - overscan),
    end: Math.min(count, first + visible + overscan),
  };
}
