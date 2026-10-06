import { File, Folder, FolderOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  type FileNode,
  isPathInsideDirectory,
  nodeOrDescendantMatches,
} from './file-explorer-model.js';

/** One row of the project tree (recursive), with filter-driven auto-expansion. */
export function FileTreeNode({
  node,
  depth,
  onSelect,
  selectedPath,
  filter,
}: {
  node: FileNode;
  depth: number;
  onSelect: (path: string) => void;
  selectedPath: string | null;
  filter: string;
}) {
  const [expanded, setExpanded] = useState(() => isPathInsideDirectory(selectedPath, node.path));
  const hasChildren = node.type === 'directory' && node.children && node.children.length > 0;
  const isSelected = node.type === 'file' && node.path === selectedPath;

  // When a persisted selection is restored, reveal its ancestor chain the
  // next time the otherwise-collapsed file list is opened.
  useEffect(() => {
    if (node.type === 'directory' && isPathInsideDirectory(selectedPath, node.path)) {
      setExpanded(true);
    }
  }, [node.path, node.type, selectedPath]);

  // Auto-expand to reveal matching search results. Expanding only the root
  // left a match nested two+ levels deep hidden behind its collapsed
  // ancestors — expand every directory on the matching path instead.
  useEffect(() => {
    if (
      filter &&
      node.type === 'directory' &&
      nodeOrDescendantMatches(node, filter.toLowerCase())
    ) {
      setExpanded(true);
    }
  }, [filter, node]);

  // Skip hidden directories in the root
  if (depth === 0 && node.type === 'directory' && node.name.startsWith('.')) {
    return null;
  }

  const filterLower = filter.toLowerCase();
  const nameMatch = filter && node.name.toLowerCase().includes(filterLower);
  const childMatch = filter && node.children?.some((c) => nodeOrDescendantMatches(c, filterLower));

  if (filter && !nameMatch && !childMatch && depth > 0) return null;

  return (
    <>
      <button
        type="button"
        className={`file-tree-node${isSelected ? ' selected' : ''}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => {
          if (node.type === 'directory') setExpanded((v) => !v);
          else onSelect(node.path);
        }}
      >
        {node.type === 'directory' ? (
          hasChildren ? (
            expanded ? (
              <ChevronDown size={11} aria-hidden="true" />
            ) : (
              <ChevronRight size={11} aria-hidden="true" />
            )
          ) : (
            <span style={{ width: 11 }} />
          )
        ) : (
          <span style={{ width: 11 }} />
        )}
        {node.type === 'directory' ? (
          expanded ? (
            <FolderOpen size={12} aria-hidden="true" />
          ) : (
            <Folder size={12} aria-hidden="true" />
          )
        ) : (
          <File size={12} aria-hidden="true" />
        )}
        <span title={node.path}>{node.name}</span>
      </button>
      {expanded &&
        hasChildren &&
        node.children?.map((child) => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            onSelect={onSelect}
            selectedPath={selectedPath}
            filter={filter}
          />
        ))}
    </>
  );
}

// ── Inline SVG icons used inside the component tree ──────────────

function ChevronDown({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChevronRight({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
