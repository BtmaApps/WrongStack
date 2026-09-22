/**
 * Main indexing orchestrator.
 *
 * Given a project root and a list of files:
 * 1. Parse each file with the appropriate parser (TS, Go, Python, Rust, JSON, YAML)
 * 2. Delete old symbols for changed/deleted files
 * 3. Insert new symbols
 * 4. Update file metadata
 * 5. Return index statistics
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { Dirent, Stats } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { DEFAULT_WALK_IGNORE_DIRS } from '@wrongstack/core/utils';
import { xxhash64String as contentHashHex } from './content-hash.js';
import type { IgnoreMatcher } from './gitignore.js';
import { throwIfAborted, YIELD_EVERY_N, yieldEventLoop } from './index-scheduling.js';
import { detectLang, INDEXABLE_EXTENSIONS } from './languages.js';
import type { IndexStore } from './writer.js';

export const DEFAULT_IGNORE = DEFAULT_WALK_IGNORE_DIRS;
export const DEFAULT_IGNORE_FILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'pnpm-lock.yml',
]);

/**
 * The atlas projection, which is derived FROM this index.
 *
 * Indexing it makes the index describe its own output: every `--write` changes
 * three files, the next index run picks them up, and the freshness check then
 * reports drift caused by nothing but writing the atlas. It is a committed
 * artifact rather than source, and it carries no symbols worth searching.
 */
const ATLAS_PROJECTION_PREFIX = '.wrongstack/atlas/';

/** True for a project-relative posix path inside the atlas projection. */
export function isAtlasProjection(relativePosixPath: string): boolean {
  return relativePosixPath.startsWith(ATLAS_PROJECTION_PREFIX);
}
const INDEXABLE_EXTENSION_SET = new Set(INDEXABLE_EXTENSIONS);
export const MAX_INDEX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_GIT_FILE_LIST_BYTES = 64 * 1024 * 1024;
export const GIT_SNAPSHOT_METADATA_KEY = 'git_discovery_snapshot';

export class IndexSourceChangedError extends Error {
  override name = 'IndexSourceChangedError';
}

export function isWithinProject(projectRoot: string, file: string): boolean {
  const rel = path.relative(projectRoot, file);
  return rel !== '' && !rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel);
}

export function isMissingPathError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function normalizeComparablePath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function gitOutput(projectRoot: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['-C', projectRoot, ...args],
      {
        encoding: 'buffer',
        maxBuffer: MAX_GIT_FILE_LIST_BYTES,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout));
      },
    );
  });
}

/**
 * Git already maintains the canonical tracked/untracked directory index. On a
 * repository root this avoids hundreds of serial `readdir` calls; non-Git
 * projects and nested roots fall back to the filesystem walker below.
 */
