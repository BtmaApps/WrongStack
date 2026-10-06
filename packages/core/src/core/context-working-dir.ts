import { realpathSync } from 'node:fs';
import * as path from 'node:path';
import { wstackGlobalRoot } from '../utils/wstack-paths.js';

/** True when `target` is `root` itself or nested inside it. */
function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  // Canonical escape test: `..hidden` is a legal in-root first segment.
  return !(rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel));
}

function realpathOrNull(p: string): string | null {
  try {
    return realpathSync.native(p);
  } catch {
    return null;
  }
}

/**
 * Resolve a requested working directory and, in restricted mode, confine it to
 * the roots every file tool may always reach: the project root and the
 * user-global `~/.wrongstack` (honoring `WRONGSTACK_HOME`). Keeping the same
 * pair as `allowedRoots` in `@wrongstack/tools` means the agent can run a
 * shell where it can already read and write — writes there still go through
 * the agent-state approval gate in the permission policy.
 *
 * Each root is checked lexically and again by realpath, so an in-root symlink
 * cannot redirect the working directory outside it.
 */
export function resolveAndValidateWorkingDir(
  dir: string,
  projectRoot: string,
  allowOutsideProjectRoot: boolean,
): string {
  const resolved = path.isAbsolute(dir) ? path.resolve(dir) : path.resolve(projectRoot, dir);
  // Unrestricted filesystem access: the working dir may leave both roots.
  if (allowOutsideProjectRoot) return resolved;

  const root = path.resolve(projectRoot);
  const roots = [root, path.resolve(wstackGlobalRoot())];
  if (!roots.some((candidate) => isInside(candidate, resolved))) {
    throw new Error(`Working directory "${resolved}" is outside project root "${root}"`);
  }

  // Unresolvable target — the lexical check above is all there is to go on.
  const realTarget = realpathOrNull(resolved);
  if (realTarget === null) return resolved;
  // Like-for-like against every root's realpath, the same rule the file tools
  // apply: a root may itself be a symlink, and an in-project link into
  // `~/.wrongstack` lands in an allowed root.
  const realRoots = roots.map((candidate) => realpathOrNull(candidate) ?? candidate);
  if (!realRoots.some((candidate) => isInside(candidate, realTarget))) {
    throw new Error(
      `Working directory "${resolved}" resolves to "${realTarget}", outside project root "${realRoots[0]}"`,
    );
  }
  return resolved;
}
