import { useCallback, useEffect, useMemo, useRef } from 'react';
import { getWSClient } from '@/lib/ws-client';
import { useGitChangesStore } from '@/stores';

interface UseFileExplorerLocationInput {
  cwd: string;
  projectName: string;
}

export function useFileExplorerLocation({ cwd, projectName }: UseFileExplorerLocationInput) {
  const gitChanges = useGitChangesStore((s) => s.files);
  const gitRepoPrefix = useGitChangesStore((s) => s.repoPrefix);
  const gitDirs = useGitChangesStore((s) => s.dirs);

  const gitStatusMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of gitChanges) {
      const norm = f.path.replace(/\\/g, '/').replace(/^\//, '');
      m.set(norm, f.status);
    }
    return m;
  }, [gitChanges]);

  const dirStatusMap = useMemo(() => new Map(Object.entries(gitDirs)), [gitDirs]);

  const getGitStatus = useCallback(
    (nodePath: string, isDir: boolean): string | undefined => {
      const root = (cwd || projectName || '')
        .replace(/\\/g, '/')
        .replace(/^\//, '')
        .replace(/\/$/, '');
      let norm = nodePath.replace(/\\/g, '/').replace(/^\//, '');
      if (root && norm.startsWith(root + '/')) {
        norm = norm.slice(root.length + 1);
      }
      // Tree paths are PROJECT-root-relative; porcelain paths from
      // git.changes are REPO-root-relative. When a repo subdirectory is
      // opened as the project, git keys carry a prefix the tree never
      // emits — prepend the server-computed repoPrefix (see
      // repoRelativePrefix in webui-server git-handlers) to align them.
      const key = gitRepoPrefix + norm;
      const direct = gitStatusMap.get(key);
      if (direct) return direct;
      if (isDir) {
        // Directory badges come from the server-computed aggregate in
        // git.changes (highest-ranked child status) — no client-side
        // prefix scanning over the file map.
        return dirStatusMap.get(key);
      }
      return undefined;
    },
    [gitStatusMap, dirStatusMap, gitRepoPrefix, cwd, projectName],
  );

  const pathSep = cwd?.includes('\\') ? '\\' : '/';

  const truncateMiddle = (s: string, keepStart = 8, keepEnd = 4): string => {
    if (s.length <= keepStart + keepEnd + 2) return s;
    return `${s.slice(0, keepStart)}…${s.slice(-keepEnd)}`;
  };

  const isAtRoot = (() => {
    if (!cwd || !projectName) return true;
    const segments = cwd.replace(/\\/g, '/').split('/').filter(Boolean);
    return (segments[segments.length - 1] ?? '') === projectName;
  })();

  const breadcrumbs = useMemo(() => {
    if (!cwd || !projectName) return [];
    const norm = cwd.replace(/\\/g, '/');
    const segments = norm.split('/').filter(Boolean);
    let rootIdx = -1;
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i] === projectName) {
        rootIdx = i;
        break;
      }
    }
    if (rootIdx === -1) {
      return segments.map((s, i) => ({
        label: s,
        path: '/' + segments.slice(0, i + 1).join('/'),
        isLast: i === segments.length - 1,
      }));
    }
    const rel = segments.slice(rootIdx);
    return rel.map((s, i) => ({
      label: s,
      path: '/' + segments.slice(0, rootIdx + i + 1).join('/'),
      isLast: i === rel.length - 1,
    }));
  }, [cwd, projectName]);

  const bcRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bcRef.current;
    if (el && breadcrumbs.length > 1) {
      el.scrollLeft = el.scrollWidth;
    }
  }, [breadcrumbs]);

  const handleBreadcrumbClick = useCallback((crumbPath: string) => {
    getWSClient().send({ type: 'working_dir.set', payload: { path: crumbPath } });
  }, []);
  return {
    getGitStatus,
    pathSep,
    truncateMiddle,
    isAtRoot,
    breadcrumbs,
    bcRef,
    handleBreadcrumbClick,
  };
}
