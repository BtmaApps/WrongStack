import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BenchMenuChoices,
  type BenchMenuIo,
  cellLabels,
  parseIndexList,
  plannedAttempts,
  planRuns,
  runBenchMenu,
} from '../src/subcommands/handlers/bench-menu.js';

const base: BenchMenuChoices = {
  mode: 'models',
  suite: 'hard',
  models: ['zai-coding-plan/glm-5.3-flash', 'minimax-coding-plan/MiniMax-M3.1-Flash'],
  variants: ['quick'],
  repeats: 3,
};

describe('parseIndexList', () => {
  it('accepts commas, spaces and ranges, dropping duplicates', () => {
    expect(parseIndexList('1,3', 4)).toEqual([1, 3]);
    expect(parseIndexList('2 1 2', 4)).toEqual([2, 1]);
    expect(parseIndexList('2-4', 4)).toEqual([2, 3, 4]);
  });

  it('rejects out-of-range, reversed and non-numeric input', () => {
    expect(parseIndexList('5', 4)).toBeUndefined();
    expect(parseIndexList('0', 4)).toBeUndefined();
    expect(parseIndexList('3-1', 4)).toBeUndefined();
    expect(parseIndexList('1a', 4)).toBeUndefined();
    expect(parseIndexList('', 4)).toBeUndefined();
  });
});

describe('cellLabels', () => {
  it('uses the bare model id unless two providers share it', () => {
    expect(cellLabels(base.models)).toEqual(['glm-5.3-flash', 'MiniMax-M3.1-Flash']);
    expect(cellLabels(['a/m', 'b/m', 'c/x'])).toEqual(['a/m', 'b/m', 'x']);
  });
});

describe('planRuns', () => {
  it('compares models in one run on the lean default prompt', () => {
    const runs = planRuns(base);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.harnessOverlay).toBeUndefined();
    expect(runs[0]?.flags).toEqual({
      suite: 'hard',
      cell: 'glm-5.3-flash=zai-coding-plan/glm-5.3-flash,MiniMax-M3.1-Flash=minimax-coding-plan/MiniMax-M3.1-Flash',
      repeats: '3',
    });
  });

  it('runs once per prompt variant, overlaying only non-default variants', () => {
    const runs = planRuns({ ...base, mode: 'prompts', variants: ['quick', 'pro'] });
    expect(runs.map((r) => r.title)).toEqual(['quick prompt', 'pro prompt']);
    expect(runs[0]?.harnessOverlay).toBeUndefined();
    expect(runs[1]?.harnessOverlay).toEqual({ systemPrompt: { variant: 'pro' } });
  });

  it('pins the full polyglot run to the 223-task set', () => {
    const [run] = planRuns({ ...base, suite: 'polyglot', polyglotDir: '/data/pg' });
    expect(run?.flags).toMatchObject({ suite: 'polyglot', subset: 'polyglot-wstack-223' });
  });

  it('maps the polyglot subset to the pinned bundled subset', () => {
    const [run] = planRuns({ ...base, suite: 'polyglot-40', polyglotDir: '/data/pg' });
    expect(run?.flags).toMatchObject({
      suite: 'polyglot',
      subset: 'polyglot-wstack-40',
      'polyglot-dir': '/data/pg',
    });
  });
});

describe('plannedAttempts', () => {
  it('multiplies tasks × models × variants × repeats', () => {
    expect(plannedAttempts(base)).toBe(8 * 2 * 3);
    expect(plannedAttempts({ ...base, mode: 'both', variants: ['quick', 'pro'] })).toBe(96);
  });

  it('scales the full polyglot set by the languages that can be graded', () => {
    expect(plannedAttempts({ ...base, suite: 'polyglot', repeats: 1 }, 4)).toBe(149 * 2);
  });
});

