import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubcommandDeps } from '../src/subcommands/contracts.js';
import { benchCmd } from '../src/subcommands/handlers/bench.js';
import { readBenchReviewPolicy } from '../src/subcommands/handlers/bench-experiments.js';

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-bench-experiments-'));
});
afterEach(async () => {
  const resolved = path.resolve(root);
  if (
    path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
    !path.basename(resolved).startsWith('cli-bench-experiments-')
  )
    throw new Error('Unexpected fixture cleanup path');
  await fs.rm(resolved, { recursive: true, force: true });
});

function deps(flags: Record<string, string | boolean> = {}) {
  const renderer = { write: vi.fn(), writeError: vi.fn() };
  return { cwd: root, flags, renderer } as unknown as SubcommandDeps & {
    renderer: typeof renderer;
  };
}
function output(d: ReturnType<typeof deps>) {
  expect(d.renderer.writeError).not.toHaveBeenCalled();
  expect(d.renderer.write).toHaveBeenCalledTimes(1);
  return JSON.parse(d.renderer.write.mock.calls[0]![0] as string);
}
async function json(file: string, value: unknown) {
  await fs.writeFile(path.join(root, file), JSON.stringify(value));
}
async function runDirectory(name: string, candidate = false) {
  const directory = path.join(root, name);
  await fs.mkdir(directory);
  await fs.writeFile(
    path.join(directory, 'summary.json'),
    JSON.stringify({
      suite: 'core',
      finishedAt: '2026-10-03',
      cells: [],
      fingerprint: {
        hash: name,
        cliVersion: 'fixture',
        toolNames: ['edit'],
        maxIterations: 10,
        yolo: false,
        subsetId: 'same-task',
        configHash: name,
      },
    }),
  );
  const rows = ['cheap', 'fast'].map((model) => ({
    taskId: 'core/fix',
    cell: { provider: 'fixture', model, label: model },
    attempt: 1,
    run: {
      status: 'completed',
      finalText: 'done',
      iterations: 1,
      tokensIn: 10,
      tokensOut: 5,
      costUsd: model === 'cheap' ? 0.01 : 0.1,
      costSource: 'catalog-estimate',
      elapsedMs: model === 'cheap' ? 100 : 10,
      exitCode: 0,
    },
    grade: { passed: candidate || model === 'cheap' },
    tools: { totalCalls: 1, editCalls: 1, editErrors: 0, rateLimitRetries: 0 },
  }));
  await fs.writeFile(
    path.join(directory, 'results.jsonl'),
    rows.map((row) => JSON.stringify(row)).join('\n'),
  );
}

