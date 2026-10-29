import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { failureHint, resultSummary, runBenchmark } from '../src/orchestrate.js';
import type { BenchConfig, BenchSuite, BenchTask } from '../src/types.js';

// runBenchmark sweeps leftover daemons through the OS process list after every
// task; these tests run fake agents, so keep them off the real process table.
vi.mock('../src/sandbox-reaper.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/sandbox-reaper.js')>()),
  reapProcessesUnder: async () => 0,
}));

let dir: string;
let fakeWstack: string;
let templateDir: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bench-orch-'));

  // Fake wstack: emits a completed --output-json payload and exits. No network,
  // no real provider — we are testing the orchestration glue, not a model.
  fakeWstack = path.join(dir, 'fake-wstack.js');
  await fs.writeFile(
    fakeWstack,
    [
      'const out = { status: "completed", finalText: "ok", usage: { input: 100, output: 50, iterations: 3, cost: 0.01, elapsedMs: 10 } };',
      'process.stdout.write(JSON.stringify(out) + "\\n");',
    ].join('\n'),
    'utf8',
  );

  // A minimal task template (copied per task × cell).
  templateDir = path.join(dir, 'template');
  await fs.mkdir(templateDir, { recursive: true });
  await fs.writeFile(path.join(templateDir, 'file.txt'), 'hello', 'utf8');
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

function makeSuite(taskIds: string[]): BenchSuite {
  return {
    id: 'polyglot',
    async loadTasks({ limit }) {
      const tasks: BenchTask[] = taskIds.map((id) => ({
        id,
        suite: 'polyglot',
        prompt: `solve ${id}`,
        templateDir,
        meta: {},
      }));
      return limit === undefined ? tasks : tasks.slice(0, limit);
    },
    subsetId: (tasks) => `test:${tasks.map((t) => t.id).join(',')}`,
  };
}

const config: BenchConfig = {
  maxIterations: 10,
  concurrency: 2,
  timeoutMs: 30_000,
  cells: [
    { label: 'cellA', provider: 'p', model: 'm1' },
    { label: 'cellB', provider: 'p', model: 'm2' },
  ],
};

