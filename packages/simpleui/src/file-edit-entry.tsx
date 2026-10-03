import { Clock, FileEdit, Minus, Plus } from 'lucide-react';
import { memo } from 'react';
import { countDiffLines } from './lib/timeline-model.js';
import type { FileEditMeta } from './types.js';

interface FileEditEntryProps {
  /** The file edit metadata (one per file). */
  edit: FileEditMeta;
  /** ISO timestamp from the tool call that produced this edit. */
  ts?: string | undefined;
  /** Open the diff panel with this file's diff. */
  onOpenDiff: (meta: FileEditMeta) => void;
}

/** Format an ISO timestamp into a readable short form (HH:MM:SS). */
function formatTimestamp(ts: string | undefined): string {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

/** Human-readable label for the operation type. */
function opLabel(edit: FileEditMeta): string {
  if (edit.created) return 'CREATED';
  return 'EDITED';
}

/**
 * Inline file-edit widget for the chat timeline. One entry per file edit.
 * Shows the filename, operation type, line stats, and timestamp.
 * Clicking opens the FileDiffPanel for that file.
 */
export const FileEditEntry = memo(function FileEditEntry({
  edit,
  ts,
  onOpenDiff,
}: FileEditEntryProps) {
  const filename = edit.path.split(/[\\/]/).pop() ?? edit.path;
  const time = formatTimestamp(ts);
  const replacementCount = edit.replacements ?? 0;
  const hasDiff = !!edit.diff;

  // Count added/removed lines from the diff for the stats badges
  const { added, removed } = (edit.diff ? countDiffLines(edit.diff) : null) ?? {
    added: 0,
    removed: 0,
  };

  const label = opLabel(edit);

  return (
    <article className="message tool-message done">
      <div className="message-label">
        <span>{label}</span>
      </div>
      <div className="message-body">
        <button
          type="button"
          className="file-edit-entry"
          onClick={() => onOpenDiff(edit)}
          title={`View diff for ${filename}\n${edit.path}`}
        >
          <FileEdit size={14} aria-hidden="true" />
          <span className="file-edit-path" title={edit.path}>
            {filename}
          </span>
          {(added > 0 || removed > 0) && (
            <>
              {added > 0 && (
                <span className="file-edit-added">
                  <Plus size={10} aria-hidden="true" />
                  {added}
                </span>
              )}
              {removed > 0 && (
                <span className="file-edit-removed">
                  <Minus size={10} aria-hidden="true" />
                  {removed}
                </span>
              )}
            </>
          )}
          {replacementCount > 0 && added === 0 && removed === 0 && (
            <span className="file-edit-added">
              <Plus size={10} aria-hidden="true" />
              {replacementCount}
            </span>
          )}
          {edit.bytesWritten != null && edit.bytesWritten > 0 && (
            <span className="file-edit-bytes">
              {edit.bytesWritten > 1024
                ? `${(edit.bytesWritten / 1024).toFixed(1)} KB`
                : `${edit.bytesWritten} B`}
            </span>
          )}
          {hasDiff && <span className="file-edit-view">View diff →</span>}
          {time && (
            <span className="file-edit-time">
              <Clock size={10} aria-hidden="true" />
              {time}
            </span>
          )}
        </button>
      </div>
    </article>
  );
});