describe('bench experiment CLI contracts', () => {
  it('reviews a real relative JSONL file and reports source provenance and policy findings', async () => {
    const raw = `${JSON.stringify({ type: 'llm_response', content: [{ type: 'text', text: 'done' }] })}\n\n`;
    await fs.writeFile(path.join(root, 'session.jsonl'), raw);
    await json('policy.json', { requiredFinalMarkers: ['TESTED'] });
    const d = deps({ transcript: 'session.jsonl', policy: 'policy.json' });
    expect(await benchCmd(['review'], d)).toBe(0);
    expect(output(d)).toMatchObject({
      advisory: true,
      sourceFormat: 'jsonl',
      eventCount: 1,
      sourceHash: createHash('sha256').update(raw).digest('hex'),
      findings: expect.arrayContaining([
        expect.objectContaining({ category: 'missing-final-requirement' }),
      ]),
    });
  });
  it('supports a review with no policy file', async () => {
    await fs.writeFile(path.join(root, 'session.jsonl'), '{}\n');
    const d = deps({ transcript: 'session.jsonl' });
    expect(await benchCmd(['review'], d)).toBe(0);
    expect(output(d).eventCount).toBe(1);
  });
  it('loads a finished run and produces a shadow recommendation', async () => {
    await runDirectory('run');
    await json('route.json', { version: 1, minAttempts: 1, categories: { repair: ['core/fix'] } });
    const d = deps({ policy: 'route.json' });
    expect(await benchCmd(['route', 'run'], d)).toBe(0);
    expect(output(d)).toMatchObject({
      mode: 'shadow',
      fingerprint: 'run',
      categories: [
        { category: 'repair', recommended: expect.objectContaining({ model: 'cheap' }) },
      ],
    });
    expect(await fs.readdir(path.join(root, 'run'))).toEqual(['results.jsonl', 'summary.json']);
  });
  it.each(['behavior', 'compaction'])(
    'compares paired run directories for %s',
    async (dimension) => {
      await runDirectory('base');
      await runDirectory('candidate', true);
      const d = deps({ dimension });
      expect(await benchCmd(['experiment', 'base', 'candidate'], d)).toBe(0);
      expect(output(d)).toMatchObject({
        dimension,
        configurationEvidence: 'operator-declared',
        baseline: { metrics: { passed: 1 } },
        candidate: { metrics: { passed: 2 } },
      });
    },
  );
  it.each(['null', '[]', '"event"'])('refuses non-event JSONL %s', async (raw) => {
    await fs.writeFile(path.join(root, 'session.jsonl'), raw);
    const d = deps({ transcript: 'session.jsonl' });
    expect(await benchCmd(['review'], d)).toBe(1);
    expect(d.renderer.writeError).toHaveBeenCalledWith('Transcript contains a non-event');
    expect(d.renderer.write).not.toHaveBeenCalled();
  });
  it.each([
    { args: ['review'], flags: { transcript: true }, error: 'Use bench review' },
    { args: ['route', 'run'], flags: {}, error: 'Use bench route' },
    {
      args: ['experiment', 'base'],
      flags: { dimension: 'behavior' },
      error: 'Use bench experiment',
    },
    {
      args: ['experiment', 'base', 'next'],
      flags: { dimension: 'other' },
      error: 'Use bench experiment',
    },
  ])('rejects incomplete CLI arguments: $args', async ({ args, flags, error }) => {
    const d = deps(flags as Record<string, string | boolean>);
    expect(await benchCmd(args, d)).toBe(1);
    expect(d.renderer.writeError).toHaveBeenCalledWith(expect.stringContaining(error));
    expect(d.renderer.write).not.toHaveBeenCalled();
  });
  it('rejects oversized policy files without parsing them', async () => {
    const file = path.join(root, 'oversized.json');
    await fs.writeFile(file, '{}');
    await fs.truncate(file, 128 * 1024 + 1);
    const d = deps({ policy: 'oversized.json' });
    expect(await benchCmd(['review'], d)).toBe(1);
    expect(d.renderer.writeError).toHaveBeenCalledWith('Experiment input exceeds the size limit');
  });
  it('surfaces malformed JSON and missing input files without printing reports', async () => {
    await fs.writeFile(path.join(root, 'bad.json'), '{');
    for (const policy of ['bad.json', 'missing.json']) {
      const d = deps({ policy });
      expect(await benchCmd(['review'], d)).toBe(1);
      expect(d.renderer.writeError).toHaveBeenCalledTimes(1);
      expect(d.renderer.write).not.toHaveBeenCalled();
    }
  });
  it('validates benchmark review policies before any run can start', async () => {
    await json('valid.json', { repeatLimit: 4 });
    await json('array.json', []);
    await json('invalid.json', { repeatLimit: 1 });
    expect(await readBenchReviewPolicy(path.join(root, 'valid.json'))).toEqual({ repeatLimit: 4 });
    await expect(readBenchReviewPolicy(path.join(root, 'array.json'))).rejects.toThrow(
      'Invalid review policy',
    );
    await expect(readBenchReviewPolicy(path.join(root, 'invalid.json'))).rejects.toThrow(
      'repeat limit',
    );
  });
});
