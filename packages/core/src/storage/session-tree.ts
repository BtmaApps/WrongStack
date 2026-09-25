/**
 * Order a session listing as a fork tree: every fork directly under its
 * parent, forks of forks one level deeper. Roots keep the listing's own order
 * (recency, as the stores return it) and so do the forks under one parent. A
 * fork whose parent is not in the listing (pruned, or past the page) is a
 * root: it must stay reachable.
 *
 * @module storage/session-tree
 */

export interface SessionTreeRow<T> {
  session: T;
  /** 0 for a root, 1 for a fork, 2 for a fork of a fork, … */
  depth: number;
  /** Last child of its parent (renders `└─` rather than `├─`). */
  lastSibling: boolean;
}

export function orderSessionTree<T extends { id: string; forkedFrom?: string | undefined }>(
  sessions: readonly T[],
): SessionTreeRow<T>[] {
  const ids = new Set(sessions.map((s) => s.id));
  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const s of sessions) {
    const parent = s.forkedFrom;
    if (parent !== undefined && parent !== s.id && ids.has(parent)) {
      const list = children.get(parent);
      if (list) list.push(s);
      else children.set(parent, [s]);
    } else {
      roots.push(s);
    }
  }

  const rows: SessionTreeRow<T>[] = [];
  const placed = new Set<string>();
  const visit = (s: T, depth: number, lastSibling: boolean): void => {
    if (placed.has(s.id)) return;
    placed.add(s.id);
    rows.push({ session: s, depth, lastSibling });
    const kids = children.get(s.id) ?? [];
    kids.forEach((kid, i) => {
      visit(kid, depth + 1, i === kids.length - 1);
    });
  };
  roots.forEach((r, i) => {
    visit(r, 0, i === roots.length - 1);
  });
  // A parent cycle (a → b → a) has no root; list those flat rather than lose them.
  for (const s of sessions) visit(s, 0, true);
  return rows;
}

/**
 * The `├─ ` / `└─ ` / `│  ` prefix for a row, given the rows above it. Depth
 * beyond 1 indents with the ancestors' continuation lines.
 */
export function sessionTreePrefix<T>(rows: readonly SessionTreeRow<T>[], index: number): string {
  const row = rows[index];
  if (!row || row.depth === 0) return '';
  // Walk up: for each ancestor level, draw `│  ` while that ancestor has
  // later siblings, spaces once it was the last.
  const parts: string[] = [];
  let level = row.depth - 1;
  for (let i = index - 1; i >= 0 && level > 0; i--) {
    const above = rows[i];
    if (above && above.depth === level) {
      parts.unshift(above.lastSibling ? '   ' : '│  ');
      level--;
    }
  }
  return `${parts.join('')}${row.lastSibling ? '└─ ' : '├─ '}`;
}
