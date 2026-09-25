/**
 * The one way core runs a version-control binary: bounded output, a timeout,
 * the scrubbed child environment, and no console window on Windows. A failure
 * to start the binary resolves with a non-zero code instead of throwing, so a
 * missing `jj` or `hg` reads the same as "not a repository".
 *
 * @module vcs/vcs-runner
 */
import { spawn } from 'node:child_process';
import { buildChildEnv } from '../utils/child-env.js';

export interface VcsRunResult {
  code: number;
  stdout: string;
  stderr: string;
  /** Set when output past `maxOutputBytes` was discarded. */
  stdoutTruncated?: boolean | undefined;
  stderrTruncated?: boolean | undefined;
}

/** Runs one VCS command. Injected in tests. */
export type VcsRunner = (
  binary: string,
  args: readonly string[],
  cwd: string,
) => Promise<VcsRunResult>;

export interface VcsRunOptions {
  maxOutputBytes?: number | undefined;
  timeoutMs?: number | undefined;
  /** Extra environment on top of the scrubbed child environment. */
  env?: Record<string, string> | undefined;
}

const DEFAULT_MAX_OUTPUT = 16 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

export function runVcs(
  binary: string,
  args: readonly string[],
  cwd: string,
  opts: VcsRunOptions = {},
): Promise<VcsRunResult> {
  const maxOutput = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
  return new Promise((resolve) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    const child = spawn(binary, [...args], {
      cwd,
      env: { ...buildChildEnv(), ...opts.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      windowsHide: true,
    });
    child.stdout?.on('data', (chunk: Buffer) => {
      const remaining = maxOutput - stdoutBytes;
      if (remaining <= 0) {
        stdoutTruncated = true;
        return;
      }
      const kept = chunk.subarray(0, remaining);
      stdoutChunks.push(kept);
      stdoutBytes += kept.length;
      if (kept.length < chunk.length) stdoutTruncated = true;
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const remaining = maxOutput - stderrBytes;
      if (remaining <= 0) {
        stderrTruncated = true;
        return;
      }
      const kept = chunk.subarray(0, remaining);
      stderrChunks.push(kept);
      stderrBytes += kept.length;
      if (kept.length < chunk.length) stderrTruncated = true;
    });
    let settled = false;
    const result = (code: number, extraStderr?: string): void => {
      if (settled) return;
      settled = true;
      resolve({
        code,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: `${Buffer.concat(stderrChunks).toString('utf8')}${extraStderr ?? ''}`,
        stdoutTruncated,
        stderrTruncated,
      });
    };
    child.on('error', (err) => result(1, err.message));
    child.on('close', (code) => result(code ?? 1));
  });
}
