import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { spawnStream } from '../src/_spawn-stream.js';
import { testTool } from '../src/test.js';

// We need to mock the spawnStream to avoid actual test execution
// but still exercise the parsing logic
vi.mock('../src/_spawn-stream.js', async () => {
  const actual = await vi.importActual('../src/_spawn-stream.js');
  return {
    ...actual,
    // biome-ignore lint/correctness/useYield: mock returns no partial lines
    spawnStream: vi.fn(async function* () {
      return { stdout: '', stderr: '', exitCode: 0, truncated: false };
    }),
  };
});

describe('testTool', () => {
  it('has correct metadata', () => {
    expect(testTool.name).toBe('test');
    expect(testTool.permission).toBe('confirm');
    expect(testTool.mutating).toBe(false);
  });

  it('returns none when no runner found — and says "no tests", never a pass', async () => {
    const ctx = { cwd: '/', tools: [], projectRoot: '/' } as any;
    // When no config file is found in the directory, detectRunner returns null
    // and the tool short-circuits with runner: 'none'. It used to report
    // exit_code 0, which every consumer read as a green run.
    const result = await testTool.execute({ runner: 'auto' }, ctx, {
      signal: new AbortController().signal,
    });
    expect(result.runner).toBe('none');
    expect(result.status).toBe('no_tests');
    expect(result.exit_code).toBeNull();
    expect(result.output).toMatch(/^No tests:/);
  });

  it('throws when the runner process cannot be spawned (not an exit-code result)', async () => {
    vi.mocked(spawnStream).mockImplementationOnce(
      // biome-ignore lint/correctness/useYield: mock returns no partial lines
      async function* () {
        return {
          stdout: '',
          stderr: '',
          exitCode: 1,
          truncated: false,
          error: 'spawn vitest ENOENT',
        };
      },
    );
    const ctx = { cwd: '/fake', tools: [], projectRoot: '/fake' } as any;
    await expect(
      testTool.execute({ runner: 'vitest' }, ctx, { signal: new AbortController().signal }),
    ).rejects.toThrow(/test: failed to start vitest: spawn vitest ENOENT/);
  });

  const runWith = async (runner: 'vitest' | 'jest' | 'mocha', stdout: string, exitCode: number) => {
    vi.mocked(spawnStream).mockImplementationOnce(
      // biome-ignore lint/correctness/useYield: mock returns no partial lines
      async function* () {
        return { stdout, stderr: '', exitCode, truncated: false };
      },
    );
    const ctx = { cwd: '/fake', tools: [], projectRoot: '/fake' } as any;
    return testTool.execute({ runner }, ctx, { signal: new AbortController().signal });
  };

  it('reports no_tests (not failed) when the runner finds no test files', async () => {
    const vitest = await runWith('vitest', 'No test files found, exiting with code 1', 1);
    expect(vitest.status).toBe('no_tests');
    expect(vitest.tests_run).toBe(0);
    const jest = await runWith('jest', 'No tests found, exiting with code 1', 1);
    expect(jest.status).toBe('no_tests');
    const mocha = await runWith('mocha', '\n  0 passing (2ms)\n', 0);
    expect(mocha.status).toBe('no_tests');
  });

  it('reports passed / failed when tests actually ran', async () => {
    const passed = await runWith('vitest', 'Tests  3 passed (3)', 0);
    expect(passed).toMatchObject({ status: 'passed', passed: 3, tests_run: 3 });
    const failed = await runWith('vitest', 'Tests  1 failed | 2 passed (3)', 1);
    expect(failed).toMatchObject({ status: 'failed', failed: 1, tests_run: 3 });
  });
});

describe('testTool executeStream API', () => {
  it('emits final event when no runner is found', async () => {
    const ctx = { cwd: '/', tools: [], projectRoot: '/' } as any;
    const events: any[] = [];
    for await (const ev of testTool.executeStream!({ runner: 'none' as any }, ctx, {
      signal: new AbortController().signal,
    })) {
      events.push(ev);
    }
    expect(events.some((e) => e.type === 'final')).toBe(true);
    const final = events.find((e) => e.type === 'final');
    expect(final?.output.runner).toBe('none');
  });

  it('emits a single final event on short-circuit (no log)', async () => {
    const ctx = { cwd: '/', tools: [], projectRoot: '/' } as any;
    const events: any[] = [];
    for await (const ev of testTool.executeStream!({ runner: 'auto' }, ctx, {
      signal: new AbortController().signal,
    })) {
      events.push(ev);
    }
    // When no runner config exists, the tool short-circuits with exactly one final event.
    expect(events.filter((e) => e.type === 'log')).toHaveLength(0);
    const finals = events.filter((e) => e.type === 'final');
    expect(finals).toHaveLength(1);
    expect(finals[0]?.output.runner).toBe('none');
  });
});

