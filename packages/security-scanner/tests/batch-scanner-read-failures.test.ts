import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    open: async (file: string, ...args: unknown[]) => {
      if (file.endsWith('blocked.ts')) throw new Error('simulated EACCES');
      return (actual.open as (...args: unknown[]) => unknown)(file, ...args);
    },
  };
});

import { BatchScanner } from '../src/batch-scanner.js';

it('counts readable files and reports unreadable files without losing the batch', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'batch-scanner-read-'));
  await fs.writeFile(path.join(root, 'allowed.ts'), 'const allowed = 1;');
  await fs.writeFile(path.join(root, 'blocked.ts'), 'const blocked = 1;');
  const complete = vi.fn(async () => ({ content: [{ type: 'text', text: '[]' }] }));
  try {
    const result = await new BatchScanner().runBatchScan({
      provider: { complete } as never,
      model: undefined,
      projectRoot: root,
      skill: { patterns: [], metadata: { targetFiles: ['*.ts'] } } as never,
      techStack: {} as never,
      depth: 'quick',
      llmBatchSize: 10,
      fileConcurrency: 10,
      abortController: new AbortController(),
    });
    expect(complete).toHaveBeenCalledOnce();
    expect(result.scannedFiles).toBe(1);
    expect(result.errors.join(' ')).toContain('blocked.ts');
    expect(result.errors.join(' ')).toContain('simulated EACCES');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

it('counts every file when both are readable', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'batch-scanner-control-'));
  await fs.writeFile(path.join(root, 'first.ts'), 'const first = 1;');
  await fs.writeFile(path.join(root, 'second.ts'), 'const second = 2;');
  try {
    const result = await new BatchScanner().runBatchScan({
      provider: { complete: async () => ({ content: [{ type: 'text', text: '[]' }] }) } as never,
      model: undefined,
      projectRoot: root,
      skill: { patterns: [], metadata: { targetFiles: ['*.ts'] } } as never,
      techStack: {} as never,
      depth: 'quick',
      llmBatchSize: 10,
      fileConcurrency: 10,
      abortController: new AbortController(),
    });
    expect(result.scannedFiles).toBe(2);
    expect(result.errors).toEqual([]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
