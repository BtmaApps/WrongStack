import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SagePaths } from './types.js';

export const DEFAULT_SAGE_DIR = '.wrongstack/memories';

function escapesRoot(relativePath: string): boolean {
  // `\` is a legal filename character on POSIX, so a Windows-style traversal
  // (`..\..\shared-secrets`) reaches this check as ONE in-root filename and a
  // platform-separator prefix misses it — but it becomes a real traversal once
  // the same store syncs to a Windows client (same class as core yolo-risk /
  // cloud-sync containment). Normalise separators before the `..` checks;
  // conservative on POSIX: a file genuinely named with a backslash is then
  // reported as outside the root, which only makes the gates stricter.
  const normalized = relativePath.replace(/\\/g, '/');
  return normalized === '..' || normalized.startsWith('../') || path.isAbsolute(relativePath);
}

export function resolveSagePaths(projectRoot: string, directory = DEFAULT_SAGE_DIR): SagePaths {
  if (path.isAbsolute(directory)) {
    throw new Error('SAGE directory must be project-relative.');
  }
  const resolvedProjectRoot = path.resolve(projectRoot);
  const rootDir = path.resolve(resolvedProjectRoot, directory);
  const canonicalProjectRoot = cachedRealpath(resolvedProjectRoot);
  // Both sides must be canonicalized the same way (including the
  // not-yet-existing case) or a symlinked ancestor such as macOS's
  // /var/folders makes a project-relative directory read as an escape.
  const containmentTarget = canonicalizeExisting(rootDir);
  const relative = path.relative(canonicalProjectRoot, containmentTarget);
  if (escapesRoot(relative)) {
    throw new Error('SAGE directory must stay inside the project root.');
  }
  return {
    rootDir,
    manifest: path.join(rootDir, 'manifest.json'),
    memoriesLog: path.join(rootDir, 'memories.jsonl'),
    candidatesLog: path.join(rootDir, 'candidates.jsonl'),
    auditLog: path.join(rootDir, 'audit.jsonl'),
    graphDir: path.join(rootDir, 'graph'),
    edgesLog: path.join(rootDir, 'graph', 'edges.jsonl'),
    indexesDir: path.join(rootDir, 'indexes'),
    snapshotsDir: path.join(rootDir, 'snapshots'),
    hygieneDir: path.join(rootDir, 'hygiene'),
    tmpDir: path.join(rootDir, 'tmp'),
    locksDir: path.join(rootDir, 'locks'),
  };
}

/**
 * Canonicalize `dir` even when it does not exist: realpath the nearest
 * existing ancestor and re-attach the missing tail. Required on macOS, where
 * os.tmpdir() is `/var/folders/...`, a symlink to `/private/var/folders/...` —
 * comparing a raw prefix against a canonical root (or vice versa) misreads
 * containment as an escape. Returns path.resolve(dir) when no ancestor exists.
 */
function canonicalizeExisting(dir: string): string {
  const missing: string[] = [];
  let probe = path.resolve(dir);
  for (;;) {
    try {
      return path.join(fs.realpathSync(probe), ...missing);
    } catch {
      missing.unshift(path.basename(probe));
      const parent = path.dirname(probe);
      if (parent === probe) return path.resolve(dir);
      probe = parent;
    }
  }
}

/**
 * Cache of realpath() lookups for normalizeProjectPath. Without this,
 * every anchor normalize call would stat the filesystem — anchor
 * resolution runs on every remember / retrieveForPath invocation, so the
 * cache keeps the cost bounded by the number of unique paths instead
 * of the number of calls. Process-local: cross-process correctness is
 * not affected (every process resolves its own tree at startup).
 *
 * Hard cap: a long-lived project server that sees many ephemeral paths
 * (temp files, generated fixtures) must not grow this map unbounded.
 * Map insertion order gives cheap FIFO eviction of the oldest entry.
 */
const REALPATH_CACHE_MAX = 4_096;
const realpathCache = new Map<string, string>();
function cachedRealpath(p: string): string {
  const cached = realpathCache.get(p);
  if (cached !== undefined) {
    // Refresh LRU order so hot roots stay resident under eviction pressure.
    realpathCache.delete(p);
    realpathCache.set(p, cached);
    return cached;
  }
  // The nlink check distinguishes real files/dirs from the rest of the
  // filesystem, but for our purposes a single fs.realpathSync (which
  // throws on broken links) is sufficient — callers pass already-
  // resolved or relative paths that they expect to exist inside the
  // project root. Fallback for a not-yet-existing path (e.g. creating a
  // brand-new anchor for a file the user is about to write) canonicalizes
  // the nearest existing ancestor so the result stays comparable to other
  // canonical roots — anchors are intentionally allowed to point at
  // not-yet-existing paths.
  const resolved = canonicalizeExisting(p);
  while (realpathCache.size >= REALPATH_CACHE_MAX) {
    const oldest = realpathCache.keys().next().value;
    if (oldest === undefined) break;
    realpathCache.delete(oldest);
  }
  realpathCache.set(p, resolved);
  return resolved;
}

/**
 * Reset the realpath cache. Tests that change the underlying filesystem
 * (create / remove symlinks) call this to avoid stale entries.
 */
export function clearProjectPathCache(): void {
  realpathCache.clear();
}

export function normalizeProjectPath(projectRoot: string, inputPath: string): string {
  const root = cachedRealpath(path.resolve(projectRoot));
  const rawAbs = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(root, inputPath);
  // Resolve the parent directory's symlinks so a directory inside the
  // project pointing outside is caught. Then resolve the leaf itself:
  // if the leaf is a symlink, realpathSync reveals its true target —
  // which may escape the project. The caller-facing basename is then
  // preserved by re-attaching it (or the realpath target basename if
  // it differs) to the realpath'd parent.
  const parentDir = path.dirname(rawAbs);
  const callerBasename = path.basename(rawAbs);
  // Canonicalize the parent even when it doesn't exist yet (see
  // canonicalizeExisting): a raw parent under a symlinked tmpdir would
  // otherwise compare against the canonical root as an escape.
  const realParent = canonicalizeExisting(parentDir);
  // Now resolve the full leaf path to catch symlink escapes. The
  // escape check uses the resolved path; the return value preserves
  // the caller's literal basename so anchor identity keys (downstream
  // lookup, audit log, dedup) match what the caller typed.
  let abs: string;
  try {
    const realFull = fs.realpathSync(rawAbs);
    // Use the resolved leaf's parent for the containment check (the
    // escape vector is when the parent of the resolved path sits
    // outside the project root). If the resolved leaf is outside, the
    // path.join below will produce an abs that escapes, and the
    // startsWith('..') guard catches it.
    abs = path.join(path.dirname(realFull), callerBasename);
  } catch {
    // Leaf doesn't exist — anchor for a future file. Fall back to the
    // realpath'd parent + caller's basename.
    abs = path.join(realParent, callerBasename);
  }
  const rel = path.relative(root, abs);
  if (escapesRoot(rel)) {
    throw new Error(`Memory path must stay inside the project root: ${inputPath}`);
  }
  return normalizeSlashes(rel || '.');
}

export function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+/g, '/');
}

export function ancestorPaths(projectPath: string): string[] {
  const normalized = normalizeSlashes(projectPath);
  if (normalized === '.') return ['.'];
  const parts = normalized.split('/').filter(Boolean);
  const result: string[] = [];
  for (let i = parts.length; i >= 1; i--) {
    result.push(parts.slice(0, i).join('/'));
  }
  return result;
}
