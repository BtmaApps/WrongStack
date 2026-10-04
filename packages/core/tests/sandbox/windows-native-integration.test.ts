import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  buildWindowsAclPlan,
  buildWindowsRoute,
  configureSandboxPolicy,
  defaultWindowsHelperRunner,
  resolveSandboxConfig,
  runHelperRoute,
} from '../../src/sandbox/index.js';

// Plan 28 T5/T5.1 — REAL Windows ACL + restricted-token mechanics, gated:
// WRONGSTACK_SANDBOX_INTEGRATION=1 on a win32 host. Proves (1) the ACL
// plan's icacls mechanics (grant → readback → Low-IL mark) and (2) the T5.1
// runas trustlevel containment: a deny-ACL'd host path is unwritable from
// the spawned process while the Low-IL workspace stays writable. The runas
// launcher is detached — results are observed via the filesystem with
// polling, never via its exit code.

const gated = process.env.WRONGSTACK_SANDBOX_INTEGRATION === '1' && process.platform === 'win32';

const describeGated = gated ? describe : describe.skip;

/** Poll a filesystem predicate — runas children are detached (no exit code). */
async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  expect(predicate()).toBe(true);
}

function icacls(args: string[]): { status: number | null; stdout: string } {
  const probe = spawnSync('icacls', args, { encoding: 'utf8', timeout: 30_000 });
  return { status: probe.status, stdout: `${probe.stdout ?? ''}${probe.stderr ?? ''}` };
}

describeGated('windows-native real ACL + restricted-token mechanics (plan 28 T5/T5.1)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wstack-t5-acl-'));

  afterAll(() => {
    // Best-effort: drop the test ACE, then the tree. The Low-IL label is left
    // on the throwaway temp dir by design (labels are additive).
    const user = `${process.env.USERDOMAIN ?? ''}\\${process.env.USERNAME ?? ''}`;
    try {
      spawnSync('icacls', [dir, '/remove', user], { encoding: 'utf8', timeout: 30_000 });
    } catch {
      // cleanup best-effort
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('applies the plan-shaped icacls grant to a real directory and reads it back', () => {
    const config = resolveSandboxConfig({
      mode: 'enforced',
      tier: 'workspace-write',
      backend: 'windows-native',
      writableRoots: [dir],
    });
    const plan = buildWindowsAclPlan(config);
    expect(plan.grants).toHaveLength(1);
    // The plan's identity is helper-contractual; substitute a real well-known
    // identity so icacls accepts it, keeping the argv shape identical.
    const argv = plan.grants[0].map((part) => part.replace('WrongStackSandbox', 'Everyone'));
    const grant = icacls(argv.slice(1));
    expect(grant.status).toBe(0);
    const readback = icacls([dir]);
    expect(readback.status).toBe(0);
    expect(readback.stdout).toMatch(/Everyone/i);
  });

  it('marks the writable root Low integrity (mandatory-write-up barrier)', () => {
    const mark = icacls([dir, '/setintegritylevel', 'L']);
    expect(mark.status).toBe(0);
    const readback = icacls([dir]);
    expect(readback.stdout).toMatch(/Mandatory Label/i);
  });

  it('a deny-ACL host path OUTSIDE the sandbox is unwritable from the restricted-token spawned process (T5.1)', async () => {
    const user = `${process.env.USERDOMAIN ?? ''}\\${process.env.USERNAME ?? ''}`;
    const sensitive = mkdtempSync(join(tmpdir(), 'wstack-t5-deny-'));
    try {
      // THE deny barrier of this proof: an explicit deny ACE for the spawning
      // user — the runas trustlevel child keeps the SAME user SID, so the
      // deny ACE blocks its writes even though it runs as that very user.
      expect(icacls([sensitive, '/deny', `${user}:F`]).status).toBe(0);
      configureSandboxPolicy({
        mode: 'enforced',
        tier: 'workspace-write',
        backend: 'windows-native',
        writableRoots: [dir],
      });
      const helper = defaultWindowsHelperRunner();

      // T5.2: the helper WAITS on the child — real exit codes propagate. The
      // deny ACE makes cmd fail the redirection with exit 1 (the old detached
      // launcher always resolved 0).
      const denyRoute = (await helper(
        buildWindowsRoute(
          { tool: 'bash', kind: 'shell', command: `echo x > "${sensitive}\\out.txt"` },
          resolveSandboxConfig({
            mode: 'enforced',
            tier: 'workspace-write',
            backend: 'windows-native',
            writableRoots: [dir],
          }),
        )!,
      )) as NonNullable<Awaited<ReturnType<typeof helper>>>;
      const denied = await runHelperRoute(denyRoute);
      expect(denied.code).toBe(1);
      await waitFor(() => !existsSync(join(sensitive, 'out.txt')), 5_000);

      // The workspace itself stays writable through the same launcher.
      const allowRoute = (await helper(
        buildWindowsRoute(
          { tool: 'bash', kind: 'shell', command: `echo ok > "${dir}\\ok.txt"` },
          resolveSandboxConfig({
            mode: 'enforced',
            tier: 'workspace-write',
            backend: 'windows-native',
            writableRoots: [dir],
          }),
        )!,
      )) as NonNullable<Awaited<ReturnType<typeof helper>>>;
      const allowed = await runHelperRoute(allowRoute);
      expect(allowed.code).toBe(0);
      // NOTE: 'ok' is redirected into ok.txt, so the captured pipe is
      // intentionally empty here — stdio propagation is proven by the
      // non-redirected echo case in the T5.2 test below.
      await waitFor(() => existsSync(join(dir, 'ok.txt')), 10_000);
    } finally {
      // Drop the deny ACE so cleanup can remove the tree.
      try {
        spawnSync('icacls', [sensitive, '/remove:d', user], {
          encoding: 'utf8',
          timeout: 30_000,
        });
      } catch {
        // best-effort cleanup
      }
      rmSync(sensitive, { recursive: true, force: true });
    }
  });

  it('exit code and stdio propagate through the helper (T5.2)', async () => {
    configureSandboxPolicy({
      mode: 'enforced',
      tier: 'workspace-write',
      backend: 'windows-native',
      writableRoots: [dir],
    });
    const helper = defaultWindowsHelperRunner();

    // A FAILING payload's non-zero exit code must propagate (the core T5.2
    // assertion the detached runas prototype could never provide).
    const failRoute = (await helper(
      buildWindowsRoute(
        { tool: 'bash', kind: 'shell', command: 'exit 42' },
        resolveSandboxConfig({
          mode: 'enforced',
          tier: 'workspace-write',
          backend: 'windows-native',
          writableRoots: [dir],
        }),
      )!,
    )) as NonNullable<Awaited<ReturnType<typeof helper>>>;
    const failed = await runHelperRoute(failRoute);
    expect(failed.code).toBe(42);

    // Child stdout reaches the launcher's captured pipe.
    const marker = 't52-propagated-marker';
    const echoRoute = (await helper(
      buildWindowsRoute(
        { tool: 'bash', kind: 'shell', command: `echo ${marker}` },
        resolveSandboxConfig({
          mode: 'enforced',
          tier: 'workspace-write',
          backend: 'windows-native',
          writableRoots: [dir],
        }),
      )!,
    )) as NonNullable<Awaited<ReturnType<typeof helper>>>;
    const echoed = await runHelperRoute(echoRoute);
    expect(echoed.code).toBe(0);
    expect(echoed.out).toContain(marker);
  });
});
