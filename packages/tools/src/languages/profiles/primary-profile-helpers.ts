import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { processPlan, unavailable } from '../profile-helpers.js';
import type { LanguageOperation, ProfileContext } from '../types.js';

export const COMMON_IGNORES = Object.freeze([
  '.git',
  '.wrongstack',
  'node_modules',
  'vendor',
  'target',
  'bin',
  'obj',
  'dist',
  'build',
  'coverage',
]);

export function nodeManager(ctx: ProfileContext): string | undefined {
  const lockfiles = new Set(
    ctx.workspace.evidence
      .filter((evidence) => evidence.kind === 'lockfile')
      .map((evidence) => evidence.value.toLowerCase()),
  );
  if (lockfiles.size > 1 && !ctx.workspace.packageManager) return undefined;
  return ctx.workspace.packageManager ?? 'npm';
}

export function scriptPlan(ctx: ProfileContext, operation: string, script: string) {
  const manager = nodeManager(ctx);
  if (!manager)
    return unavailable(
      ctx,
      operation as LanguageOperation,
      'Conflicting Node lockfiles make the package manager ambiguous.',
    );
  const args = manager === 'npm' ? ['run', script] : [script];
  return processPlan(ctx, operation as LanguageOperation, manager, args, {
    parser: 'command-text',
    reason: `Run the detected ${manager} ${script} script for this workspace.`,
    mutating: true,
    executesProjectCode: true,
  });
}

/** The named packages, or `fallback` when none were given. */
export function orAll(names: readonly string[], fallback: readonly string[]): readonly string[] {
  return names.length > 0 ? names : fallback;
}

/** True when the caller opted in to package lifecycle scripts (`allowScripts`). */
export function scriptsAllowed(ctx: ProfileContext): boolean {
  return ctx.options.allowScripts === true;
}

/** Plan wording for whether lifecycle scripts run. */
export function scriptsNote(ctx: ProfileContext): string {
  return scriptsAllowed(ctx)
    ? 'lifecycle scripts ENABLED (allowScripts)'
    : 'lifecycle scripts disabled';
}

/**
 * The "no lifecycle scripts" argument — none when the caller opted in with
 * `allowScripts: true`. Yarn 2+ has no `--ignore-scripts` ("Unsupported option
 * name"); its equivalent is `--mode=skip-build`. Berry is selected by
 * `packageManager: "yarn@2+"` or a `.yarnrc.yml` in the workspace.
 */
export async function noScriptsArgs(ctx: ProfileContext, manager: string): Promise<string[]> {
  if (scriptsAllowed(ctx)) return [];
  return [
    manager === 'yarn' && (await isYarnBerry(ctx)) ? '--mode=skip-build' : '--ignore-scripts',
  ];
}

/** Composer's spelling of the same opt-out. */
export function composerNoScripts(ctx: ProfileContext): string[] {
  return scriptsAllowed(ctx) ? [] : ['--no-scripts'];
}

export async function isYarnBerry(ctx: ProfileContext): Promise<boolean> {
  try {
    const manifest = JSON.parse(await readFile(join(ctx.workspace.root, 'package.json'), 'utf8'));
    const major = /^yarn@(\d+)/.exec(String(manifest?.packageManager ?? ''))?.[1];
    if (major) return Number(major) >= 2;
  } catch {
    // no/invalid package.json — fall back to the .yarnrc.yml signal
  }
  return access(join(ctx.workspace.root, '.yarnrc.yml')).then(
    () => true,
    () => false,
  );
}

export function nodeExec(ctx: ProfileContext, executable: string, args: readonly string[]) {
  const manager = ctx.workspace.packageManager ?? 'npm';
  if (manager === 'pnpm') return { command: 'pnpm', args: ['exec', executable, ...args] };
  if (manager === 'yarn') return { command: 'yarn', args: ['exec', executable, ...args] };
  // `bun x` installs a missing binary from the registry (`bun x tsc` would
  // fetch the unrelated npm package named `tsc`); `--no-install` keeps it to
  // the project's own bin, like `npx --no-install` below.
  if (manager === 'bun') {
    return { command: 'bun', args: ['x', '--no-install', executable, ...args] };
  }
  return { command: 'npx', args: ['--no-install', executable, ...args] };
}
