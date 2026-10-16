/**
 * Fault injection for `RequirementIntakeStore` idempotency recovery: the
 * readdir/readFile error branches (missing record directory, unreadable
 * idempotency or record files) that real filesystem fixtures cannot reach
 * deterministically. Everything is a passthrough unless a test injects one
 * targeted failure.
 *
 * vi.mock factories are hoisted above top-level statements, so the real
 * implementations are captured from the installed wrapper mocks instead of
 * being assigned inside the factory.
 */
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ALICE, makeHarness } from './helpers.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: vi.fn(actual.readFile),
    readdir: vi.fn(actual.readdir),
    rename: vi.fn(actual.rename),
  };
});

const realReadFile = vi
  .mocked(fsp.readFile)
  .getMockImplementation() as unknown as typeof fsp.readFile;
const realReaddir = vi
  .mocked(fsp.readdir)
  .getMockImplementation() as unknown as typeof fsp.readdir;
const realRename = vi
  .mocked(fsp.rename)
  .getMockImplementation() as unknown as typeof fsp.rename;

function errnoError(code: string): Error {
  return Object.assign(new Error(`injected ${code}`), { code });
}

/** Harness with the store directory pre-created for direct fixture writes. */
async function makeFixtureHarness() {
  const harness = makeHarness();
  await fsp.mkdir(harness.dir, { recursive: true });
  return harness;
}

beforeEach(() => {
  vi.mocked(fsp.readFile).mockImplementation(realReadFile);
  vi.mocked(fsp.readdir).mockImplementation(realReaddir);
  vi.mocked(fsp.rename).mockImplementation(realRename);
});

describe('store idempotency recovery fault branches', () => {
  it('returns an empty recovery when the record directory is gone', async () => {
    const harness = await makeFixtureHarness();
    await fsp.writeFile(path.join(harness.dir, '_idempotency.json'), 'not-json', 'utf8');

    vi.mocked(fsp.readdir).mockRejectedValueOnce(errnoError('ENOENT'));

    await expect(harness.store.findByIdempotencyKey('k')).resolves.toBeNull();
  });

  it('rethrows non-ENOENT directory failures from recovery', async () => {
    const harness = await makeFixtureHarness();
    await fsp.writeFile(path.join(harness.dir, '_idempotency.json'), 'not-json', 'utf8');

    vi.mocked(fsp.readdir).mockRejectedValueOnce(errnoError('EACCES'));

    await expect(harness.store.findByIdempotencyKey('k')).rejects.toMatchObject({
      code: 'EACCES',
    });
  });

  it('skips a record file that vanishes mid-recovery', async () => {
    const harness = await makeFixtureHarness();
    await fsp.writeFile(
      path.join(harness.dir, 'reqi_vanishing.json'),
      JSON.stringify({ id: 'reqi_vanishing', idempotencyKey: 'kv', createdAt: 1 }),
      'utf8',
    );
    await fsp.writeFile(path.join(harness.dir, '_idempotency.json'), 'not-json', 'utf8');

    vi.mocked(fsp.readFile).mockImplementation(async (file) => {
      if (String(file).endsWith('reqi_vanishing.json')) throw errnoError('ENOENT');
      return realReadFile(file);
    });

    await expect(harness.store.findByIdempotencyKey('kv')).resolves.toBeNull();
  });

  it('rethrows non-ENOENT record-file failures from recovery', async () => {
    const harness = await makeFixtureHarness();
    await fsp.writeFile(
      path.join(harness.dir, 'reqi_locked.json'),
      JSON.stringify({ id: 'reqi_locked', idempotencyKey: 'kl', createdAt: 1 }),
      'utf8',
    );
    await fsp.writeFile(path.join(harness.dir, '_idempotency.json'), 'not-json', 'utf8');

    vi.mocked(fsp.readFile).mockImplementation(async (file) => {
      if (String(file).endsWith('reqi_locked.json')) throw errnoError('EACCES');
      return realReadFile(file);
    });

    await expect(harness.store.findByIdempotencyKey('kl')).rejects.toMatchObject({
      code: 'EACCES',
    });
  });

  it('rethrows unreadable idempotency files before recovery', async () => {
    const harness = await makeFixtureHarness();

    vi.mocked(fsp.readFile).mockImplementation(async (file) => {
      if (String(file).endsWith('_idempotency.json')) throw errnoError('EACCES');
      return realReadFile(file);
    });

    await expect(harness.store.findByIdempotencyKey('k')).rejects.toMatchObject({
      code: 'EACCES',
    });
  });

  it('rethrows non-recoverable index read failures from listIndex', async () => {
    const harness = await makeFixtureHarness();
    await fsp.mkdir(path.join(harness.dir, '_index.json'), { recursive: true });

    await expect(harness.store.listIndex()).rejects.toMatchObject({ code: 'EISDIR' });
  });

  it('rethrows non-ENOENT directory failures from the index recovery scan', async () => {
    const harness = await makeFixtureHarness();

    vi.mocked(fsp.readdir).mockRejectedValueOnce(errnoError('EACCES'));

    await expect(harness.store.listIndex()).rejects.toMatchObject({ code: 'EACCES' });
  });

  it('rethrows index commit failures and leaves recovery to the next read', async () => {
    const harness = await makeFixtureHarness();
    const created = await harness.service.createIntake(
      { projectId: ALICE.projectId, originalRequest: 'Add SSO.', requestedBy: ALICE.id },
      ALICE,
    );

    vi.mocked(fsp.rename).mockImplementation(async (from, to) => {
      if (String(to).endsWith('_index.json')) throw errnoError('EINVAL');
      return realRename(from, to);
    });

    await expect(
      harness.store.update(created.record.id, { actorId: ALICE.id }, () => undefined),
    ).rejects.toMatchObject({ code: 'EINVAL' });

    vi.mocked(fsp.rename).mockImplementation(realRename);
    await expect(harness.store.listIndex()).resolves.toHaveLength(1);
  });

  it('rethrows non-SyntaxError parse failures from the idempotency file', async () => {
    const harness = await makeFixtureHarness();
    await fsp.writeFile(path.join(harness.dir, '_idempotency.json'), '{}', 'utf8');

    const parseSpy = vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
      throw new Error('injected parse failure');
    });
    try {
      await expect(harness.store.findByIdempotencyKey('k')).rejects.toThrow(
        'injected parse failure',
      );
    } finally {
      parseSpy.mockRestore();
    }
  });
});
