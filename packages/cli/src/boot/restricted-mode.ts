/**
 * `--restricted`: a run for code you do not trust yet — reviewing a stranger's
 * repository, triaging an issue in a fork.
 *
 * The agent keeps reading, searching and editing inside the project. It loses:
 *   - every tool that runs code, reaches the network, installs packages,
 *     mutates config or writes outside the project (by declared capability,
 *     so a newly added tool is covered without a name list to maintain);
 *   - MCP tools, and configured MCP servers are not started at all;
 *   - plugin tools that declare no capabilities (unknown = closed);
 *   - leaving the project root, including via `/settings`;
 *   - YOLO, including via `/yolo`, WebUI or HQ — every write still asks.
 *
 * The switches are process-wide and one-way (core `process-lockdown.ts`), and
 * `WRONGSTACK_RESTRICTED=1` carries them into child processes.
 */
import { lockToProjectRoot, lockYoloOff, ToolCapabilities } from '@wrongstack/core/security';
import type { ToolRestriction } from './tool-restriction-flags.js';

export const RESTRICTED_ENV = 'WRONGSTACK_RESTRICTED';

export const RESTRICTED_DENY_CAPABILITIES: readonly string[] = [
  ToolCapabilities.SHELL_ARBITRARY,
  ToolCapabilities.SHELL_RESTRICTED,
  ToolCapabilities.SHELL_EXEC,
  ToolCapabilities.NET_OUTBOUND,
  ToolCapabilities.PACKAGE_INSTALL,
  ToolCapabilities.CONFIG_MUTATE,
  ToolCapabilities.FS_WRITE_OUTSIDE_PROJECT,
  ToolCapabilities.TOOL_MUTATE_ANY,
  ToolCapabilities.MCP_PROXY,
];

/** Flags that would widen what `--restricted` narrows; combining them is a usage error. */
const CONFLICTING_FLAGS = [
  'yolo',
  'yolo-destructive',
  'full-auto',
  'mcp-config',
  // Pre-approving a tool would let writes skip the prompt this mode promises.
  'allowed-tools',
] as const;

export function isRestrictedMode(flags: Readonly<Record<string, unknown>>): boolean {
  return flags['restricted'] === true || process.env[RESTRICTED_ENV] === '1';
}

/** Throws on a conflicting flag. Returns whether restricted mode is on. */
export function validateRestrictedMode(flags: Readonly<Record<string, unknown>>): boolean {
  if (!isRestrictedMode(flags)) return false;
  const conflict = CONFLICTING_FLAGS.find(
    (name) => flags[name] !== undefined && flags[name] !== false,
  );
  if (conflict) throw new Error(`--${conflict} cannot be combined with --restricted`);
  return true;
}

/** Fold `--restricted` into the launch tool restriction (if any). */
export function withRestrictedTools(
  restriction: ToolRestriction | undefined,
  restricted: boolean,
): ToolRestriction | undefined {
  if (!restricted) return restriction;
  return {
    ...(restriction?.only ? { only: restriction.only } : {}),
    deny: [...(restriction?.deny ?? []), 'mcp__*'],
    denyCapabilities: RESTRICTED_DENY_CAPABILITIES,
    requireDeclaredCapabilities: true,
  };
}

export const RESTRICTED_NOTICE =
  'Restricted mode: no shell, network, installs or MCP tools; files stay inside the project; YOLO is off.';

let announced = false;

/**
 * Validate, engage the process-wide locks, export the env switch and — once
 * per process — tell the user. Throws on a conflicting flag.
 */
export function activateRestrictedMode(
  flags: Readonly<Record<string, unknown>>,
  write: (line: string) => void,
): boolean {
  if (!validateRestrictedMode(flags)) return false;
  lockToProjectRoot();
  lockYoloOff();
  process.env[RESTRICTED_ENV] = '1';
  if (!announced) {
    announced = true;
    write(`${RESTRICTED_NOTICE}\n`);
  }
  return true;
}
