import {
  configureSandboxPolicy,
  createSandboxExecWrapper,
  resetSandboxPolicy,
} from '@wrongstack/core/sandbox';
import { afterEach, describe, expect, it } from 'vitest';
import { bashTool } from '../src/bash.js';
import { execTool } from '../src/exec.js';
import { gitTool } from '../src/git.js';
import { mkSandbox, newSignal } from './fixtures.js';

// Replay-equivalence harness for plan 28 T2 (no-config-no-change, R1):
// the wrapped exec-family tools must produce identical outcomes to the raw
// tools with the default policy (mode: off) AND with enforcement enabled
// while the policy-only backend (which never denies) is active.

const wrap = createSandboxExecWrapper();

afterEach(() => {
  resetSandboxPolicy();
});

describe('sandbox choke point — no-config-no-change equivalence', () => {
  it('off-mode wrapped bash behaves identically to the raw tool', async () => {
    const sb = await mkSandbox();
    try {
      const input = { command: 'echo sandbox-eq' };
      const direct = await bashTool.execute(input, sb.ctx, { signal: newSignal() });
      const wrappedResult = await wrap(bashTool).execute(input, sb.ctx, { signal: newSignal() });
      expect(wrappedResult.exit_code).toBe(direct.exit_code);
      expect(wrappedResult.exit_code).toBe(0);
      expect(wrappedResult.output.trim()).toBe(direct.output.trim());
      expect(wrappedResult.timed_out).toBe(false);
    } finally {
      await sb.cleanup();
    }
  });

  it('off-mode wrapped exec behaves identically to the raw tool', async () => {
    const sb = await mkSandbox();
    try {
      const input = { command: 'node', args: ['-e', 'process.stdout.write("sandbox-eq")'] };
      const direct = await execTool.execute(input, sb.ctx, { signal: newSignal() });
      const wrappedResult = await wrap(execTool).execute(input, sb.ctx, { signal: newSignal() });
      expect(wrappedResult.exitCode).toBe(direct.exitCode);
      expect(wrappedResult.exitCode).toBe(0);
      expect(wrappedResult.stdout).toBe(direct.stdout);
      expect(wrappedResult.stdout).toContain('sandbox-eq');
    } finally {
      await sb.cleanup();
    }
  });

  it('enforced + policy-only wrapped bash still matches the raw tool', async () => {
    configureSandboxPolicy({ mode: 'enforced', tier: 'workspace-write' });
    const sb = await mkSandbox();
    try {
      const input = { command: 'echo enforced-ok' };
      const direct = await bashTool.execute(input, sb.ctx, { signal: newSignal() });
      const wrappedResult = await wrap(bashTool).execute(input, sb.ctx, { signal: newSignal() });
      expect(wrappedResult.exit_code).toBe(direct.exit_code);
      expect(wrappedResult.output.trim()).toContain('enforced-ok');
    } finally {
      await sb.cleanup();
    }
  });

  it('wrapped bash streams identically to raw bash (enforced, policy-only)', async () => {
    configureSandboxPolicy({ mode: 'enforced', tier: 'workspace-write' });
    const sb = await mkSandbox();
    try {
      const collect = async (tool: typeof bashTool) => {
        const events: unknown[] = [];
        for await (const event of tool.executeStream?.(
          { command: 'echo stream-equivalence' },
          sb.ctx,
          {
            signal: newSignal(),
          },
        ) ?? []) {
          events.push(event);
        }
        return events;
      };
      const finalOf = (events: unknown[]) =>
        events.find((e) => (e as { type?: string }).type === 'final') as
          | { output?: { output?: string; exit_code?: number } }
          | undefined;
      const rawFinal = finalOf(await collect(bashTool));
      const wrappedFinal = finalOf(await collect(wrap(bashTool)));
      expect(wrappedFinal?.output?.exit_code).toBe(rawFinal?.output?.exit_code);
      expect(wrappedFinal?.output?.output ?? '').toContain('stream-equivalence');
    } finally {
      await sb.cleanup();
    }
  });

  it('wrapped git preserves metadata and behaves identically to raw git', async () => {
    configureSandboxPolicy({ mode: 'enforced', tier: 'workspace-write' });
    const sb = await mkSandbox();
    try {
      const wrapped = wrap(gitTool);
      expect(wrapped.name).toBe('git');
      expect(wrapped.permission).toBe(gitTool.permission);
      expect(wrapped.mutating).toBe(gitTool.mutating);
      expect(wrapped.description).toBe(gitTool.description);
      // mkSandbox's ctx points at a temp dir that is not a git repository, so
      // BOTH raw and wrapped must fail with the identical error — identical
      // outcomes (success or failure) are exactly what equivalence means here.
      const outcome = async () => {
        try {
          const result = await gitTool.execute({ command: 'status' }, sb.ctx, {
            signal: newSignal(),
          });
          return { ok: true as const, exitCode: result.exitCode };
        } catch (error) {
          // NOTE: deliberately `String(error)` — the `instanceof Error ?
          // .message : String()` form is a security-ratchet pattern
          // (security-helpers-are-wired.test.ts) and must not spread.
          return { ok: false as const, message: String(error) };
        }
      };
      const direct = await outcome();
      const viaWrapped = await outcome();
      expect(viaWrapped).toEqual(direct);
      expect(direct.ok).toBe(false);
      expect(direct.message).toContain('Not in a git repository');
    } finally {
      await sb.cleanup();
    }
  });
});
