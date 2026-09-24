import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  randomBytes: vi.fn(),
}));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomBytes: mocks.randomBytes };
});

import { createPersistencePrimitives } from '../src/atomic-write.js';

const tempSuffix = 'aaaaaaaaaaaaaaaaaaaa';
let fixtureRoot: string;

function collisionTempPath(target: string): string {
  return join(fixtureRoot, `.${target}.${tempSuffix}.tmp`);
}

beforeEach(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), 'atomic-temp-ownership-'));
  mocks.randomBytes.mockReturnValue(Buffer.from(tempSuffix, 'hex'));
});

afterEach(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
  mocks.randomBytes.mockReset();
});

describe('atomic temp ownership', () => {
  it('writes normally when the random temp name is unoccupied', async () => {
    const primitives = createPersistencePrimitives();
    const target = join(fixtureRoot, 'control.txt');

    await primitives.atomicWrite(target, 'ours');

    await expect(readFile(target, 'utf8')).resolves.toBe('ours');
  });

  it.each(['buffered', 'streamed'] as const)(
    'preserves a foreign %s temp file when exclusive creation collides',
    async (kind) => {
      const primitives = createPersistencePrimitives();
      const target = join(fixtureRoot, `${kind}.txt`);
      const foreignTemp = collisionTempPath(`${kind}.txt`);
      await writeFile(foreignTemp, 'foreign', 'utf8');

      if (kind === 'buffered') {
        await expect(primitives.atomicWrite(target, 'ours')).rejects.toMatchObject({
          code: 'EEXIST',
        });
      } else {
        await expect(
          primitives.atomicReplaceWithWriter(target, async (handle) => {
            await handle.writeFile('ours');
          }),
        ).rejects.toMatchObject({ code: 'EEXIST' });
      }

      await expect(readFile(foreignTemp, 'utf8')).resolves.toBe('foreign');
    },
  );
});
