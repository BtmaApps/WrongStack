/**
 * Passive flaky-test memory: remember which tests failed on which code, and
 * tell the model when a failing test passed the identical command on the
 * identical code before — so it re-runs the test instead of changing code for
 * a flake.
 *
 * The key is (working-tree fingerprint, command). The fingerprint hashes
 * `HEAD`, the full `git diff HEAD` and every untracked file (name + content), so any
 * code change gives a new key and a failure after a change is never called
 * flaky. The command is part of the key because it decides which tests ran:
 * a test absent from a filtered run's failures did not pass, it did not run.
 *
 * Only FAILURES are parsed. The shell tools' output diet leaves passing-test
 * lines out of what the model (and this hook) reads, so a pass is inferred:
 * a run that completed (its summary line is present) and does not list the
 * test among its failures passed it.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { buildChildEnv } from '@wrongstack/core/utils';

/** Runs kept per (fingerprint, command); older ones go first. */
const MAX_RUNS_PER_KEY = 10;
/** Keys kept in all; the least recently used go first. */
const MAX_KEYS = 200;
/** A run older than this is forgotten. */
const WINDOW_MS = 7 * 86_400_000;

interface Run {
  at: number;
  failed: ReadonlySet<string>;
}

// A runner invoked as a command word, as in the shell tools' output diet.
const TEST_COMMAND =
  /(?:^|[\s;&|(])(?:vitest|jest|mocha|pytest)(?=\s|$)|\bpython3?\s+-m\s+pytest\b|\bbun\s+test\b|\bgo\s+test\b|\bcargo\s+(?:test|nextest)\b|\b(?:pnpm|npm|yarn|bun)\b[^;&|\n]*?\s(?:run\s+)?test(?::\S+)?(?=\s|$)/;

export function isTestCommand(command: string): boolean {
  return TEST_COMMAND.test(command);
}

/** A trailing duration (`12ms`, `1.2s`, `(0.01s)`) varies between runs of one test. */
export function stripDuration(name: string): string {
  return name
    .replace(/\s+\(?\d+(?:\.\d+)?\s?m?s\)?$/, '')
    .replace(/\s+\[\s*\d+(?:\.\d+)?\s?m?s\]$/, '')
    .trim();
}

/**
 * The failing tests an output names, normalized so two runs of one test
 * compare equal. Covers vitest/jest/mocha, pytest, go test and cargo test.
 */
const FAILURE_LINES: ReadonlyArray<{ re: RegExp; prefix: string }> = [
  // vitest `× file > test 12ms`, mocha `✗`, jest `✕`.
  { re: /^[✕✗×]\s+(.+)$/, prefix: '' },
  // vitest summary `FAIL  file > test`; jest's `FAIL path` names a FILE — bare paths skipped.
  { re: /^FAIL\s+(.+\s>\s.+)$/, prefix: '' },
  // pytest `FAILED tests/x.py::test_y - AssertionError`
  { re: /^FAILED\s+(\S+::\S+)/, prefix: '' },
  // go `--- FAIL: TestX (0.01s)`
  { re: /^--- FAIL:\s+(\S+)/, prefix: 'go:' },
  // cargo `test tests::x ... FAILED`
  { re: /^test\s+(\S+)\s+\.\.\.\s+FAILED$/, prefix: 'cargo:' },
];

export function parseFailedTests(output: string): Set<string> {
  const failed = new Set<string>();
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    for (const { re, prefix } of FAILURE_LINES) {
      const name = re.exec(line)?.[1];
      if (name === undefined) continue;
      const normalized = stripDuration(name);
      if (normalized) failed.add(`${prefix}${normalized}`);
      break;
    }
  }
  return failed;
}

/** True when the output carries the runner's end-of-run summary: the run completed. */
export function runCompleted(output: string): boolean {
  return (
    /^\s*Tests\s+.*\b(?:passed|failed)\b/m.test(output) || // vitest / jest
    /^=+ .*\b(?:passed|failed|error)\b.* in [\d.]+s/m.test(output) || // pytest
    /^(?:ok|FAIL)\s+\S+\s+[\d.]+s$/m.test(output) || // go
    /^test result: (?:ok|FAILED)\./m.test(output) // cargo
  );
}

