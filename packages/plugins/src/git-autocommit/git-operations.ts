import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

const DEFAULT_GIT_TIMEOUT_MS = 30_000;
// `git commit` runs repository hooks. In this repo the pre-commit hook can
// rebuild packages and run workspace typecheck, which routinely exceeds the
// short timeout appropriate for read-only git commands.
const GIT_COMMIT_TIMEOUT_MS = 5 * 60_000;

async function runGit(
  args: string[],
  cwd?: string,
  timeoutMs = DEFAULT_GIT_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  return await new Promise<string>((resolvePromise, rejectPromise) => {
    execFile(
      'git',
      args,
      {
        encoding: 'utf-8',
        cwd,
        signal,
        windowsHide: true,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
      },
      (err, stdout) => {
        if (err) {
          const e = err as NodeJS.ErrnoException & {
            message?: string;
            stderr?: string;
          };
          rejectPromise(new Error(`git command failed: ${e.message ?? e.stderr ?? String(err)}`));
          return;
        }
        resolvePromise(stdout.trim());
      },
    );
  });
}

/**
 * Undo git's C-style quoting of a porcelain path.
 *
 * git quotes any path containing a space, a quote, a backslash, a control
 * character, or a non-ASCII byte (unless `core.quotePath=false`). Taking the
 * raw slice left the surrounding quotes attached, so the path never
 * matched a real file and the change was silently dropped from the commit.
 */
function unquotePorcelainPath(raw: string): string {
  if (!raw.startsWith('"') || !raw.endsWith('"') || raw.length < 2) return raw;
  const inner = raw.slice(1, -1);

  // Decode into BYTES, then interpret the whole buffer as UTF-8.
  //
  // git escapes each non-ASCII byte separately (`é` becomes `\303\251`), so
  // decoding escape-by-escape into characters yields the mojibake `Ã©` —
  // which matches no file on disk, and the change would be dropped exactly
  // as it was before this parsing existed. The bytes have to be reassembled
  // before decoding.
  const bytes: number[] = [];
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (ch !== '\\') {
      // Non-escaped run: push its UTF-8 encoding verbatim.
      for (const b of Buffer.from(ch, 'utf8')) bytes.push(b);
      continue;
    }
    const next = inner[i + 1];
    if (next === undefined) {
      bytes.push(0x5c); // trailing lone backslash
      break;
    }
    const simple: Record<string, number> = {
      n: 0x0a,
      t: 0x09,
      r: 0x0d,
      a: 0x07,
      b: 0x08,
      f: 0x0c,
      v: 0x0b,
      '"': 0x22,
      '\\': 0x5c,
    };
    const mapped = simple[next];
    if (mapped !== undefined) {
      bytes.push(mapped);
      i += 1;
      continue;
    }
    const octal = /^[0-7]{1,3}/.exec(inner.slice(i + 1));
    if (octal) {
      bytes.push(Number.parseInt(octal[0], 8) & 0xff);
      i += octal[0].length;
      continue;
    }
    // Unknown escape — keep the character as written.
    for (const b of Buffer.from(next, 'utf8')) bytes.push(b);
    i += 1;
  }
  return Buffer.from(bytes).toString('utf8');
}

/**
 * Parse one `git status --porcelain` line into the path to stage.
 *
 * Two shapes the naive `line.slice(3)` got wrong:
 *  - **Renames/copies** print `R  old -> new`. Slicing produced the literal
 *    string `"old -> new"`, which matches no file on disk, so the rename was
 *    dropped from the commit entirely. The path that must be staged is the
 *    NEW one.
 *  - **Quoted paths** (spaces, unicode, control chars) keep their quotes,
 *    likewise matching nothing.
 */
