import { type ChildProcess, spawn } from 'node:child_process';
import { buildChildEnv } from '@wrongstack/core/utils';

/** Resolve an HTTP Bearer token without ever persisting the secret itself. */
export function resolveHttpBearerHeaders(
  options: {
    headers?: Record<string, string> | undefined;
    bearerTokenEnv?: string | undefined;
    name: string;
  },
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> | undefined {
  const envName = options.bearerTokenEnv?.trim();
  if (!envName) return options.headers;
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(envName)) {
    throw new Error(`MCP bearerTokenEnv "${envName}" is not a valid environment variable name`);
  }
  const token = env[envName];
  if (!token) throw new Error(`MCP "${options.name}" requires environment variable ${envName}`);
  if (token.length > 16_384 || /[\r\n]/.test(token)) {
    throw new Error(`MCP "${options.name}" bearer token is oversized or contains newlines`);
  }
  const resolved = { ...options.headers };
  for (const key of Object.keys(resolved)) {
    if (key.toLowerCase() === 'authorization') delete resolved[key];
  }
  resolved.Authorization = `Bearer ${token}`;
  return resolved;
}

/**
 * Force-kill a child and its descendants. On Windows a stdio server is launched
 * through a `.cmd` shim with `shell: true`, so `child` is the `cmd.exe` wrapper
 * and the real server (npx→node / uvx) is its grandchild — `child.kill('SIGKILL')`
 * signals only the wrapper and orphans the server, which then accumulates across
 * every close / restart / idle-sleep. `taskkill /T /F` tears down the whole tree.
 */
export function forceKillTree(child: ChildProcess): void {
  if (child.pid === undefined) {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
    return;
  }
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      // H-8 convention (spawn-convention test): taskkill needs PATH only —
      // do not hand it the credential-bearing parent environment.
      env: buildChildEnv(),
      windowsHide: true,
    });
    killer.once('error', () => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    });
    killer.unref();
    return;
  }
  try {
    child.kill('SIGKILL');
  } catch {
    /* already gone */
  }
}
