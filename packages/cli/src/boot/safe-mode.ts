/**
 * `--safe-mode`: start with the user's and the project's customizations off,
 * to tell a broken setup apart from a broken WrongStack.
 *
 * Off: third-party plugins, hooks (policy hooks stay, as with `--no-hooks` —
 * they are enforcement, not customization), configured MCP servers, skills,
 * and instruction override files (`instructions/` under the profile and the
 * project). Unchanged: config itself, auth, model selection, permissions,
 * built-in tools and built-in plugins. Servers named with `--mcp-config` still
 * start: the flag is an explicit request for them.
 *
 * Every decision is read at its consumption point instead of being patched
 * into config: a patched config can be saved back by any settings write, and
 * one troubleshooting launch would then silently disable plugins for good.
 *
 * `WRONGSTACK_SAFE_MODE=1` is equivalent and is exported to child processes
 * (WebUI session children, spawned tools) so they start the same way.
 */

export const SAFE_MODE_ENV = 'WRONGSTACK_SAFE_MODE';

export function isSafeMode(flags: Readonly<Record<string, unknown>>): boolean {
  return flags['safe-mode'] === true || process.env[SAFE_MODE_ENV] === '1';
}

/** Called once at boot: makes `--safe-mode` visible to child processes. */
export function propagateSafeMode(flags: Readonly<Record<string, unknown>>): boolean {
  const on = isSafeMode(flags);
  if (on) process.env[SAFE_MODE_ENV] = '1';
  return on;
}

export const SAFE_MODE_NOTICE =
  'Safe mode: third-party plugins, hooks, configured MCP servers, skills and instruction overrides are off.';

let announced = false;

/**
 * Propagate and, once per process, tell the user. Without the guard a real
 * `--safe-mode` launch printed the notice twice, which reads like a second
 * mode switch.
 */
export function announceSafeMode(
  flags: Readonly<Record<string, unknown>>,
  write: (line: string) => void,
): boolean {
  const on = propagateSafeMode(flags);
  if (on && !announced) {
    announced = true;
    write(`${SAFE_MODE_NOTICE}\n`);
  }
  return on;
}
