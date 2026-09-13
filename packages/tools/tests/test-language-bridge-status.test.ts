/**
 * The `test` tool delegates non-JS ecosystems (Go, Rust, PHP, C#) to the
 * language planner. The planner's run status is authoritative: a run that
 * timed out, was cancelled, or crashed carries `exitCode: null`, and the old
 * `exitCode ?? 0` turned every one of those into exit 0 → status "passed".
 * An agent would then report green tests that never finished.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tryLegacyCodeOperation = vi.fn();

vi.mock('../src/languages/legacy-bridge.js', () => ({
  tryLegacyCodeOperation: (...args: unknown[]) => tryLegacyCodeOperation(...args),
}));

const { testTool } = await import('../src/test.js');

type RunStatus = 'passed' | 'failed' | 'unavailable' | 'cancelled' | 'timed_out';

function bridge(
  status: RunStatus,
  exitCode: number | null,
  over: { passed?: number; failed?: number; output?: string; error?: string } = {},
) {
  return {
    language: 'go',
    run: {
      status,
      exitCode,
      summary: { passed: over.passed ?? 0, failed: over.failed ?? 0 },
      output: over.output ?? '',
      error: over.error,
      durationMs: 12,
      truncated: false,
    },
  };
}

const ctx = { cwd: '/proj', tools: [], projectRoot: '/proj' } as never;
const run = (signal = new AbortController().signal) =>
  testTool.execute({ runner: 'auto' }, ctx, { signal });

beforeEach(() => {
  tryLegacyCodeOperation.mockReset();
});

describe('test tool — language planner run status', () => {
  it('reports a clean planner pass as passed', async () => {
    tryLegacyCodeOperation.mockResolvedValue(bridge('passed', 0, { passed: 3, output: 'ok' }));
    await expect(run()).resolves.toMatchObject({
      runner: 'go',
      status: 'passed',
      exit_code: 0,
      tests_run: 3,
    });
  });

  it('never reports a timed-out run as passed', async () => {
    tryLegacyCodeOperation.mockResolvedValue(
      bridge('timed_out', null, { passed: 2, output: 'partial' }),
    );
    const result = await run();
    expect(result).toMatchObject({ status: 'failed', exit_code: null });
    expect(result.output).toMatch(/timed out/i);
    expect(result.output).toContain('partial');
  });

  it('never reports a failing run as passed, even if the summary shows no failures', async () => {
    tryLegacyCodeOperation.mockResolvedValue(bridge('failed', 2, { output: 'build failed' }));
    await expect(run()).resolves.toMatchObject({ status: 'failed', exit_code: 2 });
  });

  it('throws when the run crashed before producing an exit code', async () => {
    tryLegacyCodeOperation.mockResolvedValue(bridge('failed', null, { error: 'spawn go ENOENT' }));
    await expect(run()).rejects.toThrow(/failed to run: spawn go ENOENT/);
  });

  it('throws when the run was cancelled', async () => {
    tryLegacyCodeOperation.mockResolvedValue(bridge('cancelled', null));
    await expect(run()).rejects.toThrow(/cancelled/);
  });

  it('still throws when the runner is unavailable', async () => {
    tryLegacyCodeOperation.mockResolvedValue(
      bridge('unavailable', null, { error: 'go not on PATH' }),
    );
    await expect(run()).rejects.toThrow(/runner unavailable: go not on PATH/);
  });
});
