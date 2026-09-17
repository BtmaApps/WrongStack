import { spawn } from 'node:child_process';
import type { AnyHookOutcome, HookInput, HookOutcome } from '../types/hooks.js';
import type { Logger } from '../types/logger.js';
import { buildChildEnv } from '../utils/child-env.js';
import { toErrorMessage } from '../utils/error.js';

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_OUTPUT_BYTES = 64 * 1024;

// Allowlist of safe shell commands for hooks. Commands not in this list are rejected.
// This prevents arbitrary command execution if a hook config file is compromised.
// For custom commands, operators should either:
//   1. Use absolute paths to trusted executables
//   2. Create wrapper scripts under .wrongstack/hooks/ and reference them by absolute path
const ALLOWED_SHELL_COMMANDS = new Set([
  // POSIX shells + Windows shells
  'bash',
  'sh',
  'dash',
  'zsh',
  'fish',
  'pwsh',
  'powershell',
  'cmd',
  // Script interpreters — hooks are routinely small node/python scripts
  'node',
  'deno',
  'bun',
  'npx',
  'npm',
  'pnpm',
  'yarn',
  'python',
  'python3',
  'perl',
  'ruby',
  // Utilities
  'echo',
  'cat',
  'grep',
  'sed',
  'awk',
  'find',
  'sort',
  'uniq',
  'wc',
  'head',
  'tail',
  'cut',
  'tr',
  'tee',
  'xargs',
  'printf',
  'test',
  'expr',
  // File operations
  'ls',
  'stat',
  'touch',
  'mkdir',
  'rm',
  'cp',
  'mv',
  'chmod',
  'chown',
  // Network (read-only)
  'curl',
  'wget',
  // Git (common operations)
  'git',
  'diff',
  'merge',
  // Process
  'ps',
  'kill',
  'pgrep',
  'pkill',
  // Text processing
  'jq',
  'yq',
  // System info
  'uname',
  'hostname',
  'whoami',
  'date',
]);

/** Absolute path on either platform (POSIX `/...` or Windows `C:\...` / `C:/...`). */
function isAbsoluteCommandPath(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
}

function isCommandAllowed(command: string): string[] | null {
  // Split the command into argv by whitespace. This also prevents shell
  // chaining operators (&&, ||, |, ;) from being interpreted as such —
  // they become literal arguments to the executable. Hooks that need
  // pipes, redirects, or variable expansion should use `sh -c "..."`.
  const argv = command.trim().split(/\s+/);
  if (argv.length === 0 || argv[0]!.length === 0) return null;
  const executable = argv[0]!;
  // Documented escape hatch #1: absolute paths reference operator-authored
  // trusted executables (incl. wrapper scripts under .wrongstack/hooks/) and
  // are allowed as-is — on both POSIX and Windows path syntax.
  if (isAbsoluteCommandPath(executable)) return argv;
  // Relative path with separators (e.g. ./scripts/hook.sh) — judge by filename.
  const commandName = /[\\/]/.test(executable)
    ? (executable.split(/[\\/]/).pop() ?? executable)
    : executable;

  if (ALLOWED_SHELL_COMMANDS.has(commandName)) return argv;
  return null;
}

export interface ShellHookSpec {
  command: string;
  timeoutMs?: number | undefined;
}

export type HookExecutionFailureKind =
  | 'aborted'
  | 'error'
  | 'exit'
  | 'invalid_output'
  | 'rejected'
  | 'timeout';

export interface HookExecutionFailure {
  kind: HookExecutionFailureKind;
  message: string;
}

export interface HookExecutionResult {
  outcome: AnyHookOutcome | null;
  failure?: HookExecutionFailure | undefined;
}

export interface HookExecutionOptions {
  signal?: AbortSignal | undefined;
}