describe('runBenchMenu', () => {
  let home: string;
  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'bench-menu-'));
  });
  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
  });

  function deps(answers: string[]) {
    const written: string[] = [];
    return {
      written,
      deps: {
        config: { providers: {}, favoriteModels: [] },
        modelsRegistry: { listProviders: async () => [] },
        paths: { globalRoot: home },
        renderer: {
          write: (s: string) => written.push(s),
          writeError: (s: string) => written.push(`ERR ${s}`),
          writeInfo: (s: string) => written.push(s),
        },
        reader: {
          readLine: vi.fn(async () => {
            const next = answers.shift();
            if (next === undefined) throw new Error('menu asked more than the test answered');
            return next;
          }),
        },
      } as never,
    };
  }

  it('turns the answers into one bench run per prompt variant and remembers them', async () => {
    const run = vi.fn<BenchMenuIo['run']>(async () => 0);
    // compare: prompts · bench: hard · model typed · variants: quick(5), pro(3) · 1 attempt · start
    const first = deps(['2', '2', 'zai-coding-plan/glm-5.3-flash', '5,3', '', '']);
    expect(await runBenchMenu(first.deps, { run })).toBe(0);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[0]?.[0]).toMatchObject({ suite: 'hard', repeats: '1' });
    expect(run.mock.calls[1]?.[1]).toMatchObject({
      harnessOverlay: { systemPrompt: { variant: 'pro' } },
    });

    const saved = JSON.parse(await fs.readFile(path.join(home, 'bench', 'menu-last.json'), 'utf8'));
    expect(saved).toMatchObject({ mode: 'prompts', variants: ['quick', 'pro'] });

    // Next time: Enter on "Run that again?", Enter on "Start?".
    run.mockClear();
    const again = deps(['', '']);
    expect(await runBenchMenu(again.deps, { run })).toBe(0);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('quits without running when the user types q', async () => {
    const run = vi.fn(async () => 0);
    const session = deps(['q']);
    expect(await runBenchMenu(session.deps, { run })).toBe(0);
    expect(run).not.toHaveBeenCalled();
  });

  it('treats Ctrl-C at a prompt as quit, not as Enter on the default', async () => {
    // readLine reported Ctrl-C as '' — "Start? [Y/n]" then started the run.
    const run = vi.fn(async () => 0);
    const session = deps([]);
    // mode, benchmark, model, attempts — then Ctrl-C on "Start?".
    const answers = ['1', '1', 'zai-coding-plan/glm-5.3-flash', ''];
    (session.deps as { reader: Record<string, unknown> }).reader['readLineCancelable'] = vi.fn(
      async () => answers.shift() ?? null,
    );
    expect(await runBenchMenu(session.deps, { run })).toBe(0);
    expect(run).not.toHaveBeenCalled();
  });

  it('stops after a run the user stopped instead of starting the next variant', async () => {
    const run = vi.fn(async () => 130);
    const session = deps(['2', '2', 'zai-coding-plan/glm-5.3-flash', '5,3', '', '']);
    expect(await runBenchMenu(session.deps, { run })).toBe(130);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('offers to finish the newest unfinished run', async () => {
    const cwd = path.join(home, 'project');
    const runDir = path.join(cwd, 'bench-results', '2026-10-28T08-01-23-270Z');
    await fs.mkdir(runDir, { recursive: true });
    const cell = { label: 'glm', provider: 'zai-coding-plan', model: 'glm-5.3-flash' };
    await fs.writeFile(
      path.join(runDir, 'run.json'),
      JSON.stringify({
        suite: 'hard',
        startedAt: '2026-10-28T08:01:23.270Z',
        fingerprint: { hash: 'abc' },
        cells: [cell],
        planned: 3,
        flags: { suite: 'hard' },
      }),
    );
    const row = {
      taskId: 'hard/a',
      cell,
      run: { status: 'completed' },
      grade: { passed: true },
      tools: {},
    };
    await fs.writeFile(path.join(runDir, 'results.jsonl'), `${JSON.stringify(row)}\n`);
    const run = vi.fn(async () => 0);
    const resume = vi.fn(async () => 0);
    const session = deps(['']);
    (session.deps as { cwd: string }).cwd = cwd;
    expect(await runBenchMenu(session.deps, { run, resume })).toBe(0);
    expect(resume).toHaveBeenCalledWith(runDir);
    expect(session.written.join('')).toContain('1/3 done');
    expect(run).not.toHaveBeenCalled();
  });

  it('offers to run again a task group whose every recorded row failed', async () => {
    const cwd = path.join(home, 'project-rerun');
    const runDir = path.join(cwd, 'bench-results', '2026-10-28T11-34-40-572Z');
    await fs.mkdir(runDir, { recursive: true });
    const cell = { label: 'glm', provider: 'zai-coding-plan', model: 'glm-5.3-flash' };
    await fs.writeFile(
      path.join(runDir, 'run.json'),
      JSON.stringify({
        suite: 'polyglot',
        startedAt: '2026-10-28T11:34:40.879Z',
        fingerprint: { hash: 'abc' },
        cells: [cell],
        planned: 10,
        flags: { suite: 'polyglot' },
      }),
    );
    const rows = [
      ['polyglot/go/a', true],
      ['polyglot/go/b', false],
      ['polyglot/go/c', true],
      ['polyglot/java/a', false],
      ['polyglot/java/b', false],
      ['polyglot/java/c', false],
    ].map(([taskId, passed]) => ({
      taskId,
      cell,
      run: { status: 'completed' },
      grade: { passed },
      tools: {},
    }));
    await fs.writeFile(
      path.join(runDir, 'results.jsonl'),
      rows.map((row) => `${JSON.stringify(row)}\n`).join(''),
    );
    const resume = vi.fn(async () => 0);
    const session = deps(['', 'y']);
    (session.deps as { cwd: string }).cwd = cwd;
    expect(await runBenchMenu(session.deps, { run: vi.fn(async () => 0), resume })).toBe(0);
    // go has a pass, so only the all-failed java group is offered.
    expect(resume).toHaveBeenCalledWith(runDir, ['polyglot/java/']);
  });

  it('keeps the case of a typed model id', async () => {
    const run = vi.fn<BenchMenuIo['run']>(async () => 0);
    const session = deps(['1', '1', 'minimax-coding-plan/MiniMax-M3.1-Flash', '', '']);
    await runBenchMenu(session.deps, { run });
    expect(run.mock.calls[0]?.[0]).toMatchObject({
      cell: 'MiniMax-M3.1-Flash=minimax-coding-plan/MiniMax-M3.1-Flash',
    });
  });
});
