import { execFile } from 'node:child_process';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { buildChildEnv } from '../utils/child-env.js';
import { toErrorMessage } from '../utils/error.js';
import { buildWin32CmdShimInvocation } from '../utils/win32-cmd.js';

export interface GoalProjectVerifierOptions {
  cwd: string;
  projectRoot?: string | undefined;
  steps?: readonly string[] | undefined;
  timeoutMs?: number | undefined;
}

export interface GoalProjectVerificationResult {
  ok: boolean;
  output?: string | undefined;
  skipped?: boolean | undefined;
}

const PACKAGE_MANAGERS = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
  ['package-lock.json', 'npm'],
] as const;

async function exists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function detectPackageManager(root: string): Promise<string> {
  for (const [lockfile, manager] of PACKAGE_MANAGERS) {
    if (await exists(path.join(root, lockfile))) return manager;
  }
  return 'npm';
}

async function readScripts(cwd: string): Promise<Record<string, string>> {
  try {
    const parsed = JSON.parse(await fsp.readFile(path.join(cwd, 'package.json'), 'utf8')) as {
      scripts?: unknown;
    };
    if (!parsed.scripts || typeof parsed.scripts !== 'object' || Array.isArray(parsed.scripts)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed.scripts).filter((entry): entry is [string, string] => {
        return typeof entry[1] === 'string';
      }),
    );
  } catch {
    return {};
  }
}

async function runStep(
  manager: string,
  step: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ ok: boolean; output: string }> {
  const args = ['run', step];
  const invocation =
    process.platform === 'win32'
      ? buildWin32CmdShimInvocation(manager, args)
      : { command: manager, args, windowsVerbatimArguments: false };
  return new Promise((resolve) => {
    execFile(
      invocation.command,
      invocation.args,
      {
        cwd,
        timeout: timeoutMs,
        windowsHide: true,
        windowsVerbatimArguments: invocation.windowsVerbatimArguments,
        env: buildChildEnv(),
        maxBuffer: 8 * 1024 * 1024,
      },
      (err, stdout, stderr) => {
        const output = `${stdout}${stderr}`.trim();
        if (!err) {
          resolve({ ok: true, output });
          return;
        }
        resolve({
          ok: false,
          output: output || `${manager} run ${step} could not complete: ${toErrorMessage(err)}`,
        });
      },
    );
  });
}

/** Run the same narrow package-script verification contract for every Goal host. */
export async function verifyGoalProject(
  options: GoalProjectVerifierOptions,
): Promise<GoalProjectVerificationResult> {
  const root = options.projectRoot ?? options.cwd;
  if (
    !(await exists(path.join(options.cwd, 'node_modules'))) &&
    !(await exists(path.join(root, 'node_modules')))
  ) {
    return { ok: true, skipped: true, output: 'verify skipped: node_modules not found' };
  }

  const scripts = await readScripts(options.cwd);
  const steps = (options.steps ?? ['typecheck', 'lint']).filter((step) => scripts[step]);
  if (steps.length === 0) {
    return { ok: true, skipped: true, output: 'verify skipped: no configured scripts' };
  }

  const manager = await detectPackageManager(root);
  for (const step of steps) {
    const result = await runStep(manager, step, options.cwd, options.timeoutMs ?? 120_000);
    if (!result.ok) return { ok: false, output: `[${step}] ${result.output}` };
  }
  return { ok: true };
}
