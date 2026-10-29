import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { handleFilesRead, handleFilesWrite } from '../src/server/file-handlers';

type Reply = { type: string; payload: Record<string, unknown> };
function socket() {
  const sent: Reply[] = [];
  const ws = { readyState: 1, OPEN: 1, send: (raw: string) => sent.push(JSON.parse(raw)) };
  return { ws: ws as unknown as WebSocket, sent };
}
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function project() {
  const root = await mkdtemp(join(tmpdir(), 'wrongstack-conditional-write-'));
  roots.push(root);
  return root;
}
async function write(root: string, payload: Record<string, unknown>) {
  const { ws, sent } = socket();
  await handleFilesWrite(ws, { type: 'files.write', payload }, root, { onWritten: () => {} });
  return sent[0]!.payload;
}

describe('conditional files.write', () => {
  it('reports the hash of the raw bytes it read, including a byte-order mark', async () => {
    const root = await project();
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('text\r\n')]);
    await writeFile(join(root, 'bom.txt'), bytes);
    const { ws, sent } = socket();
    await handleFilesRead(ws, { type: 'files.read', payload: { filePath: 'bom.txt' } }, root);
    expect(sent[0]!.payload['sha256']).toBe(hash(bytes));
  });

  it('writes when the disk still matches and refuses a stale expectation without writing', async () => {
    const root = await project();
    const file = join(root, 'a.txt');
    await writeFile(file, 'base');
    const written = await write(root, {
      filePath: 'a.txt',
      content: 'mine',
      expectedSha256: hash('base'),
    });
    expect(written).toMatchObject({ success: true, sha256: hash('mine') });
    await writeFile(file, 'external');
    const refused = await write(root, {
      filePath: 'a.txt',
      content: 'stale',
      expectedSha256: hash('mine'),
    });
    expect(refused).toMatchObject({
      success: false,
      conflict: true,
      currentSha256: hash('external'),
    });
    expect(String(refused['error'])).toMatch(/^FILE_CONFLICT/);
    expect(await readFile(file, 'utf8')).toBe('external');
  });

  it('reports a removed file as a conflict instead of recreating it', async () => {
    const root = await project();
    const file = join(root, 'gone.txt');
    await writeFile(file, 'base');
    await unlink(file);
    const refused = await write(root, {
      filePath: 'gone.txt',
      content: 'mine',
      expectedSha256: hash('base'),
    });
    expect(refused).toMatchObject({ success: false, conflict: true, currentSha256: null });
    await expect(readFile(file, 'utf8')).rejects.toThrow();
  });

  it('lets exactly one of two saves bound to the same version through', async () => {
    const root = await project();
    const file = join(root, 'race.txt');
    await writeFile(file, 'base');
    const expectedSha256 = hash('base');
    const results = await Promise.all(
      ['first', 'second', 'third'].map((content) =>
        write(root, { filePath: 'race.txt', content, expectedSha256 }),
      ),
    );
    const winners = results.filter((result) => result['success'] === true);
    expect(winners).toHaveLength(1);
    expect(results.filter((result) => result['conflict'] === true)).toHaveLength(2);
    expect(hash(await readFile(file))).toBe(winners[0]!['sha256']);
  });

  it('keeps unconditional writes and rejects malformed expectations', async () => {
    const root = await project();
    await writeFile(join(root, 'plain.txt'), 'base');
    expect(await write(root, { filePath: 'plain.txt', content: 'over' })).toMatchObject({
      success: true,
    });
    for (const payload of [
      { filePath: 'plain.txt', content: 'x', expectedSha256: 'ABC' },
      { filePath: 'plain.txt', content: 'x', expectedSha256: 7 },
      { filePath: 'plain.txt', content: 42 },
    ])
      expect(await write(root, payload)).toMatchObject({
        success: false,
        error: 'Malformed request',
      });
    expect(await readFile(join(root, 'plain.txt'), 'utf8')).toBe('over');
  });
});
