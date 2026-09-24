import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { handleGitDiff } from '../src/server/git-handlers.js';
import { handleFilesImage } from '../src/server/project-image.js';

/** The per-side cap in project-image.ts. */
const MAX_PREVIEW_IMAGE_BYTES = 4 * 1024 * 1024;

const PNG = (tag: string) =>
  Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from(`fake-png-${tag}`)]);

let root: string;

beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'project-image-')));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

function socket() {
  const sent: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const ws = {
    readyState: 1,
    bufferedAmount: 0,
    send: (data: string) => sent.push(JSON.parse(data)),
  } as unknown as WebSocket;
  return { ws, sent };
}

function git(...args: string[]) {
  execFileSync('git', args, { cwd: root, stdio: 'ignore', windowsHide: true });
}

describe('the media type', () => {
  it('comes from the bytes, whatever the name says; SVG and text are refused', async () => {
    const cases: Array<[string, Buffer, string | undefined]> = [
      ['a.png', PNG('a'), 'image/png'],
      ['b.jpg', Buffer.from('ffd8ffe000104a464946', 'hex'), 'image/jpeg'],
      ['c.gif', Buffer.from('GIF89a....'), 'image/gif'],
      ['named.png', Buffer.from('RIFF\0\0\0\0WEBPVP8 '), 'image/webp'],
      ['d.png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), undefined],
      ['e.png', Buffer.from('hello'), undefined],
    ];
    const { ws, sent } = socket();
    for (const [name, bytes, type] of cases) {
      await fs.writeFile(path.join(root, name), bytes);
      await handleFilesImage(ws, { payload: { filePath: name } }, root);
      const reply = sent.at(-1)?.payload ?? {};
      if (type) expect(String(reply.dataUrl)).toMatch(new RegExp(`^data:${type};base64,`));
      else expect(reply).toMatchObject({ notImage: true });
    }
  });
});

describe('files.image', () => {
  it('answers a project image as a data URL', async () => {
    await fs.mkdir(path.join(root, 'art'));
    await fs.writeFile(path.join(root, 'art', 'logo.png'), PNG('logo'));
    const { ws, sent } = socket();
    await handleFilesImage(
      ws,
      { type: 'files.image', payload: { filePath: 'art/logo.png' } },
      root,
    );
    expect(sent[0]?.type).toBe('files.image');
    expect(sent[0]?.payload).toMatchObject({ filePath: 'art/logo.png', bytes: PNG('logo').length });
    expect(String(sent[0]?.payload.dataUrl)).toMatch(/^data:image\/png;base64,/);
  });

  it('refuses a path outside the project, a non-image and an oversized file', async () => {
    const { ws, sent } = socket();
    await handleFilesImage(ws, { payload: { filePath: '../outside.png' } }, root);
    expect(sent.at(-1)?.payload).toMatchObject({ error: 'Forbidden' });

    await fs.writeFile(path.join(root, 'fake.png'), '<svg onload="alert(1)"/>');
    await handleFilesImage(ws, { payload: { filePath: 'fake.png' } }, root);
    expect(sent.at(-1)?.payload).toMatchObject({ notImage: true });
    expect(sent.at(-1)?.payload).not.toHaveProperty('dataUrl');

    await fs.writeFile(path.join(root, 'huge.png'), Buffer.alloc(MAX_PREVIEW_IMAGE_BYTES + 1));
    await handleFilesImage(ws, { payload: { filePath: 'huge.png' } }, root);
    expect(sent.at(-1)?.payload).toMatchObject({ tooLarge: true });
  });
});

describe('git.diff of an image', () => {
  beforeEach(async () => {
    git('init', '-q');
    await fs.writeFile(path.join(root, 'kept.png'), PNG('v1'));
    await fs.writeFile(path.join(root, 'gone.png'), PNG('gone'));
    git('add', '-A');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init');
  });

  async function diff(file: string) {
    const { ws, sent } = socket();
    await handleGitDiff(ws, root, file);
    return sent[0]?.payload as {
      binary?: boolean;
      image?: { old?: string; new?: string; oldBytes?: number; newBytes?: number };
    };
  }

  it('sends both versions of a changed image', async () => {
    await fs.writeFile(path.join(root, 'kept.png'), PNG('v2-longer'));
    const payload = await diff('kept.png');
    expect(payload.binary).toBe(true);
    expect(payload.image?.old).toBe(`data:image/png;base64,${PNG('v1').toString('base64')}`);
    expect(payload.image?.new).toBe(`data:image/png;base64,${PNG('v2-longer').toString('base64')}`);
    expect(payload.image).toMatchObject({
      oldBytes: PNG('v1').length,
      newBytes: PNG('v2-longer').length,
    });
  });

  it('sends one side for an added or a deleted image', async () => {
    await fs.writeFile(path.join(root, 'new.png'), PNG('new'));
    expect((await diff('new.png')).image).toEqual({
      new: `data:image/png;base64,${PNG('new').toString('base64')}`,
      newBytes: PNG('new').length,
    });
    await fs.rm(path.join(root, 'gone.png'));
    const gone = (await diff('gone.png')).image;
    expect(gone?.old).toBeDefined();
    expect(gone).not.toHaveProperty('new');
  });

  it('keeps the plain binary notice for a .png that is not one', async () => {
    await fs.writeFile(path.join(root, 'kept.png'), Buffer.from([0, 1, 2, 3]));
    await fs.writeFile(path.join(root, 'odd.png'), Buffer.from([0, 1, 2]));
    const payload = await diff('odd.png');
    expect(payload).toMatchObject({ binary: true });
    expect(payload).not.toHaveProperty('image');
  });
});
