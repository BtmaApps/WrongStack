/**
 * A child's 'exit' can come before its last stdout chunk. Reading the result
 * at 'exit' cut a pasted text short and wrote a truncated PNG (F852).
 */
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => ({ spawn: vi.fn() }));

vi.mock('node:child_process', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    spawn: (...args: unknown[]) => spawnMock.spawn(...args),
  };
});

import { readClipboardImage, readClipboardText } from '../src/clipboard.js';

class StreamChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = Object.assign(new EventEmitter(), { end: () => undefined });
  kill = vi.fn();
}

/** First chunk, then 'exit', then the tail: the order Node allows. */
function exitBeforeTail(head: Buffer | string, tail: Buffer | string): StreamChild {
  const child = new StreamChild();
  setImmediate(() => {
    child.stdout.write(head);
    setImmediate(() => {
      child.emit('exit', 0);
      child.stdout.end(tail);
    });
  });
  return child;
}

const realPlatform = process.platform;
function setPlatform(p: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
}

afterEach(() => {
  setPlatform(realPlatform);
  spawnMock.spawn.mockReset();
});

describe('clipboard output delivered after exit (F852)', () => {
  it('keeps the text that arrives after the exit event', async () => {
    setPlatform('win32');
    const word = Buffer.from('café', 'utf8');
    spawnMock.spawn.mockImplementation(() =>
      exitBeforeTail(
        Buffer.concat([Buffer.from('first half / '), word.subarray(0, 4)]),
        word.subarray(4),
      ),
    );
    expect(await readClipboardText()).toBe('first half / café');
  });

  it('writes the whole image, not the part read before exit', async () => {
    setPlatform('linux');
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(40, 7),
    ]);
    spawnMock.spawn.mockImplementation(() => exitBeforeTail(png.subarray(0, 16), png.subarray(16)));
    const image = await readClipboardImage();
    expect(image?.bytes).toBe(png.length);
    expect(image?.base64).toBe(png.toString('base64'));
  });
});
