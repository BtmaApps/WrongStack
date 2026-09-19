import nodePath from 'node:path';

/**
 * Compute the repo-relative prefix for a project root, normalized to
 * forward slashes with a trailing separator ('' when the project root IS
 * the repo root, or either side is unknown/escapes the repo).
 *
 * `git status --porcelain` always reports paths relative to the REPOSITORY
 * root, while `files.tree` node paths are relative to the PROJECT root.
 * When a subdirectory of the repo is opened as the project (e.g.
 * `packages/webui`), git paths like `packages/webui/src/a.ts` carry a
 * prefix the tree never emits — every explorer git badge would silently
 * miss. Prepending this prefix to tree-relative paths aligns the two
 * bases; separator normalization keeps it valid on Windows where
 * `rev-parse --show-toplevel` may print either separator style.
 */
export function repoRelativePrefix(repoRoot: string, projectRoot: string): string {
  if (!repoRoot || !projectRoot) return '';
  const rel = nodePath
    .relative(nodePath.normalize(repoRoot), nodePath.normalize(projectRoot))
    .replaceAll('\\', '/');
  if (!rel || rel === '.') return '';
  // Outside the repo maps to '' — SEGMENT-aware: '..' or '../x' escapes,
  // but a legal `..hidden` directory name does NOT (a raw startsWith('..')
  // falsely reported "no relation" for projects under such a directory).
  if (rel === '..' || rel.startsWith('../')) return '';
  return rel + '/';
}

export const MAX_DIFF_BYTES = 2 * 1024 * 1024;

export async function execGit(
  cwd: string | undefined,
  args: string[],
  opts?: { literalPathspecs?: boolean },
): Promise<{ ok: boolean; stdout: string; stderr: string; error?: string }> {
  const { execFile: ef } = await import('node:child_process');
  return new Promise((resolve) => {
    ef(
      'git',
      args,
      {
        cwd,
        timeout: 10000,
        maxBuffer: 1024 * 1024 * 16,
        // Pathspec magic containment (chimera round-4), OPT-IN (chimera
        // follow-up): a validated input like `packages/webui/:(top)keep.txt`
        // translates to `:(top)keep.txt`, passes every lexical check as an
        // odd filename, and — WITHOUT this flag — git interprets the
        // `:(top)` magic and targets a repo-ROOT file outside the opened
        // project. Literal pathspecs make every `--` argument a plain
        // filename; the attack then simply matches nothing.
        // Scoped per-call because the variable LEAKS to child processes:
        // `git commit` runs user hooks (pre-commit, commit-msg), and
        // GIT_LITERAL_PATHSPECS=1 in that environment rewrites how the
        // user's own hook scripts interpret every pathspec they touch.
        // Only pathspec-carrying mutations opt in (`.` and literal paths
        // only — no caller relies on magic).
        env:
          opts?.literalPathspecs === true
            ? { ...process.env, GIT_LITERAL_PATHSPECS: '1' }
            : process.env,
      },
      (err: Error | null, stdout: string, stderr: string) => {
        if (err) {
          resolve({ ok: false, stdout: stdout || '', stderr: stderr || '', error: err.message });
        } else {
          resolve({ ok: true, stdout: stdout || '', stderr: stderr || '' });
        }
      },
    );
  });
}

/**
 * Lexical safety for a RELATIVE pathspec. The `..` check is SEGMENT-based,
 * not substring: `release..notes.md` is a legal filename (two dots inside
 * one segment), while `a/../b` traverses. Empty segments (`foo//bar`, a
 * trailing `/`) are NOT unsafe — they are paste artifacts that
 * {@link normalizePathspec} collapses; rejecting them turned valid client
 * payloads into hard errors. Absolute, NUL, and leading-dash paths are
 * rejected outright.
 */
export function isUnsafeRelativePath(p: string): boolean {
  if (
    !p ||
    typeof p !== 'string' ||
    p.includes('\0') ||
    nodePath.isAbsolute(p) ||
    p.startsWith('-')
  ) {
    return true;
  }
  return p
    .replaceAll('\\', '/')
    .split('/')
    .some((seg) => seg === '..');
}

/**
 * Repo→project prefix for the CURRENT repository ('' when projectRoot is
 * the repo root, or git is unavailable / not a repo).
 *
 * The rev-parse result is cached per RESOLVED projectRoot (chimera perf:
 * one git process per stage/unstage/discard/diff call was pure overhead
 * for click bursts). The cache key is the project root itself, so a
 * project SWITCH resolves fresh — each project gets its own prefix,
 * never the previous project's. A short TTL bounds staleness for the
 * rare case of the repo layout changing under an unchanged project root
 * (e.g. a new `git init` inside the project). Failed rev-parses are NOT
 * cached: a transient failure must not pin '' for the TTL window.
 */
const REPO_ROOT_CACHE_TTL_MS = 30_000;
/** Bound the cache: distinct project roots are few, but a long-running
 * server must never retain one entry per root forever. Map preserves
 * insertion order, so eviction drops the oldest entry. */
const REPO_ROOT_CACHE_MAX = 64;
const repoRootCache = new Map<string, { repoRoot: string; at: number }>();

/** Record a successful rev-parse, evicting the oldest entry at capacity. */
export function cacheRepoRoot(key: string, repoRoot: string): void {
  if (repoRootCache.size >= REPO_ROOT_CACHE_MAX) {
    const oldest = repoRootCache.keys().next().value;
    if (oldest !== undefined) repoRootCache.delete(oldest);
  }
  repoRootCache.set(key, { repoRoot, at: Date.now() });
}

export async function currentRepoPrefix(projectRoot: string): Promise<string> {
  const key = nodePath.resolve(projectRoot || '.');
  const hit = repoRootCache.get(key);
  if (hit) {
    if (Date.now() - hit.at < REPO_ROOT_CACHE_TTL_MS) {
      return repoRelativePrefix(hit.repoRoot, projectRoot);
    }
    // Expired entries are DELETED, not just bypassed — otherwise the map
    // retains one stale entry per project root for the process lifetime.
    repoRootCache.delete(key);
  }
  const res = await execGit(projectRoot || undefined, ['rev-parse', '--show-toplevel']);
  if (!res.ok) return '';
  const repoRoot = res.stdout.trim();
  cacheRepoRoot(key, repoRoot);
  return repoRelativePrefix(repoRoot, projectRoot);
}