function killProcessTree(child: ReturnType<typeof spawn>): void {
  const pid = child.pid;
  if (typeof pid === 'number') {
    if (process.platform === 'win32') {
      try {
        const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
        killer.unref();
        return;
      } catch {
        // Fall through to direct kill.
      }
    } else {
      try {
        // Command hooks are detached into their own process group on POSIX.
        process.kill(-pid, 'SIGKILL');
        return;
      } catch {
        // Fall through to direct kill.
      }
    }
  }
  try {
    child.kill('SIGKILL');
  } catch {
    /* ignore */
  }
}

/**
 * Run a shell hook (Claude-compatible). The `HookInput` JSON is written to the
 * command's stdin. Resolution rules, in order:
 *   - exit code 2 → `{ decision: 'block', reason: <stderr or stdout> }`
 *   - stdout parses as a JSON object → returned verbatim as a `HookOutcome`
 *   - otherwise → no-op (`null`)
 *
 * The hook never throws into the agent loop: spawn errors and timeouts resolve
 * to `null` and are logged. Output is capped at 64 KiB.
 */
export async function runShellHook(
  spec: ShellHookSpec,
  input: HookInput,
  logger?: Logger | undefined,
): Promise<HookOutcome | null> {
  const result = await runShellHookDetailed(spec, input, logger);
  if (result.outcome && 'action' in result.outcome) {
    if (result.outcome.action === 'deny') {
      return { decision: 'block', reason: result.outcome.reason };
    }
    if (result.outcome.action === 'mutate') {
      return { decision: 'allow', modifiedInput: result.outcome.input };
    }
    return { decision: 'allow' };
  }
  return result.outcome as HookOutcome | null;
}

/** Detailed executor used by HookRunner to apply per-hook failure policy. */
export async function runShellHookDetailed(
  spec: ShellHookSpec,
  input: HookInput,
  logger?: Logger | undefined,
  options: HookExecutionOptions = {},
): Promise<HookExecutionResult> {
  const timeoutMs = Math.max(1, Math.min(spec.timeoutMs ?? DEFAULT_TIMEOUT_MS, 10 * 60_000));

  // Security: reject commands not in the allowlist
  const argv = isCommandAllowed(spec.command);
  if (!argv) {
    logger?.warn?.(`hook rejected: command not in allowlist: ${spec.command}`);
    return {
      outcome: null,
      failure: { kind: 'rejected', message: 'command is not in the hook allowlist' },
    };
  }

  return await new Promise<HookExecutionResult>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (v: HookExecutionResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      resolve(v);
    };

    let child: ReturnType<typeof spawn>;
    try {
      // Security: spawn WITHOUT shell so the command string is never
      // interpreted by a shell — shell chaining operators (&&, ||, |, ;)
      // become literal arguments. The executable + args are split by
      // isCommandAllowed above. Hooks that need pipes/redirects should
      // use `sh -c "..."` which is allowlisted through sh/bash.
      const cmd = argv[0]!;
      const args = argv.slice(1);
      child = spawn(cmd, args, {
        cwd: input.cwd,
        env: buildChildEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        detached: process.platform !== 'win32',
      });
    } catch (err) {
      logger?.warn?.(`hook spawn failed: ${toErrorMessage(err)}`);
      return resolve({
        outcome: null,
        failure: { kind: 'error', message: `spawn failed: ${toErrorMessage(err)}` },
      });
    }

    const onAbort = () => {
      killProcessTree(child);
      done({ outcome: null, failure: { kind: 'aborted', message: 'hook invocation aborted' } });
    };

    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    options.signal?.addEventListener('abort', onAbort, { once: true });

    timer = setTimeout(() => {
      logger?.warn?.(`hook command timed out after ${timeoutMs}ms: ${spec.command}`);
      killProcessTree(child);
      done({
        outcome: null,
        failure: { kind: 'timeout', message: `timed out after ${timeoutMs}ms` },
      });
    }, timeoutMs);

    let out = '';
    let err = '';
    let outTrunc = false;
    child.stdout?.on('data', (d: Buffer) => {
      if (outTrunc) return;
      out += d.toString('utf8');
      if (Buffer.byteLength(out, 'utf8') > MAX_OUTPUT_BYTES) {
        out = out.slice(0, MAX_OUTPUT_BYTES);
        outTrunc = true;
      }
    });
    child.stderr?.on('data', (d: Buffer) => {
      if (err.length < MAX_OUTPUT_BYTES) err += d.toString('utf8');
    });

    child.on('error', (e) => {
      logger?.warn?.(`hook command error: ${e instanceof Error ? e.message : String(e)}`);
      done({
        outcome: null,
        failure: { kind: 'error', message: e instanceof Error ? e.message : String(e) },
      });
    });

    child.on('close', (code) => {
      if (code === 2) {
        const reason = (err.trim() || out.trim() || 'blocked by hook').slice(0, 2_000);
        return done({ outcome: { action: 'deny', reason } });
      }
      if (code !== 0) {
        return done({
          outcome: null,
          failure: {
            kind: 'exit',
            message: (err.trim() || `hook exited with code ${String(code)}`).slice(0, 2_000),
          },
        });
      }
      if (!out.trim()) return done({ outcome: null });
      const parsed = parseHookOutcome(out);
      if (!parsed) {
        return done({
          outcome: null,
          failure: { kind: 'invalid_output', message: 'hook stdout was not valid outcome JSON' },
        });
      }
      done({ outcome: parsed });
    });

    // Feed the payload and close stdin so the command isn't left waiting.
    // The write can still fail ASYNCHRONOUSLY: a hook command that exits
    // without reading stdin leaves the pending write against a closed pipe
    // (EPIPE/EOF), and without an 'error' listener on the stream that
    // failure is an uncaught exception that kills the whole agent process —
    // the child 'error'/'close' handlers cover process errors only.
    child.stdin?.on('error', () => {
      /* handled: the child's close/error handlers settle the invocation */
    });
    try {
      child.stdin?.end(`${JSON.stringify(input)}\n`);
    } catch {
      /* the close/error handlers will resolve */
    }
  });
}

