import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { replaceTool } from '../src/replace.js';
import { mkSandbox, type Sandbox } from './fixtures.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

let sandbox: Sandbox;
let tmpDir: string;
beforeEach(async () => {
  sandbox = await mkSandbox();
  tmpDir = sandbox.dir;
});
afterEach(async () => {
  vi.mocked(fs.readFile).mockClear();
  await sandbox.cleanup();
});

const input = {
  files: 'target.txt',
  pattern: 'TARGET',
  replacement: 'DONE',
  dry_run: false,
};
const makeCtx = (signal: AbortSignal) => {
  sandbox.ctx.signal = signal;
  return sandbox.ctx;
};

describe('replace cancellation before commit', () => {
  it.each(['opts', 'context'] as const)(
    'leaves the file unchanged when %s signal aborts during the read',
    async (source) => {
      const file = path.join(tmpDir, input.files);
      await fs.writeFile(file, 'TARGET');
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
      const controller = new AbortController();
      const reason = new Error('cancelled during read');
      // Finish a real read, then deliver cancellation before the tool resumes.
      vi.mocked(fs.readFile).mockImplementationOnce(async () => {
        const bytes = await actual.readFile(file);
        controller.abort(reason);
        return bytes;
      });
      const ctx = makeCtx(source === 'context' ? controller.signal : new AbortController().signal);
      const failure = await replaceTool
        // @ts-expect-error Exercise the implementation's legacy ctx.signal fallback without opts.
        .execute(input, ctx, source === 'opts' ? { signal: controller.signal } : undefined)
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect(controller.signal.aborted).toBe(true);
      expect(await actual.readFile(file, 'utf8')).toBe('TARGET');
      expect(failure).toBe(reason);
    },
  );

  it('commits the replacement when the signal remains active', async () => {
    const file = path.join(tmpDir, input.files);
    await fs.writeFile(file, 'TARGET');
    const signal = new AbortController().signal;
    const result = await replaceTool.execute(input, makeCtx(signal), { signal });
    expect(result.files_modified).toBe(1);
    expect(await fs.readFile(file, 'utf8')).toBe('DONE');
  });

  it('leaves the file unchanged when cancellation predates the call', async () => {
    const file = path.join(tmpDir, input.files);
    await fs.writeFile(file, 'TARGET');
    const controller = new AbortController();
    const reason = new Error('already cancelled');
    controller.abort(reason);
    await expect(
      replaceTool.execute(input, makeCtx(controller.signal), { signal: controller.signal }),
    ).rejects.toBe(reason);
    expect(await fs.readFile(file, 'utf8')).toBe('TARGET');
  });
});
