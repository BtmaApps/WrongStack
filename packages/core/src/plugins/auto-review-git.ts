import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { parsePorcelainStatusZ } from './review-context-builder.js';

export interface ChangedFile {
  path: string;
  status: 'added' | 'modified';
}

export interface ChangedFileSnapshot extends ChangedFile {
  content: string;
  fingerprint: string;
}

export const MAX_SNAPSHOT_FILE_BYTES = 256 * 1024;
export const MAX_SNAPSHOT_TOTAL_BYTES = 8 * 1024 * 1024;

export async function runGit(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn('git', args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        signal: AbortSignal.timeout(15_000),
        windowsHide: true,
      });
    } catch (err) {
      reject(err);
      return;
    }
    let stdout = '';
    let stderr = '';
    // Decode across chunks: `+= chunk` decodes each Buffer alone and turns a
    // multibyte UTF-8 character split at a pipe-chunk boundary into U+FFFD.
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (d) => {
      stdout += d;
    });
    child.stderr?.on('data', (d) => {
      stderr += d;
    });
    child.on('error', () => resolve({ stdout, stderr, code: 1 }));
    // `code` is null only when git was killed by a signal — never a success.
    child.on('close', (code) => resolve({ stdout, stderr, code: code ?? 1 }));
  });
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  const r = await runGit(['rev-parse', '--git-dir'], cwd);
  return r.code === 0;
}

export async function getChangedFiles(cwd: string): Promise<ChangedFile[]> {
  // -z: line output C-quotes names with spaces/non-ASCII (`"my notes.ts"`), and a
  // quoted path fails every later read, so the file silently left the review.
  const r = await runGit(['status', '--porcelain', '-z', '--untracked-files=no'], cwd);
  if (r.code !== 0) return [];
  const files: ChangedFile[] = [];
  for (const { path: filePath, status } of parsePorcelainStatusZ(r.stdout)) {
    if (status.includes('A')) {
      files.push({ path: filePath, status: 'added' });
    } else if (status.includes('M') || status.startsWith('R') || status.startsWith('C')) {
      files.push({ path: filePath, status: 'modified' });
    }
  }
  return files;
}

export async function snapshotChangedFiles(cwd: string): Promise<ChangedFileSnapshot[]> {
  const snapshots: ChangedFileSnapshot[] = [];
  let budget = MAX_SNAPSHOT_TOTAL_BYTES;
  for (const file of await getChangedFiles(cwd)) {
    if (file.path.startsWith('.wrongstack/')) continue;
    if (budget <= 0) break;
    try {
      const stat = await fsp.stat(path.join(cwd, file.path));
      if (!stat.isFile() || stat.size > MAX_SNAPSHOT_FILE_BYTES) continue;
      const content = await fsp.readFile(path.join(cwd, file.path), 'utf8');
      budget -= content.length;
      snapshots.push({
        ...file,
        content,
        fingerprint: createHash('sha256').update(content).digest('hex'),
      });
    } catch {
      // File deleted, unreadable, or not a regular UTF-8 file — skip it.
    }
  }
  return snapshots;
}
