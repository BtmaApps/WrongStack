import { spawnSync } from 'node:child_process';
import { buildChildEnv } from '../../utils/child-env.js';
import { getResolvedSandboxConfig } from '../manager.js';
import type {
  SandboxBackend,
  SandboxConfig,
  SandboxDecision,
  SandboxDenyDecision,
  SandboxExecCall,
  SandboxRoute,
  SandboxRouteRequest,
} from '../types.js';

/**
 * T4 container backend (plan 28): enforces the exec-family gate and provides
 * the spawn-routing rewrite — bash (shell form) and exec (argv form) inputs
 * are rewritten into `docker run` invocations with same-absolute-path mounts
 * and deny-by-default networking. The backend itself never executes anything;
 * `wrap.ts` applies the returned route to the tool input.
 *
 * Documented T4.1 limitations (see SDD "Spawn-routing design"): `git` and
 * `pwsh` are not routed and remain host-executed under the standard approval
 * path; MCP exec wrappers are a separate seam.
 */

const RUNNER = 'docker';

let runnerProbe: boolean | undefined;

/** Test seam: forget the cached runner probe. */
export function resetContainerRunnerCache(): void {
  runnerProbe = undefined;
}

function runnerAvailable(): boolean {
  if (runnerProbe !== undefined) return runnerProbe;
  try {
    const probe = spawnSync(RUNNER, ['version', '--format', '{{.Client.Version}}'], {
      encoding: 'utf8',
      timeout: 15_000,
      env: buildChildEnv(),
    });
    runnerProbe = probe.status === 0;
  } catch {
    runnerProbe = false;
  }
  return runnerProbe;
}

function deny(reason: string, missing: SandboxDenyDecision['missing']): SandboxDenyDecision {
  return { outcome: 'deny', reason, missing };
}

/** POSIX single-quote escape — safe under pwsh too ('…' is literal there; '' is the embedded-quote form). */
function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * Pure argv/command builder — always runnable in unit tests (no Docker
 * required). Returns `undefined` when the tier/shape must not route:
 * `full-access` (no containment intended) or an unroutable request shape.
 * A missing image is NOT handled here — `enforceExec` denies fail-closed
 * with an actionable reason instead.
 */
export function buildContainerRoute(
  request: SandboxRouteRequest,
  config: SandboxConfig,
): SandboxRoute | undefined {
  if (config.tier === 'full-access') return undefined;
  const image = config.image?.trim();
  if (!image) return undefined;
  const cwd = request.cwd?.trim() || process.cwd();
  const readOnly = config.tier === 'read-only';

  // Same-absolute-path mounts: `-v <host>:<same>` so paths inside the container
  // keep their host spelling. Deny-by-default network: `--network none`.
  const argv = [RUNNER, 'run', '--rm', '--network', 'none'];
  const mounts = [...new Set([cwd, ...(readOnly ? [] : config.writableRoots)])];
  // shell-form: each path-bearing token is single-quoted so paths with
  // spaces survive the join (the argv array is flattened into one line).
  for (const mount of mounts) {
    argv.push('-v', shellSingleQuote(`${mount}:${mount}${readOnly ? ':ro' : ''}`));
  }
  argv.push('-w', shellSingleQuote(cwd), image);

  if (request.kind === 'argv' && request.argv !== undefined) {
    return { argv: [...argv, ...request.argv] };
  }
  if (request.kind === 'shell' && request.command !== undefined) {
    // bash is a shell-form tool: the routed line goes through the user's
    // default shell, so the inner command is single-quote escaped.
    argv.push('sh', '-lc', shellSingleQuote(request.command));
    return { command: argv.join(' ') };
  }
  return undefined;
}

/**
 * T6-compatible backend: `enforceExec` fail-closes on configuration/runtime
 * gaps (missing image, no runner) so a misconfigured container tier denies
 * instead of silently degrading to host execution. `routeExec` supplies the
 * `docker run` rewrite consumed by the choke point.
 */
export const containerSandboxBackend: SandboxBackend = {
  id: 'container',

  async enforceExec(call: SandboxExecCall): Promise<SandboxDecision> {
    // Per-agent config wins (T7 tightening overrides); global policy fallback
    // for direct backend callers (chimera HIGH fix, 2026-10-04).
    const config = call.config ?? getResolvedSandboxConfig();
    if (config.tier === 'full-access') return { outcome: 'allow' };
    if (!config.image?.trim()) {
      return deny(
        'container tier requires tools.sandbox.image (set it in the user/global config)',
        [{ type: 'path', value: 'tools.sandbox.image' }],
      );
    }
    if (!runnerAvailable()) {
      return deny('container runner "docker" is not available on this host', [
        { type: 'path', value: RUNNER },
      ]);
    }
    return { outcome: 'allow' };
  },

  routeExec(request: SandboxRouteRequest, config: SandboxConfig): SandboxRoute | undefined {
    return buildContainerRoute(request, config);
  },
};
