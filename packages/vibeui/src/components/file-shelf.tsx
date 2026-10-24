'use client';

import { ChevronDown, Clock3, FileText, Pin, PinOff } from 'lucide-react';
import type { useFileShelf } from '../lib/use-file-shelf';

export function FileShelf({
  shelf,
  offline,
  onOpen,
}: {
  shelf: ReturnType<typeof useFileShelf>;
  offline: boolean;
  onOpen: (path: string) => void;
}) {
  const { pinned, recent, expanded } = shelf.data;
  const unpinnedRecent = recent.filter((path) => !pinned.includes(path));
  if (!shelf.ready || (!pinned.length && !recent.length)) return null;
  return (
    <details
      className="file-shelf"
      open={expanded}
      onToggle={(event) => {
        if (event.currentTarget.open !== expanded) shelf.setExpanded(event.currentTarget.open);
      }}
    >
      <summary>
        <Pin size={14} />
        <span>Handy files</span>
        <small>{pinned.length ? `${pinned.length} pinned` : 'Recently opened'}</small>
        <ChevronDown size={13} />
      </summary>
      <div className="file-shelf-content">
        {pinned.length > 0 && (
          <nav aria-label="Pinned files" className="file-shelf-pins">
            {pinned.map((path) => (
              <div className="file-shelf-item" key={path}>
                <button
                  type="button"
                  aria-label={`Open pinned ${path}`}
                  title={path}
                  disabled={offline}
                  onClick={() => onOpen(path)}
                >
                  <FileText size={15} />
                  <span>{path.replaceAll('\\', '/').split('/').at(-1)}</span>
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Unpin ${path}`}
                  title="Remove shortcut"
                  onClick={() => shelf.togglePin(path)}
                >
                  <PinOff size={13} />
                </button>
              </div>
            ))}
          </nav>
        )}
        {unpinnedRecent.length > 0 && (
          <nav aria-label="Recent files" className="file-shelf-recents">
            <span>
              <Clock3 size={12} /> Back to a recent file
            </span>
            {unpinnedRecent.map((path) => (
              <button
                type="button"
                key={path}
                aria-label={`Open recent ${path}`}
                title={path}
                disabled={offline}
                onClick={() => onOpen(path)}
              >
                {path.replaceAll('\\', '/').split('/').at(-1)}
              </button>
            ))}
            <button type="button" className="file-shelf-clear" onClick={shelf.clearRecent}>
              Clear recent shortcuts
            </button>
          </nav>
        )}
        {!pinned.length && <p>Choose “Keep handy” while reading to pin a file here.</p>}
      </div>
    </details>
  );
}
