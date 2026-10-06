import { Folder, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react';
import type React from 'react';

/** File-manager title bar (list toggle, reload, close) and the file filter input. */
export function FileExplorerToolbar({
  fileListOpen,
  setFileListOpen,
  searchRef,
  closeRef,
  onReload,
  onClose,
  filter,
  setFilter,
}: {
  fileListOpen: boolean;
  setFileListOpen: (open: boolean) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  closeRef: React.RefObject<HTMLButtonElement | null>;
  onReload: () => void;
  onClose: () => void;
  filter: string;
  setFilter: (value: string) => void;
}) {
  return (
    <>
      <header className="file-explorer-head">
        <span>
          <Folder size={13} aria-hidden="true" /> FILES
        </span>
        <div className="file-explorer-head-actions">
          <button
            type="button"
            onClick={() => {
              const next = !fileListOpen;
              if (next) setTimeout(() => searchRef.current?.focus(), 0);
              setFileListOpen(next);
            }}
            aria-label={fileListOpen ? 'Collapse file list' : 'Expand file list'}
            title={fileListOpen ? 'Collapse file list' : 'Expand file list'}
          >
            {fileListOpen ? (
              <PanelLeftClose size={13} aria-hidden="true" />
            ) : (
              <PanelLeftOpen size={13} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={onReload}
            aria-label="Reload file tree"
            title="Reload file tree"
            className="file-explorer-reload"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
          <button type="button" onClick={onClose} aria-label="Close" ref={closeRef}>
            <X size={14} />
          </button>
        </div>
      </header>
      {fileListOpen && (
        <div className="file-manager-search">
          <Search size={12} aria-hidden="true" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Filter files…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter files"
            className="file-manager-search-input"
          />
          {filter && (
            <button
              type="button"
              className="file-manager-search-clear"
              onClick={() => setFilter('')}
              aria-label="Clear filter"
            >
              <X size={11} />
            </button>
          )}
        </div>
      )}
    </>
  );
}
