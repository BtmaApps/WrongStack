import { spawn, spawnSync } from 'node:child_process';
import { buildChildEnv } from '../utils/child-env.js';
import { getResolvedSandboxConfig } from './manager.js';
import type { SandboxRoute } from './types.js';

/**
 * T5.1 — restricted-token spawn helper (plan 28 prototype, `runas` variant).
 *
 * The helper transforms a routed exec command into a `runas
 * /trustlevel:0x20000` invocation: Windows derives a Basic-User restricted
 * token (strips elevation and installer groups) for the SAME user and runs
 * the payload under it. Combined with Low-IL marks on the writable roots
 * (applied here via icacls before the transform), this is the shipped
 * Windows containment mechanism.
 *
 * Why not CreateProcessAsUser P/Invoke: the direct Safer P/Invoke chain
 * (SaferCreateLevel → SaferComputeTokenFromLevel) fails with
 * ERROR_INVALID_PARAMETER (87) on current Windows builds on this host
 * (micro-probe evidence, all scope/level combinations), while `runas
 * /trustlevel` — which uses the same Safer infrastructure internally —
 * works (probe: exit 0, file landed). A native N-API addon using
 * CreateProcessAsUser with explicit restricted SIDs remains the hardening
 * path; see SDD "Windows-native helper design (T5.1)".
 *
 * Honest prototype limits: `runas` spawns the payload DETACHED — no exit
 * code or stdio propagation (the runner route resolves immediately); the
 * deny barrier for same-user paths comes from explicit deny ACEs the host
 * or the test applies (see the gated integration suite).
 */

export type SandboxHelperRunner = (route: SandboxRoute) => Promise<SandboxRoute | void>;

function markLowIntegrity(dirs: string[]): void {
  for (const dir of dirs) {
    try {
      spawnSync('icacls', [dir, '/setintegritylevel', 'L'], {
        encoding: 'utf8',
        timeout: 30_000,
        env: buildChildEnv(),
      });
    } catch {
      // Best-effort: a failed mark is caught by the containment proof, not here.
    }
  }
}

/** The restricted trust level — SAFER_LEVELID_NORMALUSER's runas equivalent. */
const TRUSTLEVEL = '0x20000';

export function defaultWindowsHelperRunner(): SandboxHelperRunner {
  return async (route) => {
    const payload = route.command ?? route.argv?.join(' ');
    if (!payload) return;
    const config = getResolvedSandboxConfig();
    markLowIntegrity(config.writableRoots.filter(Boolean));
    return {
      argv: ['runas', `/trustlevel:${TRUSTLEVEL}`, payload],
    };
  };
}

/**
 * Test/integration seam: spawn the helper route directly and resolve with
 * the LAUNCHER's exit code (the runas variant returns immediately — payload
 * results are observed via the filesystem, not this code).
 */
export function runHelperRoute(
  route: SandboxRoute,
  timeoutMs = 30_000,
): Promise<{ code: number | null }> {
  const argv = route.argv ?? [];
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0] ?? 'runas', argv.slice(1), {
      stdio: 'ignore',
      timeout: timeoutMs,
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (code: number | null) => resolve({ code }));
  });
}
