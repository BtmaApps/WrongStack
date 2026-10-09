import { resolve } from 'node:path';
import type { Context } from '@wrongstack/core/agent';
import { safeResolveReal } from './_util.js';

const DEVELOPMENT_CONFIG_KEYS = new Set([
  'color.ui',
  'color.diff',
  'color.status',
  'color.branch',
  'color.decorate',
  'core.autocrlf',
  'core.eol',
  'core.longpaths',
  'core.quotepath',
  'core.filemode',
  'core.ignorecase',
  'diff.algorithm',
  'diff.renames',
  'diff.context',
  'diff.mnemonicprefix',
  'diff.noprefix',
  'advice.detachedhead',
]);

/** Validate global development options before excluding them from the hard gate. */
export async function validateGitDevelopmentArgs(
  args: string[],
  ctx: Context,
  cwd: string,
): Promise<ReadonlySet<number>> {
  const validated = new Set<number>();
  let directory = cwd;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    // Subcommand flags have different meanings: `git commit -C REV` copies a
    // commit message, so only Git's global prefix is interpreted here.
    if (arg === '--' || !arg.startsWith('-')) break;
    if (arg === '-C') {
      const value = args[index + 1];
      if (value === undefined) continue;
      directory = await safeResolveReal(resolve(directory, value), ctx);
      validated.add(index);
      // Pass the verified path to Git as well, so a scoped call uses the
      // resolved target rather than its original symlink spelling.
      args[++index] = directory;
      validated.add(index);
    } else if (arg === '-c') {
      const value = args[index + 1];
      const equal = value?.indexOf('=') ?? -1;
      if (!value || equal < 1 || !DEVELOPMENT_CONFIG_KEYS.has(value.slice(0, equal).toLowerCase()))
        continue;
      validated.add(index);
      validated.add(++index);
    }
  }
  return validated;
}
