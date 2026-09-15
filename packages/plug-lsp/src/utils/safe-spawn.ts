import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { buildChildEnv, buildWin32CmdShimInvocation } from '@wrongstack/core/utils';
import type { ServerConfig } from '../types.js';
import { resolveServerCommand } from './command-resolver.js';

/**
 * Spawn a language server.
 *
 * On Windows a `.cmd`/`.bat` shim cannot be spawned without a shell
 * (CVE-2024-27980), and the obvious workaround — `spawn(cmd, args, { shell: true })`
 * — is the BatBadBut hazard (DEP0190): Node joins `args` into the command line
 * *after* the quoting decision, so `&`, `|`, `<`, `>` and `%VAR%` inside an
 * argument start a second program. This module previously quoted only the
 * command and passed `args` through with `shell: true`, which left that hole
 * open (WS-SEC-11).
 *
 * `buildWin32CmdShimInvocation` is the repo's single source for the safe
 * construction — an explicit `cmd.exe /d /c call "<cmd>" "<arg>" …` with
 * `windowsVerbatimArguments` and an outright refusal of metacharacters. Every
 * other spawn site already used it; this one is now wired to it too.
 */
export function safeSpawn(cfg: ServerConfig, cwd: string): ChildProcessWithoutNullStreams {
  const env = buildChildEnv({ extra: cfg.env });
  const stdio = ['pipe', 'pipe', 'pipe'] as const;
  const invocation = resolveCommandInvocation(cfg.command, cfg.args, process.platform);
  return spawn(invocation.command, invocation.args, {
    cwd,
    env,
    stdio: [...stdio],
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    windowsHide: true,
  });
}

/**
 * The concrete executable to spawn for a configured server command.
 *
 * Node does not apply PATHEXT, so on Windows a bare `typescript-language-server`
 * ENOENTs even though its `.cmd` shim sits on PATH. Auto-discovery resolved its
 * own presets, but a server the user configured by hand kept the bare name and
 * could never start on Windows (audit 2026-09-15). Resolution goes through
 * `resolveServerCommand` with its default project-local gate (WS-SEC-01), so a
 * binary found only inside the opened repository is still not adopted.
 */
export async function resolveSpawnCommand(
  command: string,
  cwd: string,
  platform: NodeJS.Platform = process.platform,
  resolve: (command: string, cwd: string) => Promise<string | null> = resolveServerCommand,
): Promise<string> {
  if (platform !== 'win32') return command;
  if (/[\\/]/.test(command) || /\.(exe|cmd|bat|com)$/i.test(command)) return command;
  try {
    return (await resolve(command, cwd)) ?? command;
  } catch {
    return command;
  }
}

function resolveCommandInvocation(
  command: string,
  args: string[] | undefined,
  platform: NodeJS.Platform,
): { command: string; args: string[]; windowsVerbatimArguments: boolean } {
  if (shouldUseShell(command, platform))
    return buildWin32CmdShimInvocation(command, serverArgs(args));
  return { command, args: serverArgs(args), windowsVerbatimArguments: false };
}

function shouldUseShell(command: string, platform: NodeJS.Platform): boolean {
  return platform === 'win32' && /\.(cmd|bat)$/i.test(command);
}

function serverArgs(args: string[] | undefined): string[] {
  return args ?? [];
}

/** Direct-module test seam; not re-exported by the package barrel. */
export const safeSpawnCoverage = { resolveCommandInvocation, serverArgs, shouldUseShell };