export function parsePorcelainLine(line: string): string | null {
  // XY<space>PATH — the status code is always the first two columns.
  // CAVEAT: `runGit` resolves with `stdout.trim()`, which eats the leading
  // space of the FIRST porcelain line whenever the index column is blank
  // (` M path` → `M path`). That is precisely the unstaged-modified shape
  // the auto-stage path feeds through here, and slicing 3 off the trimmed
  // line silently dropped the path's first character ('auto.ts' became
  // 'uto.ts' — a file that does not exist, dropped by stageFiles' existence
  // filter). Detect the trimmed one-column shape and parse it as XY=' M'.
  const twoColumn = /^[MADRCUTX?! ]{2} /.test(line);
  const oneColumnTrimmed = !twoColumn && /^[MADRCUTX?!] /.test(line);
  if (!twoColumn && !oneColumnTrimmed) {
    // Not a porcelain line shape we recognize — fall back to the historical
    // 3-column slice so unknown future codes still parse positionally.
    const bodyAny = line.slice(3);
    return bodyAny ? unquotePorcelainPath(bodyAny.trim()) : null;
  }
  const body = oneColumnTrimmed ? line.slice(2) : line.slice(3);
  if (!body) return null;
  const status = oneColumnTrimmed ? ` ${line.slice(0, 1)}` : line.slice(0, 2);
  if (status.includes('R') || status.includes('C')) {
    // `old -> new`, either side possibly quoted. Stage the destination.
    const arrow = body.lastIndexOf(' -> ');
    if (arrow !== -1) return unquotePorcelainPath(body.slice(arrow + 4).trim());
  }
  return unquotePorcelainPath(body.trim());
}

export async function getChangedFiles(cwd?: string, signal?: AbortSignal): Promise<string[]> {
  const output = await runGit(['status', '--porcelain'], cwd, DEFAULT_GIT_TIMEOUT_MS, signal);
  if (!output) return [];
  return output
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => parsePorcelainLine(l))
    .filter((p): p is string => p !== null && p.length > 0);
}

export async function getStagedFiles(cwd?: string, signal?: AbortSignal): Promise<string[]> {
  const output = await runGit(
    ['diff', '--cached', '--name-only'],
    cwd,
    DEFAULT_GIT_TIMEOUT_MS,
    signal,
  );
  // `git diff --name-only` applies the same C-quoting as `status --porcelain`
  // for non-ASCII and control characters, so decode before the names are used
  // as commit pathspecs or scope-warning keys.
  return output ? output.split('\n').filter(Boolean).map(unquotePorcelainPath) : [];
}

/**
 * Staged files limited to a pathspec scope — the caller's own slice of the
 * index, excluding anything another process staged concurrently.
 */
export async function getScopedStagedFiles(
  paths: string[],
  cwd?: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const output = await runGit(
    ['diff', '--cached', '--name-only', '--', ...paths],
    cwd,
    DEFAULT_GIT_TIMEOUT_MS,
    signal,
  );
  // Decode git's C-quoting (see getStagedFiles): the result is used verbatim
  // as the `git commit --only` path list, so a quoted path would fail commit.
  return output ? output.split('\n').filter(Boolean).map(unquotePorcelainPath) : [];
}

/**
 * Stage explicit file paths (filtered to paths git can stage) or raw git
 * pathspecs (any pattern containing `*`, `?` or `[` — matched by git itself,
 * e.g. all of `website/` recursively, or every package.json manifest at any
 * depth). The existence filter cannot apply to patterns, because which
 * files a pattern matches is git's to say.
 *
 * Returns the concrete path list handed to `git add`, so the caller can fence
 * its commit to exactly what was staged.
 */
