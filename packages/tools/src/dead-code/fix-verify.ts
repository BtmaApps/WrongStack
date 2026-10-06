/**
 * Fix verification: side-effect-free typecheck commands per affected package,
 * an optional custom check, and attribution of a failure to the findings it
 * points at (for the quarantine retry).
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { buildChildEnv, toErrorMessage } from '@wrongstack/core/utils';
import { treeKill } from '@wrongstack/core/utils/tree-kill';
import {
  buildWin32CmdShimInvocation,
  isWinCmdShim,
  resolveWin32Command,
} from '../_win32-resolve.js';
import { discoverPackages, owningPackage, type PackageInfo } from './files.js';
import type { DeadCodeApplyOptions, DeadCodeVerifyStep, InternalPlan } from './fix-types.js';

/** Runs argv without a shell; `.cmd`/`.bat` shims go through the hardened cmd builder. */
function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      const resolved = resolveWin32Command(command);
      if (isWinCmdShim(resolved)) {
        const inv = buildWin32CmdShimInvocation(resolved, [...args]);
        child = spawn(inv.command, inv.args, {
          cwd,
          windowsHide: true,
          windowsVerbatimArguments: inv.windowsVerbatimArguments,
          env: buildChildEnv(),
        });
      } else {
        child = spawn(resolved, [...args], { cwd, windowsHide: true, env: buildChildEnv() });
      }
    } catch (err) {
      resolve({ ok: false, output: toErrorMessage(err) });
      return;
    }
    let output = '';
    const onData = (d: Buffer): void => {
      output += d.toString('utf8');
      if (output.length > 64_000) output = output.slice(-32_000);
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    const timer = setTimeout(() => {
      output += `\n[timed out after ${Math.round(timeoutMs / 1000)}s]`;
      // A `.cmd` shim's real process is a grandchild: kill the whole tree.
      treeKill(child, { force: true });
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, output: `${output}\n${err.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output: output.slice(-8_000) });
    });
  });
}

interface TypecheckCommand {
  command: string;
  args: string[];
  cwd: string;
  label: string;
}

/** The package's own `tsc` binary (node_modules/.bin), else the workspace root's. */
function findTscBin(projectRoot: string, dir: string): string | null {
  const names = process.platform === 'win32' ? ['tsc.cmd', 'tsc.exe', 'tsc'] : ['tsc'];
  for (const base of [dir, projectRoot]) {
    for (const n of names) {
      const candidate = path.join(base, 'node_modules', '.bin', n);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  try {
    return createRequire(path.join(dir, 'package.json')).resolve('typescript/bin/tsc');
  } catch {
    return null;
  }
}

const BUILD_ONLY_FLAGS = new Set([
  '--build',
  '-b',
  '--verbose',
  '-v',
  '--dry',
  '-d',
  '--force',
  '-f',
  '--clean',
  '--stopBuildOnErrors',
]);

/**
 * `tsc -b [project…]` as plain `tsc` argv lists: positional arguments name
 * projects in build mode but source files otherwise (TS5112), and build-only
 * flags are errors outside it.
 */
function withoutBuildMode(args: string[]): string[][] {
  if (!args.includes('--build') && !args.includes('-b')) return [args];
  const flags = args.filter((a) => a.startsWith('-') && !BUILD_ONLY_FLAGS.has(a));
  const projects = args.filter((a) => !a.startsWith('-'));
  return projects.length === 0 ? [flags] : projects.map((p) => ['-p', p, ...flags]);
}

/**
 * Side-effect-free typecheck commands for one package.
 *
 * A `typecheck` script may build other packages first (`pnpm --filter x build
 * && tsc --noEmit`): running it would rewrite `dist/` from the edited sources,
 * and a rollback restores sources, not build output. So only the script's
 * `tsc` steps run — forced to `--noEmit` — and a package without such a script
 * gets `tsc --noEmit -p tsconfig.json`.
 */
function typecheckCommands(projectRoot: string, pkg: PackageInfo | undefined): TypecheckCommand[] {
  const dir = path.join(projectRoot, pkg?.dir ?? '');
  const tsc = findTscBin(projectRoot, dir);
  if (!tsc) return [];
  const asCommand = (args: string[]): TypecheckCommand => {
    const full = args.includes('--noEmit') ? args : ['--noEmit', ...args];
    const isScript = /\.(?:[cm]?js)$/i.test(tsc);
    return {
      command: isScript ? process.execPath : tsc,
      args: isScript ? [tsc, ...full] : full,
      cwd: dir,
      label: `tsc ${full.join(' ')}`,
    };
  };
  const script = (pkg?.manifest.scripts as Record<string, unknown> | undefined)?.typecheck;
  if (typeof script === 'string') {
    const steps = script
      .split(/&&|\|\||;/)
      .map((seg) => seg.trim().split(/\s+/))
      .filter((argv) => argv[0] === 'tsc' || argv[0] === 'tsgo')
      .flatMap((argv) => withoutBuildMode(argv.slice(1)));
    if (steps.length > 0) return steps.map(asCommand);
  }
  if (!fs.existsSync(path.join(dir, 'tsconfig.json'))) return [];
  return [asCommand(['-p', 'tsconfig.json'])];
}

/** `src/a.ts(12,3): error TS…` (tsc) and `src/a.ts:12:3 - error …` (pretty / tsgo). */
const ERROR_LOCATION = /^(.+?)(?:\((\d+),\d+\)|:(\d+):\d+)\s*[:-]\s*error\b/gm;

type VerifyStepWithCwd = DeadCodeVerifyStep & { cwd: string };

export async function verifyChanges(
  projectRoot: string,
  plan: InternalPlan,
  opts: DeadCodeApplyOptions,
  progress: (m: string) => void,
): Promise<{ ok: boolean; steps: VerifyStepWithCwd[] }> {
  const steps: VerifyStepWithCwd[] = [];
  const timeoutMs = opts.verifyTimeoutMs ?? 10 * 60_000;
  if ((opts.verify ?? 'typecheck') === 'typecheck') {
    const manifests = new Set<string>();
    for (const c of plan.internal) {
      const parts = c.file.split('/');
      for (let i = parts.length - 1; i >= 0; i--) {
        const candidate = [...parts.slice(0, i), 'package.json'].join('/');
        if (fs.existsSync(path.join(projectRoot, candidate))) manifests.add(candidate);
      }
    }
    const packages = discoverPackages(projectRoot, [...manifests]);
    const affected = new Map<string, PackageInfo | undefined>();
    for (const c of plan.internal) {
      const pkg = owningPackage(packages, c.file);
      affected.set(pkg?.dir ?? '', pkg);
    }
    for (const pkg of affected.values()) {
      for (const cmd of typecheckCommands(projectRoot, pkg)) {
        progress(`Typechecking ${pkg?.name ?? 'project'} (${cmd.label})…`);
        const started = Date.now();
        const res = await runCommand(cmd.command, cmd.args, cmd.cwd, timeoutMs);
        steps.push({
          package: pkg?.name ?? '(root)',
          command: cmd.label,
          ok: res.ok,
          output: res.output,
          durationMs: Date.now() - started,
          cwd: cmd.cwd,
        });
        // Keep going: one round should surface every failing package, so the
        // quarantine can drop all culprits at once instead of one per retry.
      }
    }
    if (steps.some((st) => !st.ok)) return { ok: false, steps };
  }
  if (opts.verifyCommand && opts.verifyCommand.length > 0) {
    const [command, ...args] = opts.verifyCommand;
    const label = opts.verifyCommand.join(' ');
    progress(`Running ${label}…`);
    const started = Date.now();
    const res = await runCommand(command!, args, projectRoot, timeoutMs);
    steps.push({
      package: '(custom)',
      command: label,
      ok: res.ok,
      output: res.output,
      durationMs: Date.now() - started,
      cwd: projectRoot,
    });
    if (!res.ok) return { ok: false, steps };
  }
  return { ok: true, steps };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Which selected findings a failed verification points at: a finding whose
 * symbol the errors name, or — when no name matches — whose changed file an
 * error is located in. Linked re-export removals blame the finding that pulled
 * them in.
 */
export function attributeFailure(
  projectRoot: string,
  plan: InternalPlan,
  steps: readonly VerifyStepWithCwd[],
  selected: ReadonlySet<string>,
): Map<string, string> {
  const failed = steps.filter((s) => !s.ok);
  const text = failed.map((s) => s.output).join('\n');
  const errorFiles = new Set<string>();
  for (const step of failed) {
    ERROR_LOCATION.lastIndex = 0;
    for (;;) {
      const m = ERROR_LOCATION.exec(step.output);
      if (m === null) break;
      const abs = path.resolve(step.cwd, m[1]!.trim());
      errorFiles.add(path.relative(projectRoot, abs).split(path.sep).join('/'));
    }
  }
  const byId = new Map(plan.analysis.findings.map((f) => [f.id, f]));
  const blame = new Map<string, string>();
  const blameSelected = (id: string, reason: string): void => {
    const target = selected.has(id) ? id : plan.linkedBy.get(id);
    if (target && selected.has(target) && !blame.has(target)) blame.set(target, reason);
  };
  for (const id of plan.planned) {
    const f = byId.get(id);
    if (!f?.name) continue;
    // TypeScript quotes identifiers in diagnostics (`Property 'x'`, `name 'Y'`);
    // a bare-word match blamed `main` for every error in a file named main.ts.
    const re = new RegExp(`['"\u0060]${escapeRegExp(f.name)}['"\u0060]`);
    if (re.test(text)) blameSelected(id, `verification errors name '${f.name}'`);
  }
  if (blame.size === 0) {
    for (const c of plan.internal) {
      if (!errorFiles.has(c.file)) continue;
      for (const id of c.findingIds) blameSelected(id, `verification failed in ${c.file}`);
    }
  }
  return blame;
}
