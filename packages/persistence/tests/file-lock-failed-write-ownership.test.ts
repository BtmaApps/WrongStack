import { vi } from 'vitest';

const fake = vi.hoisted(() => ({
  open: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
  unlink: vi.fn(),
}));
vi.mock('node:fs/promises', () => fake);

import { createPersistencePrimitives } from '../src/atomic-write.js';

async function exercise(replace: boolean, probeFailure = false, failedWrite = true) {
  for (const fn of Object.values(fake)) fn.mockReset();
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((r) => {
    enter = r;
  });
  const barrier = new Promise<void>((r) => {
    release = r;
  });
  const ours = { ino: 1, dev: 2, birthtimeMs: 3 };
  const foreign = { ino: 9, dev: 2, birthtimeMs: 4 };
  let identity = ours;
  let contents = '';
  const failure = Object.assign(new Error('injected write failure'), { code: 'EIO' });
  const handle = {
    writeFile: vi.fn(async (text: string) => {
      contents = text;
      enter();
      await barrier;
      if (failedWrite) throw failure;
    }),
    stat: vi.fn(async () => {
      if (probeFailure) throw new Error('unknown identity');
      return ours;
    }),
    close: vi.fn(async () => {}),
    utimes: vi.fn(async () => {}),
  };
  fake.open.mockResolvedValue(handle);
  fake.stat.mockImplementation(async () => identity);
  fake.readFile.mockImplementation(async () => contents);
  fake.unlink.mockImplementation(async () => {
    contents = '';
  });
  const critical = vi.fn(async () => 'control');
  const pending = createPersistencePrimitives().withFileLock('/fixture/value', critical);
  const settled = pending.then(
    (value) => ({ value, error: undefined }),
    (error) => ({ value: undefined, error }),
  );
  await entered;
  if (replace) {
    identity = foreign;
    contents = 'foreign-owner-token';
  }
  release();
  const result = await settled;
  return {
    contents,
    unlinks: fake.unlink.mock.calls.length,
    closes: handle.close.mock.calls.length,
    criticalCalls: critical.mock.calls.length,
    ...result,
    failure,
  };
}

import { expect, it } from 'vitest';

it('verifies acquisition cleanup respects identity and unknown probes', async () => {
  const replaced = await exercise(true);
  expect(replaced.contents).toBe('foreign-owner-token');
  expect(replaced.unlinks).toBe(0);
  expect(replaced.closes).toBe(1);
  expect(replaced.error).toBe(replaced.failure);
  expect(replaced.criticalCalls).toBe(0);
  const owned = await exercise(false);
  expect(owned.unlinks).toBe(1);
  expect(owned.error).toBe(owned.failure);
  const unknown = await exercise(true, true);
  expect(unknown.contents).toBe('foreign-owner-token');
  expect(unknown.unlinks).toBe(0);
  expect(unknown.closes).toBe(1);
  expect(unknown.error).toBe(unknown.failure);
  const control = await exercise(false, false, false);
  expect(control.value).toBe('control');
  expect(control.unlinks).toBe(1);
});
