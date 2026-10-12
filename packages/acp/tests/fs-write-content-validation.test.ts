import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { handleAcpFsRequest } from '../src/client/acp-session-callbacks.js';
import { FileServer } from '../src/client/file-server.js';
import type { ACPMessage } from '../src/types/acp-messages.js';

// fs/write_text_file used to pass `content ?? ''` to the file server, so a
// request with the content missing or null truncated the target once the
// write was authorized (the default policy auto-allows).

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function write(dir: string, params: Record<string, unknown>) {
  const policy = vi.fn(async () => ({
    outcome: 'selected' as const,
    optionId: 'allow_once',
  }));
  const reply: { result?: unknown; error?: string } = {};
  await handleAcpFsRequest(
    { id: 1, method: 'fs/write_text_file', params } as unknown as ACPMessage,
    new FileServer({ projectRoot: dir }),
    policy as never,
    {
      sendResult: async (_, value) => {
        reply.result = value;
      },
      sendErrorResponse: async (_, code, message) => {
        reply.error = `${code} ${message}`;
      },
    },
  );
  return { reply, policy };
}

it.each([
  ['missing', {}],
  ['null', { content: null }],
])('rejects a write whose content is %s and leaves the file untouched', async (_, extra) => {
  const dir = await mkdtemp(join(tmpdir(), 'acp-fs-write-'));
  dirs.push(dir);
  const path = join(dir, 'file.txt');
  await writeFile(path, 'keep me\n');

  const { reply, policy } = await write(dir, { sessionId: 's', path, ...extra });

  expect(reply.error).toBe('-32602 content must be a string');
  expect(policy).not.toHaveBeenCalled();
  expect(await readFile(path, 'utf8')).toBe('keep me\n');
});

it('still writes an explicit empty string', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'acp-fs-write-'));
  dirs.push(dir);
  const path = join(dir, 'file.txt');
  await writeFile(path, 'keep me\n');

  const { reply } = await write(dir, { sessionId: 's', path, content: '' });

  expect(reply.error).toBeUndefined();
  expect(await readFile(path, 'utf8')).toBe('');
});
