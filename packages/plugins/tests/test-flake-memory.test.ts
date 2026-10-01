import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FlakyMemory,
  flakyNote,
  isTestCommand,
  parseFailedTests,
  runCompleted,
  treeFingerprint,
} from '../src/test-flake-detector/memory.js';

describe('parseFailedTests', () => {
  it('normalizes a failure so two runs of one test compare equal', () => {
    const a = parseFailedTests(
      ' × tests/parse.test.ts > parses numbers 12ms\n Tests  1 failed (1)',
    );
    const b = parseFailedTests(' × tests/parse.test.ts > parses numbers 340ms');
    expect([...a]).toEqual(['tests/parse.test.ts > parses numbers']);
    expect([...b]).toEqual([...a]);
  });

  it('reads pytest, go and cargo failures', () => {
    const out = [
      'FAILED tests/test_io.py::test_read - AssertionError: boom',
      '--- FAIL: TestFlip (0.01s)',
      'test tests::broken ... FAILED',
      'FAIL  src/a.test.ts > suite > case',
    ].join('\n');
    expect([...parseFailedTests(out)].sort()).toEqual(
      [
        'cargo:tests::broken',
        'go:TestFlip',
        'src/a.test.ts > suite > case',
        'tests/test_io.py::test_read',
      ].sort(),
    );
  });

  it('does not take a jest FAIL file line for a test', () => {
    expect(parseFailedTests('FAIL src/app.test.js').size).toBe(0);
  });
});

describe('runCompleted / isTestCommand', () => {
  it('needs the runner summary', () => {
    expect(runCompleted(' Test Files  1 passed (1)\n      Tests  4 passed (4)')).toBe(true);
    expect(runCompleted('===== 2 failed, 10 passed in 1.23s =====')).toBe(true);
    expect(
      runCompleted('ok  \texample.com/pkg\t0.012s'.replace('\t', ' ').replace('\t', ' ')),
    ).toBe(true);
    expect(runCompleted('test result: FAILED. 3 passed; 1 failed;')).toBe(true);
    expect(runCompleted('Error: Cannot find module vitest')).toBe(false);
  });

  it('recognizes test commands only', () => {
    expect(isTestCommand('pnpm vitest run packages/core')).toBe(true);
    expect(isTestCommand('go test ./...')).toBe(true);
    expect(isTestCommand('cat vitest.config.ts')).toBe(false);
  });
});

describe('FlakyMemory', () => {
  it('flags a failure the identical command passed on the same code', () => {
    const memory = new FlakyMemory();
    const t = 'tests/a.test.ts > flips';
    expect(memory.record('tree1', 'vitest run', new Set())).toEqual([]);
    const findings = memory.record('tree1', 'vitest run', new Set([t]));
    expect(findings).toEqual([{ test: t, passedBefore: 1, failedRuns: 1, totalRuns: 2 }]);
    expect(flakyNote(findings)).toMatch(/failed 1 of 2 runs.*may be a flake/);
  });

  it('never calls a failure after a code change flaky', () => {
    const memory = new FlakyMemory();
    memory.record('tree1', 'vitest run', new Set());
    expect(memory.record('tree2', 'vitest run', new Set(['x']))).toEqual([]);
  });

  it('does not read a filtered run as a pass of a test it did not run', () => {
    const memory = new FlakyMemory();
    memory.record('tree1', 'vitest run tests/other.test.ts', new Set());
    expect(memory.record('tree1', 'vitest run', new Set(['tests/a.test.ts > x']))).toEqual([]);
  });

  it('forgets runs outside the 7-day window', () => {
    const memory = new FlakyMemory();
    const t0 = Date.now();
    memory.record('tree1', 'go test ./...', new Set(), t0);
    expect(
      memory.record('tree1', 'go test ./...', new Set(['go:TestX']), t0 + 8 * 86_400_000),
    ).toEqual([]);
  });
});

describe('treeFingerprint', () => {
  let dir: string;
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: dir, windowsHide: true, stdio: 'pipe' });

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flaky-fp-'));
    git('init', '-q');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    await fs.writeFile(path.join(dir, 'a.txt'), 'one\n');
    git('add', '.');
    git('commit', '-qm', 'init');
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('is stable for an unchanged tree and moves with an edit or a new file', async () => {
    const clean = await treeFingerprint(dir);
    expect(clean).toMatch(/^[0-9a-f]{32}$/);
    expect(await treeFingerprint(dir)).toBe(clean);

    await fs.writeFile(path.join(dir, 'a.txt'), 'two\n');
    const edited = await treeFingerprint(dir);
    expect(edited).not.toBe(clean);

    await fs.writeFile(path.join(dir, 'new.txt'), 'x');
    expect(await treeFingerprint(dir)).not.toBe(edited);
  });

  it('moves when an untracked file is edited, not only when one appears', async () => {
    await fs.writeFile(path.join(dir, 'new.ts'), 'export const x = 1;\n');
    const before = await treeFingerprint(dir);
    await fs.writeFile(path.join(dir, 'new.ts'), 'export const x = 2;\n');
    expect(await treeFingerprint(dir)).not.toBe(before);
  });

  it('drives the plugin hook end to end: pass, then fail on the same tree', async () => {
    const plugin = (await import('../src/test-flake-detector/index.js')).default;
    const registerHook = (() => {
      const hooks: unknown[][] = [];
      const fn = (...args: unknown[]) => {
        hooks.push(args);
        return () => {};
      };
      return Object.assign(fn, { hooks });
    })();
    const api = {
      tools: { register: () => {} },
      config: { extensions: {} },
      log: { info: () => {}, warn: () => {}, error: () => {} },
      metrics: { counter: () => {} },
      registerHook,
    };
    await plugin.setup(api as never);
    const [event, matcher, hook] = registerHook.hooks[0] as [
      string,
      string,
      (i: unknown) => Promise<unknown>,
    ];
    expect([event, matcher]).toEqual(['PostToolUse', 'bash|exec']);

    const run = (content: string) =>
      hook({
        toolName: 'bash',
        toolInput: { command: 'pnpm vitest run' },
        toolResult: { content, isError: false },
        cwd: dir,
      });
    expect(await run(' Test Files  1 passed (1)\n      Tests  2 passed (2)')).toBeUndefined();
    const out = (await run(
      ' × tests/a.test.ts > flips 3ms\n      Tests  1 failed | 1 passed (2)',
    )) as {
      additionalContext?: string;
    };
    expect(out?.additionalContext).toMatch(/tests\/a\.test\.ts > flips \(failed 1 of 2 runs\)/);
    await plugin.teardown?.(api as never);
  });

  it('is null outside a git repository', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'flaky-nogit-'));
    try {
      expect(await treeFingerprint(outside)).toBeNull();
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });
});