export function parseHookOutcome(stdout: string): AnyHookOutcome | null {
  const trimmed = stdout.trim();
  if (trimmed?.[0] !== '{') return null;
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    const outcome: HookOutcome = {};
    const common: {
      additionalContext?: string | undefined;
      contextAs?: 'inline' | 'separate' | undefined;
    } = {
      ...(typeof obj['additionalContext'] === 'string'
        ? { additionalContext: obj['additionalContext'] }
        : {}),
      ...(obj['contextAs'] === 'inline' || obj['contextAs'] === 'separate'
        ? { contextAs: obj['contextAs'] as 'inline' | 'separate' }
        : {}),
    };
    if (obj['action'] === 'allow' || obj['action'] === 'deny' || obj['action'] === 'mutate') {
      if (obj['action'] === 'deny') {
        if (typeof obj['reason'] !== 'string' || !obj['reason'].trim()) return null;
        return { action: 'deny', reason: obj['reason'], ...common };
      }
      if (obj['action'] === 'mutate') {
        if (!obj['input'] || typeof obj['input'] !== 'object' || Array.isArray(obj['input']))
          return null;
        return {
          action: 'mutate',
          input: obj['input'] as Record<string, unknown>,
          ...(typeof obj['reason'] === 'string' ? { reason: obj['reason'] } : {}),
          ...common,
        };
      }
      return { action: 'allow', ...common };
    }
    if (obj['decision'] === 'block' || obj['decision'] === 'allow') {
      outcome.decision = obj['decision'];
    }
    if (typeof obj['reason'] === 'string') outcome.reason = obj['reason'];
    if (typeof obj['additionalContext'] === 'string') {
      outcome.additionalContext = obj['additionalContext'];
    }
    if (obj['modifiedInput'] && typeof obj['modifiedInput'] === 'object') {
      outcome.modifiedInput = obj['modifiedInput'] as Record<string, unknown>;
    }
    if (obj['contextAs'] === 'inline' || obj['contextAs'] === 'separate') {
      outcome.contextAs = obj['contextAs'];
    }
    return outcome;
  } catch {
    return null;
  }
}
