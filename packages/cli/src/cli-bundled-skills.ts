/**
 * Resolves the bundled `<pkg>/skills/` directory shipped with the installed
 * `@wrongstack/core` package. Used by the CLI to discover the curated skill
 * set without making the user point at a path manually.
 *
 * The directory lives at a sibling of `dist/` (in development: `src/`) so
 * the resolution walks one level up from the core package's `package.json`
 * and joins with `skills`. Returns `undefined` if the lookup fails for any
 * reason — the caller should treat that as "no bundled skills this run"
 * and continue without error.
 */

import { createRequire } from 'node:module';
import * as path from 'node:path';
import { wrongstackPackageJsonPath } from '@wrongstack/core/utils';

export function resolveBundledSkillsDir(): string | undefined {
  try {
    const req = createRequire(import.meta.url);
    const corePkg = wrongstackPackageJsonPath('@wrongstack/core', (id) => req.resolve(id));
    return path.join(path.dirname(corePkg), 'skills');
  } catch {
    return undefined;
  }
}