describe('runBenchmark', () => {
  it.each([undefined, 'lean', 'host'] as const)(
    'keeps the child tool surface and fingerprint aligned for profile %s',
    async (profile) => {
      const entry = path.join(dir, `tool-surface-${profile}.cjs`);
      await fs.writeFile(
        entry,
        'console.log(JSON.stringify({status:"completed",finalText:JSON.stringify(process.argv.slice(2))}));',
      );
      const tools = ['read', 'edit', 'write', 'bash', 'grep', 'glob'];
      const report = await runBenchmark({
        suite: makeSuite(['tools']),
        grade: async () => ({ passed: true }),
        config: { ...config, cells: [config.cells[0]!] },
        cliVersion: '1',
        toolNames: [...tools, 'project_kit', 'tool_search', 'tool_use'],
        nodeBin: process.execPath,
        wstackEntry: entry,
        profile,
      });
      expect(report.results[0]?.run.status).toBe('completed');
      const args: string[] = JSON.parse(report.results[0]!.run.finalText!);
      if (profile === 'host') {
        expect(args).not.toContain('--only-tools');
        expect(args).not.toContain('--disallowed-tools');
        expect(report.fingerprint.toolNames).toContain('project_kit');
      } else {
        expect(args).toContain('--only-tools');
        expect(args[args.indexOf('--only-tools') + 1]?.split(',').sort()).toEqual(tools.sort());
        expect(args).toContain('--disallowed-tools');
        expect(args[args.indexOf('--disallowed-tools') + 1]?.split(',').sort()).toEqual([
          'tool_search',
          'tool_use',
        ]);
        expect(report.fingerprint.toolNames).toEqual(tools.sort());
      }
    },
  );

  it('retries a run whose CLI failed to load instead of scoring the model for it', async () => {
    // First start: the checkout is mid-rebuild and a dist file is missing.
    const counter = path.join(dir, 'boot-attempts.txt');
    const flaky = path.join(dir, 'flaky-wstack.js');
    await fs.writeFile(
      flaky,
      [
        'const fs = require("node:fs");',
        `const f = ${JSON.stringify(counter)};`,
        'const n = fs.existsSync(f) ? Number(fs.readFileSync(f, "utf8")) + 1 : 1;',
        'fs.writeFileSync(f, String(n));',
        'if (n === 1) {',
        '  process.stderr.write("Error [ERR_MODULE_NOT_FOUND]: Cannot find module dist/index.js\\n");',
        '  process.exit(1);',
        '}',
        'process.stdout.write(JSON.stringify({ status: "completed", finalText: "ok", usage: { iterations: 2 } }) + "\\n");',
      ].join('\n'),
      'utf8',
    );
    const progress: string[] = [];
    const report = await runBenchmark({
      suite: makeSuite(['t1']),
      grade: async () => ({ passed: true }),
      config: { ...config, concurrency: 1, cells: [{ label: 'only', provider: 'p', model: 'm' }] },
      cliVersion: '1',
      toolNames: [],
      nodeBin: process.execPath,
      wstackEntry: flaky,
      bootRetryDelayMs: 0,
      onProgress: (msg) => progress.push(msg),
    });
    expect(report.results[0]?.run.status).toBe('completed');
    expect(report.results[0]?.grade.passed).toBe(true);
    expect(await fs.readFile(counter, 'utf8')).toBe('2');
    expect(progress.some((line) => line.includes('CLI failed to load, retry 1/2'))).toBe(true);
  });

  it('retries a run that crashed booting before its first model request', async () => {
    // The project SAGE server missed its ping on a loaded machine: no module
    // error, but no model request was made either.
    const counter = path.join(dir, 'sage-attempts.txt');
    const flaky = path.join(dir, 'sage-wstack.js');
    await fs.writeFile(
      flaky,
      [
        'const fs = require("node:fs");',
        `const f = ${JSON.stringify(counter)};`,
        'const n = fs.existsSync(f) ? Number(fs.readFileSync(f, "utf8")) + 1 : 1;',
        'fs.writeFileSync(f, String(n));',
        'if (n === 1) {',
        '  process.stderr.write("Error: SAGE ping exceeded its 5000ms timeout\\n");',
        '  process.exit(1);',
        '}',
        'process.stdout.write(JSON.stringify({ status: "completed", finalText: "ok", usage: { iterations: 2 } }) + "\\n");',
      ].join('\n'),
      'utf8',
    );
    const report = await runBenchmark({
      suite: makeSuite(['t1']),
      grade: async () => ({ passed: true }),
      config: { ...config, concurrency: 1, cells: [{ label: 'only', provider: 'p', model: 'm' }] },
      cliVersion: '1',
      toolNames: [],
      nodeBin: process.execPath,
      wstackEntry: flaky,
      bootRetryDelayMs: 0,
    });
    expect(report.results[0]?.run.status).toBe('completed');
    expect(report.results[0]?.grade.passed).toBe(true);
    expect(await fs.readFile(counter, 'utf8')).toBe('2');
  });

  it('fans out every (task × cell), grades, and folds into a fingerprinted report', async () => {
    const report = await runBenchmark({
      suite: makeSuite(['t1', 't2']),
      // Deterministic grader: tasks ending in "1" pass, others fail. The
      // workdir must exist (template was copied) — assert that too.
      grade: async ({ workdir, task }) => {
        const exists = await fs
          .stat(path.join(workdir, 'file.txt'))
          .then(() => true)
          .catch(() => false);
        return { passed: exists && task.id.endsWith('1') };
      },
      config,
      cliVersion: '0.255.0',
      toolNames: ['read', 'write', 'edit'],
      nodeBin: process.execPath,
      wstackEntry: fakeWstack,
      now: () => '2026-06-14T00:00:00.000Z',
    });

    // 2 tasks × 2 cells = 4 rows.
    expect(report.results).toHaveLength(4);
    expect(report.finishedAt).toBe('2026-06-14T00:00:00.000Z');
    expect(report.fingerprint.hash).toHaveLength(12);
    expect(report.fingerprint.subsetId).toBe('test:t1,t2');

    // Every run parsed the fake's usage block.
    for (const r of report.results) {
      expect(r.run.status).toBe('completed');
      expect(r.run.iterations).toBe(3);
    }

    // Each cell: t1 passes, t2 fails → 50% pass rate.
    expect(report.cells).toHaveLength(2);
    for (const cell of report.cells) {
      expect(cell.taskCount).toBe(2);
      expect(cell.passRate).toBe(0.5);
    }
  });

  it('respects the task limit', async () => {
    const report = await runBenchmark({
      suite: makeSuite(['t1', 't2', 't3']),
      grade: async () => ({ passed: true }),
      config: { ...config, cells: [{ label: 'only', provider: 'p', model: 'm' }] },
      cliVersion: '0.255.0',
      toolNames: [],
      nodeBin: process.execPath,
      wstackEntry: fakeWstack,
      limit: 2,
      now: () => 'fixed',
    });
    // 2 tasks (limited) × 1 cell = 2 rows.
    expect(report.results).toHaveLength(2);
  });

  it('throws a clear error when the suite yields no tasks', async () => {
    await expect(
      runBenchmark({
        suite: makeSuite([]),
        grade: async () => ({ passed: true }),
        config,
        cliVersion: '0.255.0',
        toolNames: [],
        nodeBin: process.execPath,
        wstackEntry: fakeWstack,
      }),
    ).rejects.toThrow(/no tasks/);
  });
});

describe('live progress line', () => {
  const run = {
    status: 'completed' as const,
    finalText: 'ok',
    iterations: 9,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    elapsedMs: 101_880,
    exitCode: 0,
  };

  it('summarises a finished row the way results.jsonl records it', () => {
    expect(resultSummary(run, { total: 88_556, input: 30_000, cacheRead: 50_000 }, 22)).toBe(
      'completed · 102s · 9 it · 88.6k tok (cache 63%) · 22 tools',
    );
    // A crash reads no transcript: no token part, and cost only when known.
    expect(resultSummary({ ...run, status: 'crashed', costUsd: 0.0125 }, undefined, 0)).toBe(
      'crashed · 102s · 9 it · 0 tools · $0.013',
    );
  });

  it('names why a row failed in one ANSI-free line', () => {
    expect(failureHint('agent crashed: exit 1: Error: SAGE ping exceeded\n…15 failed')).toBe(
      'agent crashed: exit 1: Error: SAGE ping exceeded',
    );
    expect(
      failureHint('…noise\n  \u001b[1m● Bowling › rolls after game over\u001b[22m\n  expect(...)'),
    ).toBe('● Bowling › rolls after game over');
    expect(failureHint('…a\r\nFAILED pov_test.py::PovTest::test_x - Assertion\r\n15 failed')).toBe(
      'FAILED pov_test.py::PovTest::test_x - Assertion',
    );
    expect(failureHint('> test\n> jest ./*')).toBe('> jest ./*');
    expect(failureHint(undefined)).toBe('no detail');
    expect(failureHint('x'.repeat(300))).toHaveLength(158);
  });
});
