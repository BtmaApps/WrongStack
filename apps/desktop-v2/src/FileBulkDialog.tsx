import { useRef, useState } from 'react';
import { bulkDestination, bulkSummary, runBulk, topLevelPaths } from './file-bulk';
import { Modal } from './Modal';

/**
 * Confirms and runs a move or delete over the selected files and folders, one engine
 * operation per item, then reports exactly which items changed.
 */
export function FileBulkDialog({
  kind,
  paths,
  initialTarget,
  isDirectory,
  hasUnsaved,
  move,
  remove,
  onClose,
  onFinished,
}: {
  kind: 'move' | 'delete';
  paths: string[];
  initialTarget: string;
  isDirectory: (path: string) => boolean;
  hasUnsaved: (path: string) => boolean;
  move: (path: string, destination: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
  onClose: () => void;
  onFinished: (summary: string, changed: string[]) => void;
}) {
  const items = topLevelPaths(paths);
  const [target, setTarget] = useState(initialTarget);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const cancelled = useRef(false);
  const unsaved = items.filter(hasUnsaved);
  const destination = bulkDestination(target);
  const intoItself = items.filter(
    (path) =>
      kind === 'move' &&
      isDirectory(path) &&
      (destination === path || destination.startsWith(`${path}/`)),
  );
  const blocked = unsaved.length > 0 || intoItself.length > 0;
  const start = async () => {
    if (blocked || running) return;
    setRunning(true);
    setError('');
    cancelled.current = false;
    try {
      const outcome = await runBulk(
        items,
        (path) => (kind === 'move' ? move(path, destination) : remove(path)),
        () => cancelled.current,
      );
      onFinished(
        bulkSummary(kind === 'move' ? 'Moved' : 'Deleted', items.length, outcome),
        outcome.done,
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setRunning(false);
    }
  };
  return (
    <Modal
      onClose={() => {
        if (running) cancelled.current = true;
        else onClose();
      }}
    >
      <form
        className="file-bulk-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          void start();
        }}
      >
        <h2 id="dialog-title">
          {kind === 'move' ? 'Move' : 'Delete'} {items.length} selected{' '}
          {items.length === 1 ? 'item' : 'items'}
        </h2>
        <ul aria-label="Selected items">
          {items.map((path) => (
            <li key={path}>
              {path}
              {isDirectory(path) ? '/' : ''}
            </li>
          ))}
        </ul>
        {paths.length > items.length && (
          <p className="field-help">
            Items inside a selected folder are included with that folder.
          </p>
        )}
        {kind === 'move' ? (
          <label>
            Destination folder (project-relative; empty is the project root)
            <input
              aria-label="Bulk move destination"
              value={target}
              disabled={running}
              onChange={(event) => setTarget(event.target.value)}
            />
          </label>
        ) : (
          <p>
            Selected folders are deleted with their contents. Each item is deleted separately; the
            result lists any that fail.
          </p>
        )}
        {unsaved.length > 0 && (
          <p role="alert" className="session-error">
            Save or close edited files first: {unsaved.join(', ')}.
          </p>
        )}
        {intoItself.length > 0 && (
          <p role="alert" className="session-error">
            A folder cannot move into itself: {intoItself.join(', ')}.
          </p>
        )}
        {error && (
          <p role="alert" className="session-error">
            {error}
          </p>
        )}
        <footer>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              if (running) cancelled.current = true;
              else onClose();
            }}
          >
            {running ? 'Stop after current item' : 'Cancel'}
          </button>
          <button
            type="submit"
            className={`button ${kind === 'delete' ? 'danger' : 'primary'}`}
            disabled={blocked || running}
          >
            {running
              ? 'Working…'
              : kind === 'move'
                ? `Move ${items.length} to ${destination === '.' ? 'project root' : destination}`
                : `Delete ${items.length}`}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