describe('detectRunner (via executeStream in temp dirs)', () => {
  it('detects vitest.config.ts and returns vitest', async () => {
    const tmpDir = await fs.mkdtemp(path.join('/tmp', 'test-detect-'));
    try {
      await fs.writeFile(path.join(tmpDir, 'vitest.config.ts'), 'export default {}');
      const ctx = { cwd: tmpDir, tools: [], projectRoot: tmpDir } as any;
      const result = await testTool.execute({ runner: 'auto' }, ctx, {
        signal: new AbortController().signal,
      });
      expect(result.runner).toBe('vitest');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('detects jest.config.js and returns jest', async () => {
    const tmpDir = await fs.mkdtemp(path.join('/tmp', 'test-detect-'));
    try {
      await fs.writeFile(path.join(tmpDir, 'jest.config.js'), 'module.exports = {}');
      const ctx = { cwd: tmpDir, tools: [], projectRoot: tmpDir } as any;
      const result = await testTool.execute({ runner: 'auto' }, ctx, {
        signal: new AbortController().signal,
      });
      expect(result.runner).toBe('jest');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('detects .mocharc.json and returns mocha', async () => {
    const tmpDir = await fs.mkdtemp(path.join('/tmp', 'test-detect-'));
    try {
      await fs.writeFile(path.join(tmpDir, '.mocharc.json'), '{}');
      const ctx = { cwd: tmpDir, tools: [], projectRoot: tmpDir } as any;
      const result = await testTool.execute({ runner: 'auto' }, ctx, {
        signal: new AbortController().signal,
      });
      expect(result.runner).toBe('mocha');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('short-circuits to none when no config file found', async () => {
    const ctx = { cwd: '/', tools: [], projectRoot: '/' } as any;
    const result = await testTool.execute({ runner: 'auto' }, ctx, {
      signal: new AbortController().signal,
    });
    // When no config is found, the tool short-circuits with runner: 'none'
    expect(result.runner).toBe('none');
  });
});

describe('buildArgs — the flags that actually reach the runner', () => {
  // These used to assert only `toHaveProperty('output')`, which the mocked
  // spawn returns no matter what argv was built.
  const argvFor = async (input: Record<string, unknown>) => {
    vi.mocked(spawnStream).mockClear();
    const ctx = { cwd: '/fake', tools: [], projectRoot: '/fake' } as any;
    await testTool.execute(input as never, ctx, { signal: new AbortController().signal });
    const call = vi.mocked(spawnStream).mock.calls[0]?.[0] as { cmd: string; args: string[] };
    return call;
  };

  it.each([
    [
      'vitest grep + coverage',
      { runner: 'vitest', grep: 'mytest', coverage: true },
      ['run', '--coverage', '--testNamePattern', 'mytest', '--testTimeout', '30000'],
    ],
    ['vitest timeout', { runner: 'vitest', timeout: 5000 }, ['run', '--testTimeout', '5000']],
    [
      'vitest files array (normalised separators)',
      { runner: 'vitest', files: ['a.test.ts', 'src\\b.test.ts'] },
      ['run', '--testTimeout', '30000', '--', 'a.test.ts', 'src/b.test.ts'],
    ],
    [
      'mocha files string + timeout',
      { runner: 'mocha', files: 'test.ts', timeout: 10000 },
      ['--reporter', 'spec', '--timeout', '10000', '--', 'test.ts'],
    ],
    [
      'mocha grep',
      { runner: 'mocha', grep: 'pattern' },
      ['--reporter', 'spec', '--grep', 'pattern', '--timeout', '30000'],
    ],
    [
      'jest files',
      { runner: 'jest', files: 'test.spec.ts' },
      ['--testTimeout', '30000', '--', 'test.spec.ts'],
    ],
    [
      'jest coverage + grep',
      { runner: 'jest', coverage: true, grep: 'testpattern' },
      ['--coverage', '--testNamePattern', 'testpattern', '--testTimeout', '30000'],
    ],
    ['timeout floor', { runner: 'jest', timeout: 5 }, ['--testTimeout', '100']],
  ])('%s', async (_label, input, expected) => {
    const call = await argvFor(input);
    expect(call.cmd).toBe(input.runner);
    expect(call.args).toEqual(expected);
  });

  it.each([
    ['vitest', ['run', '--testTimeout', '30000']],
    ['jest', ['--testTimeout', '30000']],
  ])(
    '%s ignores watch — a watch-mode runner never exits inside a tool call',
    async (runner, expected) => {
      const call = await argvFor({ runner, watch: true });
      expect(call.args).toEqual(expected);
    },
  );
});

describe('parseResult — real runner output', () => {
  const runWithOutput = async (
    runner: 'vitest' | 'jest' | 'mocha',
    stdout: string,
    exitCode: number,
  ) => {
    vi.mocked(spawnStream).mockImplementationOnce(
      // biome-ignore lint/correctness/useYield: mock returns no partial lines
      async function* () {
        return { stdout, stderr: '', exitCode, truncated: false };
      },
    );
    const ctx = { cwd: '/fake', tools: [], projectRoot: '/fake' } as any;
    return testTool.execute({ runner }, ctx, { signal: new AbortController().signal });
  };

  it('parses a jest summary with failures', async () => {
    const result = await runWithOutput('jest', 'Tests:       1 failed, 2 passed, 3 total', 1);
    expect(result).toMatchObject({
      runner: 'jest',
      status: 'failed',
      exit_code: 1,
      tests_run: 3,
      passed: 2,
      failed: 1,
    });
  });

  it('parses a clean jest run', async () => {
    const result = await runWithOutput('jest', 'Tests:       4 passed, 4 total', 0);
    expect(result).toMatchObject({ status: 'passed', tests_run: 4, passed: 4, failed: 0 });
  });

  it('parses mocha passing/failing counts', async () => {
    const result = await runWithOutput('mocha', '\n  2 passing (5ms)\n  1 failing\n', 1);
    expect(result).toMatchObject({ status: 'failed', tests_run: 3, passed: 2, failed: 1 });
  });

  it('never reports a non-zero exit as passed, even when every parsed test passed', async () => {
    // e.g. coverage threshold or a crash after the summary printed.
    const result = await runWithOutput('vitest', 'Tests  3 passed (3)', 1);
    expect(result.status).toBe('failed');
  });
});
