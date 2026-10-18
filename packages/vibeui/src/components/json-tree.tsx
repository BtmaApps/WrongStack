'use client';

import { useState } from 'react';
import type { JsonNode } from '../lib/code-content';

export function JsonTree({
  node,
  name = 'JSON',
  depth = 0,
}: {
  node: JsonNode;
  name?: string;
  depth?: number;
}) {
  const [open, setOpen] = useState(depth === 0);
  if ('raw' in node) {
    return (
      <div className="json-leaf">
        <span className="json-key">{name}</span>
        <span className={`json-${node.kind}`}>
          {node.kind === 'string' ? `"${String(JSON.parse(node.raw))}"` : node.raw}
        </span>
      </div>
    );
  }
  return (
    <details
      className="json-branch"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span className="json-key">{name}</span>{' '}
        <span className="json-summary">
          {node.kind === 'object' ? '{' : '['} {node.entries.length}{' '}
          {node.kind === 'object'
            ? node.entries.length === 1
              ? 'field'
              : 'fields'
            : node.entries.length === 1
              ? 'item'
              : 'items'}{' '}
          {node.kind === 'object' ? '}' : ']'}
        </span>
      </summary>
      {open && (
        <div className="json-children">
          {node.entries.map((entry, index) => (
            <JsonTree key={index} name={entry.key} node={entry.node} depth={depth + 1} />
          ))}
        </div>
      )}
    </details>
  );
}
