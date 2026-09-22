/**
 * The reducer must stay a pure state machine: its runtime import graph may
 * not reach a `.tsx` view module (and through it Ink/React). Pure picker
 * helpers live in `*-model.ts` siblings that the views re-export.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '../src');

function resolveSpecifier(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec.replace(/\.js$/, ''));
  for (const ext of ['.ts', '.tsx', '/index.ts']) {
    if (fs.existsSync(base + ext)) return base + ext;
  }
  return null;
}

/** Runtime (non-`import type`) relative imports and re-exports. */
function runtimeImports(file: string): string[] {
  const src = fs.readFileSync(file, 'utf8');
  const out: string[] = [];
  const re = /^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+'([^']+)'/gms;
  for (let m = re.exec(src); m !== null; m = re.exec(src)) {
    const resolved = resolveSpecifier(file, m[1] ?? '');
    if (resolved) out.push(resolved);
  }
  return out;
}

describe('reducer module graph', () => {
  it('never reaches a .tsx view module', () => {
    const roots = [
      path.join(SRC, 'app-reducer.ts'),
      ...fs
        .readdirSync(path.join(SRC, 'reducers'))
        .filter((f) => f.endsWith('.ts'))
        .map((f) => path.join(SRC, 'reducers', f)),
    ];
    const parent = new Map<string, string | null>(roots.map((r) => [r, null]));
    const queue = [...roots];
    const offenders: string[] = [];
    while (queue.length > 0) {
      const file = queue.shift() as string;
      if (file.endsWith('.tsx')) {
        const chain: string[] = [];
        for (let at: string | null | undefined = file; at; at = parent.get(at)) {
          chain.unshift(path.relative(SRC, at).split(path.sep).join('/'));
        }
        offenders.push(chain.join(' -> '));
        continue;
      }
      for (const next of runtimeImports(file)) {
        if (parent.has(next)) continue;
        parent.set(next, file);
        queue.push(next);
      }
    }
    expect(offenders).toEqual([]);
  });
});