function git(cwd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      {
        cwd,
        env: buildChildEnv(),
        windowsHide: true,
        maxBuffer: 64 * 1024 * 1024,
        timeout: 10_000,
      },
      (err, stdout) => resolve(err ? null : stdout),
    );
  });
}

/** Untracked files up to this size are hashed by content; larger ones by size + mtime. */
const UNTRACKED_CONTENT_HASH_MAX_BYTES = 1024 * 1024;

/**
 * Hash of HEAD + the tracked diff + every untracked file's name AND content;
 * null outside a git repository.
 *
 * Names alone kept the key fixed while a brand-new (untracked) module was
 * edited, so a test broken by that edit was reported as having passed "on
 * this same code" earlier — a flake verdict for a real regression.
 */
export async function treeFingerprint(cwd: string): Promise<string | null> {
  const [head, diff, untracked] = await Promise.all([
    git(cwd, ['rev-parse', 'HEAD']),
    git(cwd, ['diff', 'HEAD', '--no-ext-diff', '--binary']),
    git(cwd, ['ls-files', '--others', '--exclude-standard', '-z']),
  ]);
  if (head === null || diff === null || untracked === null) return null;
  const hash = createHash('sha256').update(head).update('\0').update(diff).update('\0');
  for (const name of untracked.split('\0').filter(Boolean)) {
    hash.update(name).update('\0');
    const file = join(cwd, name);
    try {
      const info = await stat(file);
      hash.update(
        info.size <= UNTRACKED_CONTENT_HASH_MAX_BYTES
          ? await readFile(file)
          : `${info.size}:${info.mtimeMs}`,
      );
    } catch {
      // Vanished between listing and reading: its name is still hashed.
    }
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 32);
}

export interface FlakyFinding {
  test: string;
  /** Earlier completed runs of this key that passed the test. */
  passedBefore: number;
  /** Runs of this key, this one included, that failed it. */
  failedRuns: number;
  totalRuns: number;
}

export class FlakyMemory {
  readonly #runs = new Map<string, Run[]>();

  clear(): void {
    this.#runs.clear();
  }

  get size(): number {
    return this.#runs.size;
  }

  /**
   * Record one completed run and return the failing tests that an earlier
   * completed run of the same key passed.
   */
  record(
    fingerprint: string,
    command: string,
    failed: ReadonlySet<string>,
    now = Date.now(),
  ): FlakyFinding[] {
    const key = `${fingerprint}\0${command.trim()}`;
    const earlier = (this.#runs.get(key) ?? []).filter((r) => now - r.at < WINDOW_MS);
    const findings: FlakyFinding[] = [];
    for (const test of failed) {
      const passedBefore = earlier.filter((r) => !r.failed.has(test)).length;
      if (passedBefore === 0) continue;
      findings.push({
        test,
        passedBefore,
        failedRuns: earlier.filter((r) => r.failed.has(test)).length + 1,
        totalRuns: earlier.length + 1,
      });
    }
    const runs = [...earlier, { at: now, failed }].slice(-MAX_RUNS_PER_KEY);
    // Re-insert so iteration order is least-recently-used first.
    this.#runs.delete(key);
    this.#runs.set(key, runs);
    while (this.#runs.size > MAX_KEYS) {
      const oldest = this.#runs.keys().next().value;
      if (oldest === undefined) break;
      this.#runs.delete(oldest);
    }
    return findings;
  }
}

/** The note the model reads under the failing run. */
export function flakyNote(findings: readonly FlakyFinding[]): string {
  const named = findings
    .map((f) => `${f.test} (failed ${f.failedRuns} of ${f.totalRuns} runs)`)
    .join('; ');
  return (
    `test-flake-detector: ${named} — the identical command passed ${findings.length === 1 ? 'this test' : 'these tests'} ` +
    'on this same code earlier, so the failure may be a flake rather than a regression. Re-run it before changing code for it; ' +
    'use flake_detect to measure it if it keeps alternating.'
  );
}
