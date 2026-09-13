import { chmodSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { errMessage } from './ws-utils.js';

/**
 * node-pty 1.1.0 ships `prebuilds/darwin-*\/spawn-helper` without the exec bit
 * (microsoft/node-pty#919, #850). npm, pnpm and bun all extract it as 0644, and
 * every pty spawn then fails with `posix_spawnp failed`. A postinstall script
 * cannot fix this reliably — bun skips lifecycle scripts of untrusted deps and
 * `--ignore-scripts` skips them everywhere — so the bit is repaired at load
 * time, right after node-pty resolves. Harmless once upstream ships a fix.
 */

export type SpawnHelperRepair =
  | { status: 'not-applicable' }
  | { status: 'ok'; path: string }
  | { status: 'repaired'; path: string }
  | { status: 'unrepairable'; path: string; error: string };

interface SpawnHelperFs {
  statSync(p: string): { mode: number };
  chmodSync(p: string, mode: number): void;
}

interface RepairOptions {
  platform?: NodeJS.Platform;
  arch?: string;
  fs?: SpawnHelperFs;
}

const EXEC_BITS = 0o111;

/** Last helper that could not be made executable — surfaced on spawn failure. */
let lastUnrepairable: string | undefined;

/**
 * Directories node-pty's `loadNativeModule` searches, in its own order; the
 * helper it uses sits next to the first one that exists.
 */
function candidateDirs(packageDir: string, platform: string, arch: string): string[] {
  return [
    path.join(packageDir, 'build', 'Release'),
    path.join(packageDir, 'build', 'Debug'),
    path.join(packageDir, 'prebuilds', `${platform}-${arch}`),
  ];
}

export function ensureSpawnHelperExecutable(
  packageDir: string,
  opts: RepairOptions = {},
): SpawnHelperRepair {
  const platform = opts.platform ?? process.platform;
  if (platform === 'win32') return { status: 'not-applicable' };
  const fs = opts.fs ?? { statSync, chmodSync };
  for (const dir of candidateDirs(packageDir, platform, opts.arch ?? process.arch)) {
    const helper = path.join(dir, 'spawn-helper');
    let mode: number;
    try {
      mode = fs.statSync(helper).mode;
    } catch {
      continue;
    }
    if ((mode & EXEC_BITS) === EXEC_BITS) return { status: 'ok', path: helper };
    try {
      fs.chmodSync(helper, (mode & 0o777) | EXEC_BITS);
      if (lastUnrepairable === helper) lastUnrepairable = undefined;
      return { status: 'repaired', path: helper };
    } catch (err) {
      lastUnrepairable = helper;
      return {
        status: 'unrepairable',
        path: helper,
        error: errMessage(err),
      };
    }
  }
  return { status: 'not-applicable' };
}

/**
 * Resolve node-pty's package directory through the same `require` that loaded
 * it (so hoisted/pnpm/bun layouts agree) and repair its spawn-helper.
 */
export function repairNodePtySpawnHelper(
  req: NodeJS.Require,
  log?: { info?: (m: string) => void; warn?: (m: string) => void },
  opts: RepairOptions = {},
): SpawnHelperRepair {
  if ((opts.platform ?? process.platform) === 'win32') return { status: 'not-applicable' };
  let packageDir: string;
  try {
    packageDir = path.dirname(req.resolve('node-pty/package.json'));
  } catch {
    return { status: 'not-applicable' };
  }
  const result = ensureSpawnHelperExecutable(packageDir, opts);
  if (result.status === 'repaired') {
    log?.info?.(`[terminal] restored exec permission on node-pty spawn-helper (${result.path})`);
  } else if (result.status === 'unrepairable') {
    log?.warn?.(
      `[terminal] node-pty spawn-helper is not executable and could not be fixed ` +
        `(${result.error}). Run: ${spawnHelperChmodCommand(result.path)}`,
    );
  }
  return result;
}

export function spawnHelperChmodCommand(helperPath: string): string {
  return `chmod +x '${helperPath.replace(/'/g, `'\\''`)}'`;
}

/** Hint appended to a pty spawn failure caused by a non-executable helper. */
export function spawnHelperFailureHint(errorMessage: string): string | undefined {
  if (!/posix_spawnp?\s+failed/i.test(errorMessage)) return undefined;
  return lastUnrepairable
    ? `node-pty's spawn-helper is not executable. Run: ${spawnHelperChmodCommand(lastUnrepairable)}`
    : "node-pty's spawn-helper may not be executable. Run chmod +x on node-pty/prebuilds/<platform>-<arch>/spawn-helper.";
}