export async function stageFiles(
  files: string[] | undefined,
  cwd?: string,
  signal?: AbortSignal,
): Promise<string[]> {
  /* v8 ignore next -- callers always pass a validated array; the guard is defensive. */
  if (!files || !Array.isArray(files) || files.length === 0) return [];
  const hasPattern = files.some((f) => /[*?[\]]/.test(f));
  if (!hasPattern) {
    // Filter to only paths git can stage (avoids "pathspec did not match any
    // files" errors for typos). Resolves against cwd for correct multi-root
    // staging. A tracked file deleted from the worktree no longer exists on
    // disk but is still stageable via `git add`; unioning `git ls-files`
    // tracked-but-absent paths back in keeps deletions from being dropped.
    const onDisk = (files as string[]).filter((f) => {
      try {
        return existsSync(cwd ? resolve(cwd, f) : f);
      } catch {
        return false;
      }
    });
    let existing = onDisk;
    if (onDisk.length < files.length) {
      let tracked: string[] = [];
      try {
        const out = await runGit(['ls-files', '--', ...files], cwd, DEFAULT_GIT_TIMEOUT_MS, signal);
        tracked = out ? out.split('\n').filter(Boolean).map(unquotePorcelainPath) : [];
      } catch {
        tracked = [];
      }
      existing = [...new Set([...onDisk, ...tracked])];
    }
    if (existing.length === 0) {
      throw new Error('Failed to stage files: none of the specified files exist on disk');
    }
    // `--` terminates option parsing: without it a file named `-f` or
    // `--force` would be read by git as a flag rather than a pathspec.
    await runGit(['add', '--', ...existing], cwd, DEFAULT_GIT_TIMEOUT_MS, signal);
    return existing;
  }
  await runGit(['add', '--', ...files], cwd, DEFAULT_GIT_TIMEOUT_MS, signal);
  return files;
}

export async function commitWithMessage(
  message: string,
  cwd?: string,
  /**
   * Scope fence: `git commit --only -- <paths>` makes the commit contain
   * exactly these paths and leaves anything else another process staged in
   * the index, unabsorbed. Without it, git commits the ENTIRE index — the
   * mechanism by which a release agent's commit absorbed a concurrently
   * staged workstream it never asked for.
   */
  paths?: string[],
  signal?: AbortSignal,
): Promise<string> {
  const scoped = paths && paths.length > 0 ? ['--only', '--', ...paths] : [];
  return await runGit(['commit', '-m', message, ...scoped], cwd, GIT_COMMIT_TIMEOUT_MS, signal);
}

/**
 * Working-tree paths among `paths` whose content no longer matches the index.
 *
 * `git commit --only` takes the named paths' content from the WORKING TREE,
 * not the staged index — so an edit landing between this tool's `git add`
 * and its commit would be committed even though it never appeared in the
 * dry-run preview or the LLM prompt. The caller aborts when this returns
 * any path; a re-run re-stages the current content and proceeds.
 *
 * Git errors propagate: without drift evidence a scoped commit is unsafe.
 */
export async function scopedPathsDrifted(
  paths: string[],
  cwd?: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const out = await runGit(
    ['diff', '--name-only', '--', ...paths],
    cwd,
    DEFAULT_GIT_TIMEOUT_MS,
    signal,
  );
  return out ? out.split('\n').filter(Boolean).map(unquotePorcelainPath) : [];
}

// ---------------------------------------------------------------------------
// Worktree / simultaneous-edit detection
// ---------------------------------------------------------------------------

interface WorktreeInfo {
  path: string;
  head: string;
  branch: string;
}

/** Parse `git worktree list --porcelain` into structured entries. */
async function getWorktrees(cwd?: string, signal?: AbortSignal): Promise<WorktreeInfo[]> {
  try {
    const out = await runGit(
      ['worktree', 'list', '--porcelain'],
      cwd,
      DEFAULT_GIT_TIMEOUT_MS,
      signal,
    );
    if (!out) return [];
    const entries: WorktreeInfo[] = [];
    let current: Partial<WorktreeInfo> = {};
    for (const line of out.split('\n')) {
      if (line === '') {
        if (current.path) entries.push(current as WorktreeInfo);
        current = {};
        continue;
      }
      if (line.startsWith('worktree ')) current.path = line.slice(9);
      else if (line.startsWith('HEAD ')) current.head = line.slice(5);
      else if (line.startsWith('branch ')) current.branch = line.slice(7);
    }
    if (current.path) entries.push(current as WorktreeInfo);
    return entries;
  } catch {
    return [];
  }
}

/**
 * Return a warning string when other worktrees exist besides the main one.
 * Multiple worktrees mean other agents may be making simultaneous changes.
 */
export async function simultaneousEditWarning(
  cwd?: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const worktrees = await getWorktrees(cwd, signal);
  if (worktrees.length > 1) {
    const otherBranches = worktrees
      .filter((wt) => wt.branch)
      .map((wt) => wt.branch.replace('refs/heads/', ''));
    return (
      `⚠ Simultaneous edits detected: ${worktrees.length} active worktrees ` +
      `(${otherBranches.join(', ')}). Changes from other agents may mix ` +
      'into this commit. Consider using worktree isolation or verifying ' +
      'the diff below before committing.'
    );
  }
  return null;
}

