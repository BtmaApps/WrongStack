import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { moduleDirFor } from '@wrongstack/core/utils';
import type { BenchSuite, BenchTask, SuiteId } from '../types.js';
import { createLocalManifestSuite } from './local-manifest.js';

/**
 * Walk up from `import.meta.url` until `fixtures/<name>/bench.local.json`.
 * Covers `src/suites/*.ts`, unbundled `dist/suites/*.js`, and the published
 * `dist/index.js` bundle.
 */
export function resolveBundledSuiteDir(name: string): string {
  let dir = moduleDirFor(import.meta.url, '@wrongstack/bench');
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'fixtures', name);
    if (existsSync(path.join(candidate, 'bench.local.json'))) return candidate;
    dir = path.dirname(dir);
  }
  throw new Error(`cannot locate the bundled WrongStack ${name} suite (fixtures/${name})`);
}

/**
 * Resolve a `--subset` argument: an existing file path wins; otherwise a bare
 * name maps to the bundled `subsets/<name>.json`. Returns the pinned ids.
 */
export async function loadSubsetIds(arg: string, cwd: string): Promise<string[]> {
  const direct = path.resolve(cwd, arg);
  let file = existsSync(direct) ? direct : undefined;
  if (!file) {
    let dir = moduleDirFor(import.meta.url, '@wrongstack/bench');
    for (let i = 0; i < 6 && !file; i++) {
      const candidate = path.join(dir, 'subsets', `${arg.replace(/\.json$/, '')}.json`);
      if (existsSync(candidate)) file = candidate;
      dir = path.dirname(dir);
    }
  }
  if (!file) throw new Error(`subset not found: ${arg} (neither a file nor a bundled subset name)`);
  const raw: unknown = JSON.parse(await readFile(file, 'utf8'));
  const ids = (raw as { ids?: unknown }).ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
    throw new Error(`subset ${file} must contain a non-empty "ids" string array`);
  }
  return ids as string[];
}

/** Wrap a local-manifest suite under a bundled suite id (`smoke/` / `core/`). */
export function createBundledLocalSuite(
  name: Extract<SuiteId, 'smoke' | 'core' | 'hard'>,
): BenchSuite {
  const inner = createLocalManifestSuite({ suiteDir: resolveBundledSuiteDir(name) });
  const prefix = `${name}/`;
  const localPrefix = 'local/';
  return {
    id: name,
    async loadTasks(opts) {
      const tasks = await inner.loadTasks(opts);
      return tasks.map((task) => relabel(task, localPrefix, prefix, name));
    },
    subsetId(tasks) {
      const innerId = inner.subsetId(
        tasks.map((task) => relabel(task, prefix, localPrefix, 'local')),
      );
      return `${name}:${innerId.slice('local:'.length)}`;
    },
  };
}

function relabel(task: BenchTask, from: string, to: string, suite: BenchTask['suite']): BenchTask {
  const id = task.id.startsWith(from) ? `${to}${task.id.slice(from.length)}` : task.id;
  return { ...task, id, suite };
}
