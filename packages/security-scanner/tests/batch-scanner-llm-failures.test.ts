import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BatchScanner } from '../src/batch-scanner.js';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'batch-scanner-llm-'));
  await fs.writeFile(path.join(root, 'app.ts'), 'const app = 1;');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

function scan(complete: () => Promise<unknown>, abortController = new AbortController()) {
  return new BatchScanner().runBatchScan({
    provider: { complete } as never,
    model: undefined,
    projectRoot: root,
    skill: { patterns: [], metadata: { targetFiles: ['*.ts'] } } as never,
    techStack: {} as never,
    depth: 'quick',
    llmBatchSize: 10,
    fileConcurrency: 10,
    abortController,
  });
}

it('reports a batch the model never analysed instead of a clean scan', async () => {
  const result = await scan(async () => {
    throw new Error('503 upstream unavailable');
  });
  expect(result.summary.total).toBe(0);
  expect(result.errors).toEqual(['LLM analysis failed for app.ts: 503 upstream unavailable']);
});

it('adds no error when the scan was cancelled', async () => {
  const abortController = new AbortController();
  const result = await scan(async () => {
    abortController.abort();
    throw new Error('aborted');
  }, abortController);
  expect(result.errors).toEqual([]);
});
