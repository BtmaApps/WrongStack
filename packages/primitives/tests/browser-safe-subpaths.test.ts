/**
 * Every subpath except the main entry is imported by core modules that the
 * browser bundles reach (webui loads `@wrongstack/core/utils/error` and
 * friends). The main entry pulls `node:child_process` / `node:fs`, which is
 * why these subpaths exist, so none of them may reach a `node:` module
 * through any relative import chain.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPECIFIER = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g;

function subpathSources(): Array<[string, string]> {
  const manifest = JSON.parse(fs.readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8')) as {
    exports: Record<string, { import: string }>;
  };
  return Object.entries(manifest.exports)
    .filter(([key]) => key !== '.')
    .map(([key, target]) => [
      key,
      path.join(PACKAGE_DIR, target.import.replace(/^\.\/dist\//, 'src/').replace(/\.js$/, '.ts')),
    ]);
}

/** `node:` modules reachable from `entry` through relative, value-carrying imports. */
function reachableNodeModules(entry: string): string[] {
  const seen = new Set<string>();
  const found = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(SPECIFIER)) {
      if (/^\s*(?:import|export)\s+type\s/.test(match[0])) continue;
      const specifier = match[1] as string;
      if (specifier.startsWith('node:'))
        found.add(`${path.relative(PACKAGE_DIR, file)} -> ${specifier}`);
      else if (specifier.startsWith('.'))
        pending.push(path.resolve(path.dirname(file), specifier.replace(/\.js$/, '.ts')));
    }
  }
  return [...found];
}

describe('browser-safe primitives subpaths', () => {
  it.each(subpathSources())('%s reaches no node: module', (_subpath, entry) => {
    expect(reachableNodeModules(entry)).toEqual([]);
  });
});
