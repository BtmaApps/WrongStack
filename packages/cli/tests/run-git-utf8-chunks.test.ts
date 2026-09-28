/**
 * `runGit` (behind /git and the TUI resource menus) collected stdout with
 * `+= chunk`, decoding each Buffer alone: a multibyte UTF-8 character split at
 * a pipe-chunk boundary came back as U+FFFD U+FFFD. The fake child splits
 * inside `ş` deterministically; real pipes split wherever they like.
 */
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

const { mockSpawn } = vi.hoisted(() => ({ mockSpawn: vi.fn() }));
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: mockSpawn,
}));

import { runGit } from '../src/services/run-git.js';

describe('runGit output decoding', () => {
  it('keeps a multibyte character split across stdout and stderr chunks', async () => {
    const out = Buffer.from('+yeni şey\n');
    const err = Buffer.from('uyarı: şema\n');
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    mockSpawn.mockReturnValue(child);
    setImmediate(() => {
      let open = 2;
      const done = () => {
        if (--open === 0) child.emit('close', 0);
      };
      child.stdout.on('end', done);
      child.stderr.on('end', done);
      for (const [stream, bytes] of [
        [child.stdout, out],
        [child.stderr, err],
      ] as const) {
        const cut = bytes.indexOf(0xc5) + 1; // between the two bytes of `ş`
        stream.write(bytes.subarray(0, cut));
        stream.write(bytes.subarray(cut));
        stream.end();
      }
    });

    await expect(runGit(['diff'], '/repo')).resolves.toEqual({
      stdout: '+yeni şey\n',
      stderr: 'uyarı: şema\n',
      code: 0,
    });
  });
});
