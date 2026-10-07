import type { TreeNode } from '@/stores/file-store';
import { treeRowId } from './tree-helpers.js';
import type { FlatRow } from './types.js';

/** What the file tree's keyboard navigation reads and drives. */
export interface TreeNavigationContext {
  rows: FlatRow[];
  focusedIdx: number;
  expandedDirs: ReadonlySet<string>;
  /** Move focus to row `i` and scroll it into view. */
  setFocus: (i: number) => void;
  toggleDir: (path: string) => void;
  handleOpen: (filePath: string) => void;
  handleSelect: (filePath: string) => void;
  setNodeMenu: (menu: { x: number; y: number; node: TreeNode }) => void;
}

/**
 * Roving-focus keyboard model for the file tree: arrows move and
 * expand/collapse, Enter opens, Space selects, Home/End jump, Shift+F10 or
 * the Menu key opens the row context menu.
 */
export function handleTreeNavigationKey(e: React.KeyboardEvent, ctx: TreeNavigationContext): void {
  const {
    rows,
    focusedIdx,
    expandedDirs,
    setFocus,
    toggleDir,
    handleOpen,
    handleSelect,
    setNodeMenu,
  } = ctx;
  if (rows.length === 0) return;
  const nextNav = (from: number, dir: 1 | -1): number => {
    let i = from + dir;
    while (i >= 0 && i < rows.length && rows[i]?.emptyPlaceholder) i += dir;
    return i < 0 || i >= rows.length ? from : i;
  };
  const cur = focusedIdx;
  const row = cur >= 0 && cur < rows.length ? rows[cur] : undefined;

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      setFocus(nextNav(cur, 1));
      break;
    case 'ArrowUp':
      e.preventDefault();
      setFocus(cur === -1 ? nextNav(rows.length, -1) : nextNav(cur, -1));
      break;
    case 'ArrowRight':
      if (!row || row.emptyPlaceholder) break;
      e.preventDefault();
      if (row.node.type === 'directory') {
        if (!expandedDirs.has(row.node.path)) toggleDir(row.node.path);
        else setFocus(nextNav(cur, 1));
      }
      break;
    case 'ArrowLeft': {
      if (!row || row.emptyPlaceholder) break;
      e.preventDefault();
      if (row.node.type === 'directory' && expandedDirs.has(row.node.path)) {
        toggleDir(row.node.path);
        break;
      }
      for (let i = cur - 1; i >= 0; i--) {
        const cand = rows[i];
        if (cand && !cand.emptyPlaceholder && cand.depth < row.depth) {
          setFocus(i);
          break;
        }
      }
      break;
    }
    case 'Enter':
      if (!row || row.emptyPlaceholder) break;
      e.preventDefault();
      if (row.node.type === 'directory') toggleDir(row.node.path);
      else handleOpen(row.node.path);
      break;
    case ' ':
      if (!row || row.emptyPlaceholder) break;
      e.preventDefault();
      if (row.node.type === 'directory') toggleDir(row.node.path);
      else handleSelect(row.node.path);
      break;
    case 'F10':
    case 'ContextMenu': {
      // Shift+F10 / Menu key — open the row context menu anchored at the
      // focused row, giving keyboard users the same actions as right-click.
      if (e.key === 'F10' && !e.shiftKey) break;
      if (!row || row.emptyPlaceholder) break;
      e.preventDefault();
      const rect = document.getElementById(treeRowId(row.node.path))?.getBoundingClientRect();
      setNodeMenu({
        x: rect?.left ?? window.innerWidth / 2,
        y: rect ? rect.bottom + 2 : window.innerHeight / 2,
        node: row.node,
      });
      break;
    }
    case 'Home':
      e.preventDefault();
      setFocus(nextNav(-1, 1));
      break;
    case 'End':
      e.preventDefault();
      setFocus(nextNav(rows.length, -1));
      break;
  }
}
