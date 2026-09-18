/**
 * Resolves the bundled `<pkg>/data/prompts/` dataset shipped with the installed
 * `@wrongstack/core` package. Used by the CLI/WebUI to discover the curated
 * builtin prompt library without the user pointing at a path manually.
 *
 * The directory lives at a sibling of `dist/` (in development: `src/`) so the
 * resolution walks one level up from the core package's `package.json` and
 * joins with `data/prompts`. Returns `undefined` if the lookup fails — the
 * caller treats that as "no bundled prompts this run" and continues.
 */

import { createRequire } from 'node:module';
import * as path from 'node:path';
import { wrongstackPackageJsonPath } from '@wrongstack/core/utils';

export function resolveBundledPromptsDir(): string | undefined {
  try {
    const req = createRequire(import.meta.url);
    const corePkg = wrongstackPackageJsonPath('@wrongstack/core', (id) => req.resolve(id));
    return path.join(path.dirname(corePkg), 'data', 'prompts');
  } catch {
    return undefined;
  }
}
