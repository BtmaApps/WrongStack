import { spawn } from 'node:child_process';

import { access, readFile } from 'node:fs/promises';

import { join } from 'node:path';

import { buildChildEnv } from '@wrongstack/core/utils';

/** Async `fs.access`-style existence check — never throws. */
export async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Cap on captured command output. Verification commands (`pnpm test` across
 * a large monorepo) can emit tens of MB on a verbose run — accumulating the
 * full transcript spikes the host heap for output nothing ever reads in
 * full. runCmd keeps the TAIL (the failure summary lives at the end of a
 * test run); gitText keeps the head (its commands are tiny).
 */
export const MAX_CMD_OUTPUT = 200_000;

/** Run a git command, returning trimmed stdout (empty string on failure). */
export function gitText(args: string[], cwd: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn('git', args, {
        cwd,
        env: buildChildEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
        signal: AbortSignal.timeout(10_000),
        windowsHide: true,
      });
    } catch (err) {
      // spawn throws synchronously when git is not installed.
      reject(err);
      return;
    }
    const chunks: string[] = [];
    let total = 0; // running length — avoids an O(n²) chunks.join() per data event
    const emit = (c: Buffer) => {
      if (total < MAX_CMD_OUTPUT) {
        const s = c.toString();
        chunks.push(s);
        total += s.length;
      }
    };
    child.stdout?.on('data', emit);
    child.stderr?.on('data', emit);
    child.on('error', () => resolve({ code: 1, out: chunks.join('') }));
    child.on('close', (code) => resolve({ code: code ?? 1, out: chunks.join('').trim() }));
  });
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  const { code, out } = await gitText(['rev-parse', '--is-inside-work-tree'], cwd);
  return code === 0 && out.trim() === 'true';
}

// Commands allowed for autonomous goal verification. Intentionally NARROW:
// goal runs WITHOUT user confirmation, so its base set is just the
// package-manager script runners — far narrower than the `exec` tool's default
// allowlist (which includes build tools like go/cargo/make that execute
// arbitrary build scripts; fine when each call is user-confirmed, not for
// autonomous runs).
export const GOAL_BASE_SAFE_CMDS: ReadonlySet<string> = new Set(['pnpm', 'npm', 'yarn', 'bun']);

// Effective autonomous allowlist = base ∪ the user's EXPLICIT trusted
// `tools.exec.allow` − `tools.exec.deny`. We extend by the user's explicit
// opt-ins only (not exec's broadened defaults), and only from trusted config —
// `tools.exec.allow` is stripped from untrusted in-project repo config by the
// config loader, so a repo cannot widen what runs autonomously here.
export let goalAllowed: Set<string> = new Set(GOAL_BASE_SAFE_CMDS);

/**
 * Extend/trim the autonomous goal command allowlist from the user's exec
 * policy. Mirrors `configureExecPolicy` but keeps goal's narrower base.
 * Idempotent (always rebuilt from the base).
 */
export function configureGoalPolicy(
  opts: { allow?: readonly string[] | undefined; deny?: readonly string[] | undefined } = {},
): void {
  const next = new Set(GOAL_BASE_SAFE_CMDS);
  for (const c of opts.allow ?? []) {
    const n = c.trim();
    if (n) next.add(n);
  }
  for (const c of opts.deny ?? []) next.delete(c.trim());
  goalAllowed = next;
}

/** Reset the goal allowlist to its built-in base (tests / re-init). */
export function resetGoalPolicy(): void {
  goalAllowed = new Set(GOAL_BASE_SAFE_CMDS);
}

/** Whether `cmd` may run in autonomous goal verification. */
export function isGoalCommandAllowed(cmd: string): boolean {
  return goalAllowed.has(cmd.trim());
}

// Destructive shell patterns that must never execute autonomously.
// Mirrors the yolo-risk.ts pattern set for goal context.
export const DESTRUCTIVE_PATTERNS: readonly RegExp[] = [
  /\brm\s+-rf\s+\//,
  /\bdangerously\s+(?:force|reset|--hard)\b/,
  /\bgit\s+clean\s+-[xdf]{2,}/,
  /\bgit\s+reset\s+--hard\b/,
  /([;&|]\s*)(?!\s*$)/, // command chaining (; && || |)
  /`[^`]+`/, // backtick subshell
  /\$\(/, // $(...) subshell
];

/** Run an arbitrary command, capturing combined stdout+stderr. */
export function runCmd(
  cmd: string,
  args: string[],
  cwd: string,
  shell = false,
): Promise<{ code: number; out: string }> {
  // ── allowlist gate ──────────────────────────────────────────────────
  if (!isGoalCommandAllowed(cmd)) {
    return Promise.resolve({
      code: 1,
      out:
        `goal: command "${cmd}" not in autonomous safe-commands allowlist. ` +
        `Allowed: ${[...goalAllowed].join(', ')}. ` +
        `Add it to tools.exec.allow in the active profile config (trusted config only), ` +
        `or set WRONGSTACK_GOAL_VERIFY_CMD to an allowed command.`,
    });
  }

  // ── destructive-pattern gate ────────────────────────────────────────
  const fullCmd = [cmd, ...args].join(' ');
  for (const pat of DESTRUCTIVE_PATTERNS) {
    if (pat.test(fullCmd)) {
      return Promise.resolve({
        code: 1,
        out: `goal: rejected destructive command pattern: ${fullCmd}`,
      });
    }
  }

  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    let child;
    try {
      child = spawn(cmd, args, {
        cwd,
        env: buildChildEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
        // Pass through explicitly — allowlist validation already runs above,
        // so the caller's shell preference is authoritative.
        shell,
        signal: AbortSignal.timeout(30_000),
        windowsHide: true,
      });
    } catch (err) {
      reject(err);
      return;
    }
    // Tail-keep: a failing `pnpm test` prints its summary at the end, which
    // is what the verify failure message feeds back to the agent.
    const append = (c: Buffer) => {
      chunks.push(c.toString());
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    child.on('error', (e) => resolve({ code: 1, out: `${chunks.join('')}${String(e)}` }));
    child.on('close', (code) => {
      let out = chunks.join('');
      if (out.length > MAX_CMD_OUTPUT) out = out.slice(-MAX_CMD_OUTPUT);
      resolve({ code: code ?? 1, out: out.trim() });
    });
  });
}

/**
 * Detect the project's package manager from lockfiles at the repo root.
 * Async so the verify-step boot path doesn't block the event loop on `stat`
 * for missing files in CWD or in monorepo setups where the lockfile lives
 * several levels up.
 */
export async function detectPackageManager(root: string): Promise<string> {
  // Probe all three in parallel — every branch is a single stat each, and the
  // failure mode for a missing file is identical (EACCES/ENOENT). The first
  // hit wins; we don't care which one because only one lockfile is canonical
  // per project.
  const [pnpm, yarn, bun] = await Promise.all([
    pathExists(join(root, 'pnpm-lock.yaml')),
    pathExists(join(root, 'yarn.lock')),
    pathExists(join(root, 'bun.lockb')),
  ]);
  if (pnpm) return 'pnpm';
  if (yarn) return 'yarn';
  if (bun) return 'bun';
  return 'npm';
}

/** Read package.json scripts for a directory (empty on any failure). */
export async function readScripts(cwd: string): Promise<Record<string, string>> {
  try {
    const raw = await readFile(join(cwd, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}
