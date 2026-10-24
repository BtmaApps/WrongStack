'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  emptyFileShelf,
  type FileShelf,
  fileShelfKey,
  readFileShelf,
  rememberFile,
  togglePinnedFile,
} from './file-shelf';

export function useFileShelf(cwd: string) {
  const scope = fileShelfKey(cwd);
  const [stored, setStored] = useState<{ scope: string; data: FileShelf }>({
    scope: '',
    data: emptyFileShelf(),
  });
  useEffect(() => {
    let raw: string | null = null;
    try {
      if (scope) raw = localStorage.getItem(scope);
    } catch {}
    setStored({ scope, data: readFileShelf(raw) });
  }, [scope]);
  const change = useCallback(
    (apply: (current: FileShelf) => FileShelf) => {
      setStored((current) => {
        if (!scope || current.scope !== scope) return current;
        const next = apply(current.data);
        if (next === current.data) return current;
        try {
          localStorage.setItem(scope, JSON.stringify(next));
        } catch {}
        return { scope, data: next };
      });
    },
    [scope],
  );
  const remember = useCallback(
    (path: string) => change((current) => rememberFile(current, path)),
    [change],
  );
  const togglePin = useCallback(
    (path: string) => change((current) => togglePinnedFile(current, path)),
    [change],
  );
  const setExpanded = useCallback(
    (expanded: boolean) =>
      change((current) => (current.expanded === expanded ? current : { ...current, expanded })),
    [change],
  );
  const clearRecent = useCallback(
    () => change((current) => (current.recent.length ? { ...current, recent: [] } : current)),
    [change],
  );
  return {
    data: stored.scope === scope ? stored.data : emptyFileShelf(),
    ready: Boolean(scope && stored.scope === scope),
    remember,
    togglePin,
    setExpanded,
    clearRecent,
  };
}
