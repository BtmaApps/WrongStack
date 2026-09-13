/**
 * The `typecheck` tool delegates non-JS ecosystems to the language planner.
 * A timed-out, cancelled or crashed check carries `exitCode: null` and an
 * empty diagnostics summary; `exitCode ?? 0` used to report that as a clean
 * typecheck (exit 0, 0 errors) — the exact signal an agent uses to declare a
 * task done.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tryLegacyCodeOperation = vi.fn();

vi.mock('../src/languages/legacy-bridge.js', () => ({
  tryLegacyCodeOperation: (...args: unknown[]) => tryLegacyCodeOperation(...args),
}));

const { typecheckTool } = await import('../src/typecheck.js');

type RunStatus = 'passed' | 'failed' | 'unavailable' | 'cancelled' | 'timed_out';

function bridge(
  status: RunStatus,
  exitCode: number | null,
  over: { errors?: number; output?: string; error?: string } = {},
) {
  return {
    language: 'rust',
    run: {
      status,
      exitCode,
      summary: { errors: over.errors ?? 0, warnings: 0, infos: 0 },
      output: over.output ?? '',
      error: over.error,
      durationMs: 5,
      truncated: false,
    },
  };
}

const ctx = { cwd: '/proj', tools: [], projectRoot: '/proj' } as never;
const run = () => typecheckTool.execute({}, ctx, { signal: new AbortController().signal });

beforeEach(() => {
  tryLegacyCodeOperation.mockReset();
});

describe('typecheck tool — language planner run status', () => {
  it('reports a clean check', async () => {
    tryLegacyCodeOperation.mockResolvedValue(bridge('passed', 0));
    await expect(run()).resolves.toMatchObject({ exit_code: 0, errors: 0 });
  });

  it('reports type errors from a finished check', async () => {
    tryLegacyCodeOperation.mockResolvedValue(bridge('failed', 101, { errors: 3, output: 'E0308' }));
    await expect(run()).resolves.toMatchObject({ exit_code: 101, errors: 3 });
  });

  it.each([
    ['timed_out', /did not finish \(timed_out\)/],
    ['cancelled', /did not finish \(cancelled\)/],
    ['failed', /did not finish \(failed\): cargo crashed/],
  ] as const)('never reports a %s check as clean', async (status, message) => {
    tryLegacyCodeOperation.mockResolvedValue(bridge(status, null, { error: 'cargo crashed' }));
    await expect(run()).rejects.toThrow(message);
  });

  it('still throws when the checker is unavailable', async () => {
    tryLegacyCodeOperation.mockResolvedValue(
      bridge('unavailable', null, { error: 'cargo not on PATH' }),
    );
    await expect(run()).rejects.toThrow(/checker unavailable: cargo not on PATH/);
  });
});