export async function findGitSourceFiles(
  projectRoot: string,
  ignore: string[],
  signal?: AbortSignal | undefined,
  isGitIgnored?: IgnoreMatcher,
): Promise<{ files: string[]; trustedUnchanged: Set<string>; snapshotKey: string } | null> {
  try {
    throwIfAborted(signal);
    const topLevel = (await gitOutput(projectRoot, ['rev-parse', '--show-toplevel']))
      .toString('utf8')
      .trim();
    if (normalizeComparablePath(topLevel) !== normalizeComparablePath(projectRoot)) return null;

    throwIfAborted(signal);
    const ignoreSet = new Set([...DEFAULT_IGNORE, ...ignore]);
    const [output, statusOutput, stagedOutput] = await Promise.all([
      gitOutput(projectRoot, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']),
      gitOutput(projectRoot, [
        'status',
        '--porcelain=v1',
        '-z',
        '--untracked-files=all',
        '--ignored=no',
      ]),
      gitOutput(projectRoot, ['ls-files', '--stage', '-z']),
    ]);
    throwIfAborted(signal);
    const dirty = new Set<string>();
    const deleted = new Set<string>();
    const statusRecords = statusOutput.toString('utf8').split('\0');
    for (let i = 0; i < statusRecords.length; i++) {
      const record = statusRecords[i];
      if (!record) continue;
      const status = record.slice(0, 2);
      const changedPath = path.resolve(projectRoot, record.slice(3));
      dirty.add(changedPath);
      if (status.includes('D')) deleted.add(changedPath);
      if (status.includes('R') || status.includes('C')) {
        const source = statusRecords[++i];
        if (source) dirty.add(path.resolve(projectRoot, source));
      }
    }
    const files: string[] = [];
    for (const relative of output.toString('utf8').split('\0')) {
      if (!relative) continue;
      const portable = relative.replace(/\\/g, '/');
      if (
        portable.split('/').some((segment) => ignoreSet.has(segment)) ||
        DEFAULT_IGNORE_FILES.has(path.posix.basename(portable)) ||
        isAtlasProjection(portable) ||
        (isGitIgnored?.(portable, false) ?? false)
      ) {
        continue;
      }
      const full = path.resolve(projectRoot, relative);
      if (deleted.has(full)) continue;
      const ext = path.extname(relative).toLowerCase();
      if (INDEXABLE_EXTENSION_SET.has(ext) || detectLang(full) !== null) files.push(full);
    }
    const snapshot = createHash('sha256').update(stagedOutput).update('\0').update(statusOutput);
    const indexedFiles = new Set(files);
    for (const dirtyFile of [...dirty].sort()) {
      if (!indexedFiles.has(dirtyFile) || deleted.has(dirtyFile)) continue;
      snapshot.update('\0').update(dirtyFile).update('\0');
      snapshot.update(contentHashHex(await fs.readFile(dirtyFile, 'utf8')));
    }
    return {
      files,
      trustedUnchanged: new Set(files.filter((file) => !dirty.has(file))),
      snapshotKey: snapshot.digest('hex'),
    };
  } catch {
    return null;
  }
}

/**
 * Expand the directories in a targeted file list.
 *
 * A directory deleted or renamed outside the agent reaches the watcher as ONE
 * event naming the directory. A targeted run used to stat that path, find a
 * directory (skipped: not a file) or nothing (`deleteFile(dir)` matched no
 * row), and leave every file under it indexed — search and the call graph
 * kept answering from deleted sources, and the renamed copies were never
 * indexed. A non-indexable path is therefore replaced by the indexed files
 * under it (vanished ones are then removed as missing) plus the indexable
 * files now on disk there. Indexable file paths pass through untouched, so
 * the per-edit hot path never reads the file table.
 */
export async function expandTargetedDirectories(
  store: IndexStore,
  projectRoot: string,
  targets: string[],
  isGitIgnored: IgnoreMatcher,
  signal: AbortSignal | undefined,
): Promise<string[]> {
  const isIndexableName = (file: string) =>
    INDEXABLE_EXTENSION_SET.has(path.extname(file).toLowerCase()) || detectLang(file) !== null;
  const expanded = new Set<string>();
  let indexedFiles: string[] | undefined;
  for (const target of targets) {
    if (isIndexableName(target) || !isWithinProject(projectRoot, target)) {
      expanded.add(target);
      continue;
    }
    let stats: Stats | undefined;
    try {
      stats = await fs.stat(target);
    } catch (err) {
      if (!isMissingPathError(err)) {
        expanded.add(target);
        continue;
      }
    }
    if (stats && !stats.isDirectory()) {
      expanded.add(target);
      continue;
    }
    indexedFiles ??= store.getAllFileMetas().map((meta) => meta.file);
    const prefix = normalizeComparablePath(target) + path.sep;
    for (const file of indexedFiles) {
      if (normalizeComparablePath(file).startsWith(prefix)) expanded.add(file);
    }
    if (!stats) continue;
    const walk = async (dir: string): Promise<void> => {
      throwIfAborted(signal);
      let entries: Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (DEFAULT_IGNORE.includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        const rel = path.relative(projectRoot, full).replace(/\\/g, '/');
        if (entry.isDirectory()) {
          if (!isGitIgnored(rel, true)) await walk(full);
        } else if (entry.isFile() && isIndexableName(full)) {
          expanded.add(full);
        }
      }
    };
    await walk(target);
  }
  return [...expanded];
}

export async function findSourceFiles(
  projectRoot: string,
  ignore: string[],
  isGitIgnored: IgnoreMatcher,
  signal?: AbortSignal | undefined,
): Promise<{
  files: string[];
  complete: boolean;
  errors: string[];
  trustedUnchanged?: Set<string>;
  snapshotKey?: string;
}> {
  const gitFiles = await findGitSourceFiles(projectRoot, ignore, signal, isGitIgnored);
  if (gitFiles) {
    return {
      files: gitFiles.files,
      complete: true,
      errors: [],
      trustedUnchanged: gitFiles.trustedUnchanged,
      snapshotKey: gitFiles.snapshotKey,
    };
  }

  const results: string[] = [];
  const errors: string[] = [];
  let complete = true;
  const ignoreSet = new Set([...DEFAULT_IGNORE, ...ignore]);
  // Extension allow-list from languages.ts — every mapped language is discovered.
  // Special filenames (Makefile, Dockerfile, …) are accepted via detectLang.
  const indexableExts = new Set(INDEXABLE_EXTENSIONS);

  let dirCount = 0;

  const walk = async (dir: string): Promise<void> => {
    // Yield + abort check before every readdir so a cancelled indexer
    // doesn't descend deeper into the tree.
    throwIfAborted(signal);
    // Periodically yield the event loop so the main thread stays responsive
    // during deep directory walks (Node 22's fs.promises.readdir doesn't
    // accept AbortSignal, so we rely on cooperative polling).
    if (dirCount > 0 && dirCount % YIELD_EVERY_N === 0) {
      await yieldEventLoop();
      throwIfAborted(signal);
    }
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      complete = false;
      errors.push(`scan error: ${dir}: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    dirCount++;

    for (const e of entries) {
      if (ignoreSet.has(e.name)) continue;
      const full = path.join(dir, e.name);
      // Normalize to forward-slash relative path for pattern matching
      const rel = path.relative(projectRoot, full).replace(/\\/g, '/');
      if (e.isDirectory()) {
        // Prune .gitignore'd directories before descending (skips node_modules,
        // build output, and any project-specific ignored dirs).
        if (isGitIgnored(rel, true)) continue;
        await walk(full);
      } else if (e.isFile()) {
        if (DEFAULT_IGNORE_FILES.has(e.name) || isGitIgnored(rel, false)) continue;
        if (isAtlasProjection(rel)) continue;
        const ext = path.extname(e.name).toLowerCase();
        // Fast path: known extension. Slow path: special basenames (Makefile…).
        if (indexableExts.has(ext) || detectLang(full) !== null) {
          results.push(full);
        }
      }
    }
  };

  await walk(projectRoot);
  return { files: results, complete, errors };
}
