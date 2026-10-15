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

it('keeps a completed batch\u2019s findings when the cancel lands before the push', async () => {
  // Regression: the abort check ran before findings.push, so a batch the model
  // had already analysed was discarded while its reads stayed counted in
  // scannedFiles \u2014 a cancelled scan reported a scanned file with no findings.
  const abortController = new AbortController();
  let calls = 0;
  const result = await scan(async () => {
    calls += 1;
    if (calls === 1) {
      // The batch completes, then the cancel lands before runBatchScan's push.
      abortController.abort();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              {
                file: 'app.ts',
                line: 1,
                severity: 'high',
                category: 'secrets',
                title: 't',
                description: 'd',
                remediation: 'r',
              },
            ]),
          },
        ],
      };
    }
    throw new Error('must not be called');
  }, abortController);
  expect(result.findings.map((f) => f.file)).toEqual(['app.ts']);
  expect(result.scannedFiles).toBe(1);
  expect(result.errors).toEqual([]);
});
