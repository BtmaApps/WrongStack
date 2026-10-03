import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { handleFilesRead } from '../src/server/file-handlers.js';
import { handleFilesImage } from '../src/server/project-image.js';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (
      path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) ||
      !path.basename(root).startsWith('wrongstack-artifact-correlation-')
    )
      throw new Error('Unknown fixture path');
    await rm(root, { recursive: true, force: true });
  }
});
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wrongstack-artifact-correlation-'));
  roots.push(root);
  const send = vi.fn();
  const ws = { readyState: 1, send } as unknown as WebSocket;
  const reply = () => JSON.parse(String(send.mock.calls.at(-1)?.[0])).payload;
  return { root, ws, reply };
}
describe('artifact read correlation on real file handlers', () => {
  it('echoes request/session identity for successful text and raster image reads', async () => {
    const { root, ws, reply } = await fixture();
    await writeFile(path.join(root, 'report.md'), 'report');
    await handleFilesRead(
      ws,
      {
        type: 'files.read',
        payload: { filePath: 'report.md', sessionId: 's', requestId: 'rich:report' },
      },
      root,
    );
    expect(reply()).toMatchObject({
      filePath: 'report.md',
      content: 'report',
      sessionId: 's',
      requestId: 'rich:report',
    });
    await writeFile(path.join(root, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await handleFilesImage(
      ws,
      {
        type: 'files.image',
        payload: { filePath: 'image.png', sessionId: 's', requestId: 'rich:image' },
      },
      root,
    );
    expect(reply()).toMatchObject({
      sessionId: 's',
      requestId: 'rich:image',
      dataUrl: expect.stringContaining('data:image/png;base64,'),
    });
  });
  it('correlates refusals too, and does not echo oversized identifiers', async () => {
    const { root, ws, reply } = await fixture();
    for (const filePath of ['../outside.md', 'missing.md']) {
      await handleFilesRead(
        ws,
        { type: 'files.read', payload: { filePath, sessionId: 's', requestId: 'rich:error' } },
        root,
      );
      expect(reply()).toMatchObject({
        filePath,
        requestId: 'rich:error',
        error: expect.any(String),
      });
    }
    await writeFile(path.join(root, 'binary'), Buffer.from([0]));
    await handleFilesRead(
      ws,
      {
        type: 'files.read',
        payload: { filePath: 'binary', sessionId: 's', requestId: 'rich:binary' },
      },
      root,
    );
    expect(reply()).toMatchObject({ binary: true, requestId: 'rich:binary' });
    await handleFilesRead(
      ws,
      { type: 'files.read', payload: { filePath: 'binary', requestId: 'x'.repeat(129) } },
      root,
    );
    expect(reply().requestId).toBeUndefined();
  });
});
