import { existsSync } from 'node:fs';
import { basename, delimiter, join } from 'node:path';

/**
 * Absolute path of a real Bun binary for spawning Bun subcommands
 * (`run`, `install`, `pm pack`, `--version`).
 *
 * `process.execPath` is not enough: under `bun --bun` on Windows it is Bun's
 * `%TEMP%\bun-node-<hash>\node.exe` shim, which behaves as Node — it reads
 * `run`/`install`/`pm` as a script path ("Module not found …\run") and rejects
 * `--version` ("Missing script to execute"). Under plain Node it is `node`,
 * which has no such subcommands at all.
 *
 * Resolution: Bun's own `Bun.which('bun')` (the shim directory ships a real
 * `bun.exe` next to the `node.exe` shim), then `npm_execpath` when it names a
 * Bun binary, then the first `bun` on PATH, then `process.execPath`.
 */
export function resolveBunExecutable(env = process.env) {
  const bun = /** @type {{ which?: (name: string) => string | null } | undefined} */ (
    globalThis.Bun
  );
  const viaBun = bun?.which?.('bun');
  if (viaBun) return viaBun;

  const npmExecPath = env.npm_execpath;
  if (npmExecPath && /^bunx?(\.exe)?$/i.test(basename(npmExecPath)) && existsSync(npmExecPath)) {
    return npmExecPath;
  }

  const names = process.platform === 'win32' ? ['bun.exe', 'bun.cmd', 'bun'] : ['bun'];
  for (const dir of (env.PATH ?? env.Path ?? '').split(delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }

  return process.execPath;
}
