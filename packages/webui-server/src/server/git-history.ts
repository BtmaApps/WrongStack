import { toErrorMessage } from '@wrongstack/core/utils';
import type { WebSocket } from 'ws';
import { currentRepoPrefix, isUnsafeRelativePath, MAX_DIFF_BYTES } from './git-paths.js';
import { send } from './ws-utils.js';

/** Spawn `git` in `cwd` and resolve its trimmed stdout ('' on any error). */
export function makeGit(cwd: string | undefined) {
  return async (args: string[]): Promise<string> => {
    const { execFile: ef } = await import('node:child_process');
    return new Promise((resolve) => {
      ef(
        'git',
        args,
        { cwd, timeout: 5000, maxBuffer: 1024 * 1024 * 16 },
        (err: Error | null, stdout: string) => resolve(err ? '' : stdout),
      );
    });
  };
}

export interface GitHistoryCommit {
  hash: string;
  parents: string[];
  author: string;
  email: string;
  authoredAt: string;
  subject: string;
  refs: string[];
}

export interface GitHistoryRef {
  name: string;
  shortName: string;
  kind: 'local' | 'remote' | 'tag';
  hash: string;
  current: boolean;
}

export interface GitCommitFileStat {
  path: string;
  previousPath?: string | undefined;
  added: number;
  deleted: number;
  binary: boolean;
}

const HISTORY_FIELD = '\u001f';
const HISTORY_RECORD = '\u001e';

function cleanDecoration(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim().replace(/^HEAD -> /, ''))
    .filter(Boolean);
}

/** Read a bounded, topology-preserving repository history for the WebUI graph. */
export async function handleGitHistory(
  ws: WebSocket,
  projectRoot: string,
  options: {
    ref?: string | undefined;
    limit?: number | undefined;
    skip?: number | undefined;
  } = {},
): Promise<void> {
  const cwd = projectRoot || undefined;
  const limit = Math.max(1, Math.min(300, Math.trunc(options.limit ?? 120)));
  const skip = Math.max(0, Math.min(5_000, Math.trunc(options.skip ?? 0)));
  const requestedRef = typeof options.ref === 'string' ? options.ref.trim() : '';
  const safeRef =
    requestedRef && !requestedRef.startsWith('-') && !requestedRef.includes('\0')
      ? requestedRef
      : '';
  try {
    const git = makeGit(cwd);
    const logArgs = [
      'log',
      safeRef || '--all',
      '--topo-order',
      '--date-order',
      `--max-count=${limit + 1}`,
      `--skip=${skip}`,
      `--format=%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%D%x1e`,
    ];
    const [rawLog, rawRefs, currentBranch, repoRoot] = await Promise.all([
      git(logArgs),
      git([
        'for-each-ref',
        '--format=%(refname)%09%(refname:short)%09%(objectname)',
        'refs/heads',
        'refs/remotes',
        'refs/tags',
      ]),
      git(['branch', '--show-current']),
      git(['rev-parse', '--show-toplevel']),
    ]);

    const parsed = rawLog
      .split(HISTORY_RECORD)
      .map((record) => record.trim())
      .filter(Boolean)
      .map((record): GitHistoryCommit | null => {
        const [
          hash,
          parents = '',
          author = '',
          email = '',
          authoredAt = '',
          subject = '',
          refs = '',
        ] = record.split(HISTORY_FIELD);
        if (!hash || !/^[0-9a-f]{40,64}$/i.test(hash)) return null;
        return {
          hash,
          parents: parents.split(' ').filter(Boolean),
          author,
          email,
          authoredAt,
          subject,
          refs: cleanDecoration(refs),
        };
      })
      .filter((commit): commit is GitHistoryCommit => commit !== null);
    const hasMore = parsed.length > limit;
    const commits = hasMore ? parsed.slice(0, limit) : parsed;
    const current = currentBranch.trim();
    const refs: GitHistoryRef[] = rawRefs
      .split(/\r?\n/)
      .map((line) => line.split('\t'))
      .filter((parts) => parts.length >= 3)
      .map(([name = '', shortName = '', hash = '']) => ({
        name,
        shortName,
        hash,
        kind: name.startsWith('refs/heads/')
          ? ('local' as const)
          : name.startsWith('refs/remotes/')
            ? ('remote' as const)
            : ('tag' as const),
        current: name === `refs/heads/${current}`,
      }));

    send(ws, {
      type: 'git.history',
      payload: {
        commits,
        refs,
        currentBranch: current || '(detached)',
        repoRoot: repoRoot.trim(),
        hasMore,
        skip,
      },
    });
  } catch (error) {
    send(ws, {
      type: 'git.history',
      payload: {
        commits: [],
        refs: [],
        currentBranch: '',
        repoRoot: '',
        hasMore: false,
        skip,
        error: toErrorMessage(error),
      },
    });
  }
}

