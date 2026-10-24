export const MAX_PINNED_FILES = 8;
export const MAX_RECENT_FILES = 5;
export interface FileShelf {
  pinned: string[];
  recent: string[];
  expanded: boolean;
}
export const emptyFileShelf = (): FileShelf => ({ pinned: [], recent: [], expanded: true });

export function fileShelfKey(cwd: string) {
  if (!cwd) return '';
  const windows = /^[a-z]:[\\/]/i.test(cwd) || cwd.startsWith('\\\\');
  const normalized = cwd.replaceAll('\\', '/').replace(/\/+$/, '') || '/';
  return `wrongstack.vibeui.file-shelf.v1:${encodeURIComponent(windows ? normalized.toLowerCase() : normalized)}`;
}

function paths(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (path): path is string =>
          typeof path === 'string' &&
          path.length > 0 &&
          path.length <= 2048 &&
          !/[\u0000-\u001f]/.test(path),
      ),
    ),
  ].slice(0, limit);
}
export function readFileShelf(raw: string | null): FileShelf {
  try {
    const value: unknown = JSON.parse(raw || 'null');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyFileShelf();
    const item = value as Record<string, unknown>;
    return {
      pinned: paths(item.pinned, MAX_PINNED_FILES),
      recent: paths(item.recent, MAX_RECENT_FILES),
      expanded: item.expanded !== false,
    };
  } catch {
    return emptyFileShelf();
  }
}

export function rememberFile(shelf: FileShelf, path: string): FileShelf {
  if (!paths([path], 1).length || shelf.recent[0] === path) return shelf;
  return {
    ...shelf,
    recent: [path, ...shelf.recent.filter((item) => item !== path)].slice(0, MAX_RECENT_FILES),
  };
}

export function togglePinnedFile(shelf: FileShelf, path: string): FileShelf {
  if (shelf.pinned.includes(path))
    return { ...shelf, pinned: shelf.pinned.filter((item) => item !== path) };
  if (shelf.pinned.length >= MAX_PINNED_FILES || !paths([path], 1).length) return shelf;
  return { ...shelf, pinned: [...shelf.pinned, path] };
}
