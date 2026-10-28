import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMemoryPort } from '@wrongstack/sage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleMemoryRoute } from '../src/server/memory-routes.js';

let root: string, store: SqliteMemoryPort;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sage-source-review-'));
  store = new SqliteMemoryPort({ projectRoot: root });
});
afterEach(async () => {
  store.close();
  await rm(root, { recursive: true, force: true });
});
async function call(payload: Record<string, unknown>, withRoot = true) {
  const frames: Array<{ payload: Record<string, unknown> }> = [];
  const ws = { readyState: 1, send: (data: string) => frames.push(JSON.parse(data)) };
  await handleMemoryRoute(
    {
      getMemoryStore: () => store,
      ...(withRoot ? { getProjectRoot: () => root } : {}),
      send: () => {},
      sendResult: () => {},
    },
    ws as never,
    { type: 'memory.sage.get', payload },
  );
  return frames[0]!.payload;
}
describe('saved SAGE validity review through the real memory route', () => {
  it('does not follow an outside-project junction or accept a client-supplied project root', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'sage-outside-source-'));
    try {
      await writeFile(join(outside, 'source.ts'), 'outside marker');
      await symlink(
        outside,
        join(root, 'external'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      const memory = await store.rememberSage({
        kind: 'fact',
        text: 'Scoped',
        validity: {
          statement: 'Only project sources',
          checks: [{ type: 'source_contains', path: 'external/source.ts', text: 'outside marker' }],
        },
      });
      const result = await call({
        id: memory.id,
        reviewValidity: true,
        expectedRevision: memory.revision,
        projectRoot: outside,
        root: outside,
      });
      expect(result['validityReview']).toMatchObject({ checks: [{ status: 'unknown' }] });
      expect(
        (result['validityReview'] as { checks: Array<{ sourceHash?: string }> }).checks[0]
          ?.sourceHash,
      ).toBeUndefined();
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
  it('checks current literals with canonical matching, distinguishes missing/unknown and never returns source text or mutates memory', async () => {
    await writeFile(
      join(root, 'boundary.ts'),
      'header\r\nexact literal\r\nPRIVATE_SOURCE_NOT_RETURNED',
    );
    await writeFile(join(root, 'large.ts'), 'x'.repeat(65537));
    const memory = await store.rememberSage({
      kind: 'fact',
      text: 'Scoped boundary claim',
      validity: {
        statement: 'Applies while boundary exists',
        checks: [
          { type: 'source_contains', path: 'boundary.ts', text: 'header\nexact literal' },
          { type: 'source_contains', path: 'boundary.ts', text: 'missing literal' },
          { type: 'source_contains', path: 'missing.ts', text: 'unknown' },
          { type: 'source_contains', path: 'large.ts', text: 'x' },
        ],
      },
    });
    const control = await call({ id: memory.id, requestId: 'plain-get' });
    expect(control['validityReview']).toBeUndefined();
    const result = await call({
      id: memory.id,
      reviewValidity: true,
      expectedRevision: memory.revision,
      requestId: 'review',
    });
    expect(result['requestId']).toBe('review');
    expect(result['validityReview']).toMatchObject({
      observedRevision: memory.revision,
      applicability: 'unknown',
      checks: [
        { status: 'satisfied' },
        { status: 'not_satisfied' },
        { status: 'unknown' },
        { status: 'unknown' },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_SOURCE_NOT_RETURNED');
    expect(await store.getSage(memory.id)).toEqual(memory);
    await writeFile(join(root, 'boundary.ts'), 'boundary removed');
    const changed = await call({
      id: memory.id,
      reviewValidity: true,
      expectedRevision: memory.revision,
    });
    expect(
      (changed['validityReview'] as { checks: Array<{ status: string }> }).checks[0]?.status,
    ).toBe('not_satisfied');
  });
  it('refuses stale/missing revisions and unsupported hosts without fabricating source evidence', async () => {
    const memory = await store.rememberSage({
      kind: 'fact',
      text: 'Scoped',
      validity: { statement: 'Conditional' },
    });
    expect((await call({ id: memory.id, reviewValidity: true }))['error']).toContain('revision');
    expect(
      (await call({ id: memory.id, reviewValidity: true, expectedRevision: memory.revision + 1 }))[
        'error'
      ],
    ).toContain('changed');
    expect(
      (await call({ id: memory.id, reviewValidity: 'yes', expectedRevision: memory.revision }))[
        'error'
      ],
    ).toContain('boolean');
    expect(
      (
        await call(
          { id: memory.id, reviewValidity: true, expectedRevision: memory.revision },
          false,
        )
      )['error'],
    ).toContain('Project root');
    expect(
      (await call({ id: memory.id, reviewValidity: true, expectedRevision: memory.revision }))[
        'validityReview'
      ],
    ).toMatchObject({ applicability: 'unknown', checks: [] });
    const unconditional = await store.rememberSage({
      kind: 'preference',
      text: 'Unconditional preference',
    });
    expect(
      (
        await call({
          id: unconditional.id,
          reviewValidity: true,
          expectedRevision: unconditional.revision,
        })
      )['error'],
    ).toContain('no applicability');
  });
});