/** Resolve one commit's metadata and bounded changed-file summary. */
export async function handleGitCommitDetail(
  ws: WebSocket,
  projectRoot: string,
  hash: string,
): Promise<void> {
  const reply = (payload: Record<string, unknown>) =>
    send(ws, { type: 'git.commit_detail', payload: { hash, ...payload } });
  if (!/^[0-9a-f]{4,64}$/i.test(hash)) {
    reply({ error: 'invalid commit hash' });
    return;
  }
  const cwd = projectRoot || undefined;
  try {
    const git = makeGit(cwd);
    const [metaRaw, statsRaw] = await Promise.all([
      git(['show', '--no-patch', `--format=%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%B`, hash]),
      git(['diff-tree', '--no-commit-id', '--numstat', '-z', '-r', '-M', '--root', hash]),
    ]);
    const [fullHash = hash, parents = '', author = '', email = '', authoredAt = '', ...bodyParts] =
      metaRaw.trim().split(HISTORY_FIELD);
    const parsedFiles = parseCommitNumstat(statsRaw);
    const prefix = await currentRepoPrefix(projectRoot);
    const scopedFiles = prefix
      ? parsedFiles.filter((file) => file.path.startsWith(prefix))
      : parsedFiles;
    const files = scopedFiles.slice(0, 400);
    reply({
      fullHash,
      parents: parents.split(' ').filter(Boolean),
      author,
      email,
      authoredAt,
      body: bodyParts.join(HISTORY_FIELD).trim(),
      files,
      truncated: scopedFiles.length > files.length,
    });
  } catch (error) {
    reply({ error: toErrorMessage(error) });
  }
}

function parseCommitNumstat(raw: string): GitCommitFileStat[] {
  const records = raw.split('\0');
  const files: GitCommitFileStat[] = [];
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (!record) continue;
    const match = /^(\d+|-)\t(\d+|-)\t(.*)$/.exec(record);
    if (!match) continue;
    let path = match[3] ?? '';
    let previousPath: string | undefined;
    if (!path) {
      previousPath = records[index + 1] || undefined;
      path = records[index + 2] || '';
      index += 2;
    }
    if (!path) continue;
    files.push({
      path,
      ...(previousPath ? { previousPath } : {}),
      added: match[1] === '-' ? 0 : Number(match[1]) || 0,
      deleted: match[2] === '-' ? 0 : Number(match[2]) || 0,
      binary: match[1] === '-' || match[2] === '-',
    });
  }
  return files;
}

/** Read one file before and after a commit using first-parent semantics. */
export async function handleGitCommitFileDiff(
  ws: WebSocket,
  projectRoot: string,
  input: { hash: string; path: string; previousPath?: string | undefined },
): Promise<void> {
  const { hash, path, previousPath } = input;
  const reply = (payload: Record<string, unknown>) =>
    send(ws, { type: 'git.commit_file_diff', payload: { hash, path, ...payload } });
  if (!/^[0-9a-f]{4,64}$/i.test(hash)) {
    reply({ error: 'invalid commit hash' });
    return;
  }
  if (isUnsafeRelativePath(path) || (previousPath && isUnsafeRelativePath(previousPath))) {
    reply({ error: 'invalid path' });
    return;
  }
  const prefix = await currentRepoPrefix(projectRoot);
  if (
    prefix &&
    (!path.startsWith(prefix) || (previousPath !== undefined && !previousPath.startsWith(prefix)))
  ) {
    reply({ error: 'path outside project root' });
    return;
  }
  try {
    const git = makeGit(projectRoot || undefined);
    const lineage = (await git(['rev-list', '--parents', '-n', '1', hash])).trim().split(/\s+/);
    const parent = lineage[1];
    const oldPath = previousPath || path;
    const [oldText, newText] = await Promise.all([
      parent ? git(['show', `${parent}:${oldPath}`]) : Promise.resolve(''),
      git(['show', `${hash}:${path}`]),
    ]);
    if (oldText.includes('\0') || newText.includes('\0')) {
      reply({ oldText: '', newText: '', binary: true });
      return;
    }
    if (oldText.length > MAX_DIFF_BYTES || newText.length > MAX_DIFF_BYTES) {
      reply({ oldText: '', newText: '', tooLarge: true });
      return;
    }
    reply({ oldText, newText, previousPath });
  } catch (error) {
    reply({
      oldText: '',
      newText: '',
      error: toErrorMessage(error),
    });
  }
}
