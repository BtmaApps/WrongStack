import { describe, expect, it, vi } from 'vitest';

const fsMocks = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, open: fsMocks.open };
});

import { fingerprints } from '../src/workflow-runtime/index.js';

function fileHandle(size: number, bytesToRead: number) {
  let remaining = bytesToRead;
  return {
    stat: vi.fn(async () => ({ isFile: () => true, size })),
    read: vi.fn(async (buffer: Buffer, offset: number, length: number) => {
      if (remaining === 0) return { bytesRead: 0, buffer };
      const bytesRead = Math.min(length, remaining);
      buffer.fill(0x61, offset, offset + bytesRead);
      remaining -= bytesRead;
      return { bytesRead, buffer };
    }),
    close: vi.fn(async () => undefined),
  };
}

describe('workflow evidence fingerprint stability', () => {
  it('rejects a file that shrinks after stat but before the read completes', async () => {
    fsMocks.open.mockResolvedValue(fileHandle(5, 3));

    await expect(fingerprints(process.cwd(), ['evidence.txt'])).rejects.toThrow(
      /file changed during read/i,
    );
  });

  it('accepts an unchanged file', async () => {
    fsMocks.open.mockResolvedValue(fileHandle(3, 3));

    await expect(fingerprints(process.cwd(), ['evidence.txt'])).resolves.toEqual({
      'evidence.txt': expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });
});
