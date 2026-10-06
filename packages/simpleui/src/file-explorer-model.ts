/** File-manager model: tree node shape, persisted selection, and path/filter helpers. */

export const SELECTED_FILE_STORAGE_KEY = 'wrongstack-simpleui-file-manager-selected-file';
export const MAX_STORED_PATH_LENGTH = 4096;

export function defaultFileListOpen(): boolean {
  return !globalThis.matchMedia?.('(max-width: 760px)').matches;
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

export function readSelectedPath(): string | null {
  try {
    const stored = globalThis.localStorage?.getItem(SELECTED_FILE_STORAGE_KEY);
    return stored && stored.length <= MAX_STORED_PATH_LENGTH ? stored : null;
  } catch {
    return null;
  }
}

export function persistSelectedPath(path: string): void {
  try {
    globalThis.localStorage?.setItem(SELECTED_FILE_STORAGE_KEY, path);
  } catch {
    // Persistence is best-effort in private browsing and quota-restricted environments.
  }
}

export function isPathInsideDirectory(filePath: string | null, directoryPath: string): boolean {
  if (!filePath) return false;
  const file = filePath.replaceAll('\\', '/');
  const directory = directoryPath.replaceAll('\\', '/').replace(/\/+$/, '');
  return file.startsWith(`${directory}/`);
}

export function nodeOrDescendantMatches(node: FileNode, filterLower: string): boolean {
  if (node.name.toLowerCase().includes(filterLower)) return true;
  if (node.children) {
    return node.children.some((child) => nodeOrDescendantMatches(child, filterLower));
  }
  return false;
}
