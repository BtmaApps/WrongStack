import { entries } from './engine-values';

export function projectRelativePath(value: string, projectRoot: string): string {
  const normalize = (path: string) =>
    path
      .replaceAll('\\', '/')
      .replace(/^\/\/\?\//, '')
      .replace(/\/$/, '');
  const path = normalize(value),
    root = normalize(projectRoot);
  const windows = /^[a-z]:\//i.test(root);
  const target = windows ? path.toLowerCase() : path,
    prefix = windows ? root.toLowerCase() : root;
  return target === prefix
    ? ''
    : target.startsWith(`${prefix}/`)
      ? path.slice(root.length + 1)
      : path;
}
export function workspaceFilePath(value: string, projectRoot: string, workdir: string): string {
  if (/^(?:[a-z]:[\\/]|[\\/])/i.test(value)) return projectRelativePath(value, projectRoot);
  const result: string[] = [];
  for (const part of `${projectRelativePath(workdir, projectRoot)}/${value}`
    .replaceAll('\\', '/')
    .split('/')) {
    if (!part || part === '.') continue;
    if (part === '..' && result.length && result.at(-1) !== '..') result.pop();
    else result.push(part);
  }
  return result.join('/');
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  ignored?: boolean;
  children: FileNode[];
}
export function fileTree(value: unknown): FileNode[] {
  return entries(value)
    .filter(
      (node) =>
        typeof node['path'] === 'string' &&
        typeof node['name'] === 'string' &&
        ['file', 'directory'].includes(String(node['type'])),
    )
    .map((node) => ({
      name: String(node['name']),
      path: String(node['path']).replaceAll('\\', '/'),
      type: node['type'] as 'file' | 'directory',
      ...(node['ignored'] === true ? { ignored: true } : {}),
      ...(typeof node['size'] === 'number' ? { size: node['size'] } : {}),
      children: fileTree(node['children']),
    }));
}
export function flattenFiles(nodes: FileNode[]): FileNode[] {
  return nodes.flatMap((node) => [node, ...flattenFiles(node.children)]);
}
export function parentPath(path: string) {
  return path.replaceAll('\\', '/').split('/').slice(0, -1).join('/');
}
export function fileName(path: string) {
  return path.replaceAll('\\', '/').split('/').at(-1) ?? path;
}
export function byteSize(bytes: number) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`;
}
export function fileLanguage(path: string) {
  const extension = path.split('.').at(-1)?.toLowerCase() ?? '';
  return (
    (
      {
        ts: 'TypeScript',
        tsx: 'TypeScript React',
        js: 'JavaScript',
        jsx: 'JavaScript React',
        rs: 'Rust',
        py: 'Python',
        md: 'Markdown',
        json: 'JSON',
        css: 'CSS',
        html: 'HTML',
        yaml: 'YAML',
        yml: 'YAML',
        toml: 'TOML',
        sh: 'Shell',
        ps1: 'PowerShell',
      } as Record<string, string>
    )[extension] ?? 'Plain text'
  );
}
export interface DiffLine {
  kind: 'same' | 'add' | 'remove';
  text: string;
  oldLine: number | null;
  newLine: number | null;
}
/** Bounded Myers line diff; large rewrites fall back to an accurate delete/add block. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before ? before.split('\n') : [],
    b = after ? after.split('\n') : [];
  let prefix = 0,
    suffix = 0;
  while (prefix < Math.min(a.length, b.length) && a[prefix] === b[prefix]) prefix++;
  while (
    suffix < Math.min(a.length, b.length) - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  )
    suffix++;
  const left = a.slice(prefix, a.length - suffix),
    right = b.slice(prefix, b.length - suffix);
  const trace: Map<number, number>[] = [];
  let frontier = new Map<number, number>([[1, 0]]),
    work = 0;
  let edits: { kind: DiffLine['kind']; text: string }[] | null = null;
  outer: for (let d = 0; d <= left.length + right.length; d++) {
    trace.push(new Map(frontier));
    for (let k = -d; k <= d; k += 2) {
      if (++work > 150000 || d > 1200) break outer;
      let x =
        k === -d || (k !== d && (frontier.get(k - 1) ?? -1) < (frontier.get(k + 1) ?? -1))
          ? (frontier.get(k + 1) ?? 0)
          : (frontier.get(k - 1) ?? 0) + 1;
      let y = x - k;
      while (x < left.length && y < right.length && left[x] === right[y]) {
        x++;
        y++;
      }
      frontier.set(k, x);
      if (x >= left.length && y >= right.length) {
        const result: { kind: DiffLine['kind']; text: string }[] = [];
        let cx = left.length,
          cy = right.length;
        for (let depth = d; depth >= 0; depth--) {
          const previous = trace[depth]!;
          const diagonal = cx - cy;
          const pk =
            diagonal === -depth ||
            (diagonal !== depth &&
              (previous.get(diagonal - 1) ?? -1) < (previous.get(diagonal + 1) ?? -1))
              ? diagonal + 1
              : diagonal - 1;
          const px = previous.get(pk) ?? 0,
            py = px - pk;
          while (cx > px && cy > py) {
            result.push({ kind: 'same', text: left[cx - 1]! });
            cx--;
            cy--;
          }
          if (depth > 0) {
            if (cx === px) {
              result.push({ kind: 'add', text: right[cy - 1]! });
              cy--;
            } else {
              result.push({ kind: 'remove', text: left[cx - 1]! });
              cx--;
            }
          }
        }
        edits = result.reverse();
        break outer;
      }
    }
  }
  const middle = edits ?? [
    ...left.map((text) => ({ kind: 'remove' as const, text })),
    ...right.map((text) => ({ kind: 'add' as const, text })),
  ];
  let oldLine = 0,
    newLine = 0;
  return [
    ...a.slice(0, prefix).map((text) => ({ kind: 'same' as const, text })),
    ...middle,
    ...(suffix ? a.slice(-suffix).map((text) => ({ kind: 'same' as const, text })) : []),
  ].map((line) => ({
    ...line,
    oldLine: line.kind === 'add' ? null : ++oldLine,
    newLine: line.kind === 'remove' ? null : ++newLine,
  }));
}
export function reviewText(notes: { path: string; line: number; text: string }[]) {
  return notes.map((note) => `${note.path}:${note.line}\n${note.text}`).join('\n\n');
}