/** Run git diff --cached and return both stat and full diff. */
export async function getStagedDiff(
  cwd?: string,
  signal?: AbortSignal,
): Promise<{ stat: string; diff: string }> {
  try {
    const stat = await runGit(['diff', '--cached', '--stat'], cwd, DEFAULT_GIT_TIMEOUT_MS, signal);
    // Limit full diff to prevent blowing up tool output
    const diff = await runGit(['diff', '--cached'], cwd, DEFAULT_GIT_TIMEOUT_MS, signal);
    const MAX_DIFF = 20_000;
    const truncated =
      diff.length > MAX_DIFF ? diff.slice(0, MAX_DIFF) + '\n\n... (diff truncated)' : diff;
    return { stat: stat || '(no stat)', diff: truncated || '(clean)' };
  } catch {
    return { stat: '(unavailable)', diff: '(unavailable)' };
  }
}

/**
 * Run `git diff --cached --stat/-- <paths>` scoped to the commit's own
 * pathspec slice, for the dry-run preview and LLM message generation.
 */
export async function getScopedStagedDiff(
  paths: string[],
  cwd?: string,
  signal?: AbortSignal,
): Promise<{ stat: string; diff: string }> {
  try {
    const stat = await runGit(
      ['diff', '--cached', '--stat', '--', ...paths],
      cwd,
      DEFAULT_GIT_TIMEOUT_MS,
      signal,
    );
    const diff = await runGit(
      ['diff', '--cached', '--', ...paths],
      cwd,
      DEFAULT_GIT_TIMEOUT_MS,
      signal,
    );
    const MAX_DIFF = 20_000;
    const truncated =
      diff.length > MAX_DIFF ? diff.slice(0, MAX_DIFF) + '\n\n... (diff truncated)' : diff;
    return { stat: stat || '(no stat)', diff: truncated || '(clean)' };
  } catch {
    return { stat: '(unavailable)', diff: '(unavailable)' };
  }
}

/**
 * Check for files modified by external agents AFTER staging but BEFORE commit.
 * Runs `git status --porcelain`; flags any unstaged changes (modified or
 * untracked files) that appeared since the last `git add`. This catches
 * simultaneous edits from agents working in the same directory without
 * worktree isolation.
 */
export async function externalChangesSinceStage(
  cwd?: string,
  signal?: AbortSignal,
): Promise<string[] | null> {
  try {
    const out = await runGit(['status', '--porcelain'], cwd, DEFAULT_GIT_TIMEOUT_MS, signal);
    if (!out) return null;
    const unstaged = out
      .split('\n')
      .filter((l) => l.trim())
      .filter((l) => {
        // `runGit` resolves with `stdout.trim()`, eating the leading space of
        // the FIRST status line when the index column is blank (` M path` →
        // `M path`). Detect that trimmed one-column shape (same logic as
        // parsePorcelainLine) and treat it as unstaged; otherwise the first
        // worktree-only change is classified as staged and never warns.
        const twoColumn = /^[MADRCUTX?! ]{2} /.test(l);
        const oneColumnTrimmed = !twoColumn && /^[MADRCUTX?!] /.test(l);
        if (oneColumnTrimmed) return true;
        // index column = ' ' or '?' means the change is NOT staged
        /* v8 ignore next -- non-empty lines guarantee l[0] is defined; the ?? ' ' fallback is defensive. */
        const idx = l[0] ?? ' ';
        // ' M' = modified in worktree, not staged
        // '??' = untracked
        return idx === ' ' || idx === '?';
      })
      // Same parser as `getChangedFiles`: a quoted path reported raw would
      // surface to the user with its git quoting still attached.
      .map((l) => parsePorcelainLine(l))
      .filter((p): p is string => p !== null && p.length > 0);
    return unstaged.length > 0 ? unstaged : null;
  } catch {
    return null;
  }
}
