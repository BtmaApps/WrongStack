/**
 * Windows executable search hardening (WS-2026-09-15-NV1).
 *
 * On Windows a bare command name is resolved in the CURRENT DIRECTORY before
 * PATH — by libuv for `child_process.spawn`/`execFile` without a shell (it uses
 * the `cwd` option, or the process cwd when none is given), and by `cmd.exe`
 * for `call "<name>"`, which is how `.cmd` shims are launched
 * (`buildWin32CmdShimInvocation`). WrongStack spawns `git`, `rg`, `patch`,
 * `docker`, `npx`, `uvx`, `pnpm` … by bare name with the opened repository as
 * that directory, so a cloned repository that commits `git.exe` or `npx.cmd`
 * at its root supplied the binary that ran — on project open (codebase
 * indexing), on `grep`/`diff` (permission:'auto'), and on every stdio MCP
 * server start. Verified 2026-09-15 on Node 24.13 and Bun 1.4.2: a planted
 * `rg.exe` ran INSTEAD OF the real ripgrep that was on PATH.
 *
 * Both resolvers honour `NoDefaultCurrentDirectoryInExePath`: libuv reads it
 * from the SPAWNING process's environment, cmd.exe from its own. So the
 * control has two halves, and each is necessary:
 *
 *   1. every WrongStack process entry calls {@link hardenWin32ExecutableSearch}
 *      (libuv spawns made by that process), and
 *   2. `buildChildEnv` forces the variable into every child environment
 *      (cmd.exe shims, and grandchildren spawned by our own daemons).
 *
 * Consequence for users: inside those children a `.bat`/`.exe` that lives in
 * the current directory must be invoked as `.\name`. PowerShell already
 * requires that; bash never searched the cwd. That is the trade the variable
 * exists for, and there is deliberately no opt-out.
 */

export const NO_CWD_EXE_SEARCH_ENV = 'NoDefaultCurrentDirectoryInExePath';

/**
 * Set {@link NO_CWD_EXE_SEARCH_ENV} on `env` when running on Windows.
 *
 * Environment names are case-insensitive on Windows. `process.env` is a
 * case-insensitive proxy there, but a plain object (a child env under
 * construction) is not, so differently-cased copies are removed first — a
 * leftover `NODEFAULTCURRENTDIRECTORYINEXEPATH=` could otherwise be the copy
 * the child sees.
 *
 * @returns true when the variable was applied.
 */
export function hardenWin32ExecutableSearch(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform !== 'win32') return false;
  const wanted = NO_CWD_EXE_SEARCH_ENV.toLowerCase();
  if (env !== process.env) {
    for (const key of Object.keys(env)) {
      if (key.toLowerCase() === wanted && key !== NO_CWD_EXE_SEARCH_ENV) delete env[key];
    }
  }
  env[NO_CWD_EXE_SEARCH_ENV] = '1';
  return true;
}
