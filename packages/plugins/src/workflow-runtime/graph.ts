import { dirname, posix } from 'node:path';
import { projectPath, read } from './index.js';

export function cycles(edges: ReadonlyMap<string, readonly string[]>): string[][] {
  const active = new Set<string>();
  const done = new Set<string>();
  const path: string[] = [];
  const result: string[][] = [];
  function visit(node: string) {
    if (active.has(node)) {
      result.push([...path.slice(path.indexOf(node)), node]);
      return;
    }
    if (done.has(node)) return;
    active.add(node);
    path.push(node);
    for (const next of edges.get(node) ?? []) visit(next);
    path.pop();
    active.delete(node);
    done.add(node);
  }
  for (const node of edges.keys()) visit(node);
  return result;
}
/** Literal ES imports/reexports and require/import calls; computed imports are reported separately. */
export async function importGraph(root: string, files: string[]) {
  const normalized = files.map((file) => file.replaceAll('\\', '/').replace(/^\.\//, ''));
  const known = new Set(normalized);
  const edges = new Map<string, string[]>();
  const unresolved: Array<{ file: string; specifier: string }> = [];
  for (const file of normalized) {
    projectPath(root, file);
    const source = await read(root, file);
    const targets: string[] = [];
    const pattern = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]!;
      if (!specifier.startsWith('.')) {
        unresolved.push({ file, specifier });
        continue;
      }
      const base = posix.normalize(posix.join(dirname(file).replaceAll('\\', '/'), specifier));
      const stripped = base.replace(/\.[cm]?jsx?$/, '');
      const found = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.js`,
        `${base}/index.ts`,
        `${base}/index.js`,
        `${stripped}.ts`,
        `${stripped}.tsx`,
      ].find((candidate) => known.has(candidate));
      if (found) targets.push(found);
      else unresolved.push({ file, specifier });
    }
    edges.set(file, [...new Set(targets)]);
  }
  return {
    edges,
    unresolved,
    limitation:
      'Literal imports only; comments, aliases and computed imports require compiler-backed follow-up.',
  };
}
