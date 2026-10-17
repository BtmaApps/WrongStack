import * as path from 'node:path';
import { resolveConfiguredExecutable, resolveProjectPath } from './verification-executables.js';

// An explicitly authorized verification capability, not a general Bun allowance.
const DESKTOP_VITEST_ARGV = [
  'bun',
  '--cwd',
  'apps/desktop',
  '--bun',
  'run',
  'vitest',
  'run',
  '--config',
  'vitest.config.ts',
  '--maxWorkers=1',
] as const;

export function isDesktopVitestCommand(tokens: readonly string[]): boolean {
  return (
    tokens.length === DESKTOP_VITEST_ARGV.length &&
    tokens.every((token, index) => token === DESKTOP_VITEST_ARGV[index])
  );
}

/** Resolve only the current Bun host and an in-project JS runner; never a shim or PATH. */
export async function resolveDesktopVitestCommand(
  projectRoot: string,
): Promise<{ command: string; args: string[]; cwd: string } | string> {
  if (!process.versions['bun'])
    return 'Desktop verification requires a verifier running under Bun.';
  const cwd = await resolveProjectPath(projectRoot, 'apps/desktop');
  const config = await resolveProjectPath(projectRoot, 'apps/desktop/vitest.config.ts');
  if (!cwd || !config) return 'Desktop verification paths must stay inside the project root.';
  const runner = await resolveConfiguredExecutable(projectRoot, 'vitest', true);
  const entry = runner?.args[0];
  if (
    !runner ||
    runner.shell ||
    runner.command !== process.execPath ||
    runner.args.length !== 1 ||
    !entry ||
    !/\.[cm]?js$/i.test(entry) ||
    !(await resolveProjectPath(projectRoot, path.relative(projectRoot, entry)))
  ) {
    return 'Desktop verification requires an in-project local Vitest JS entry.';
  }
  return {
    command: process.execPath,
    args: [entry, 'run', '--config', 'vitest.config.ts', '--maxWorkers=1'],
    cwd,
  };
}
