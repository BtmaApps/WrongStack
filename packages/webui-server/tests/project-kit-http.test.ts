import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { projectKitTool } from '@wrongstack/tools';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('@wrongstack/core/storage', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  getSessionRegistry: () => ({ get: getSession }),
}));

import { handleApiRoutes } from '../src/server/http-server/api-router.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'kit-http-'));
  getSession.mockReset();
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function request(query = '', method = 'GET', authorized = true) {
  let status = 0;
  let body: Record<string, unknown> = {};
  const res = {
    writeHead: (code: number) => {
      status = code;
    },
    end: (text: string) => {
      body = JSON.parse(text);
    },
  } as unknown as ServerResponse;
  const handled = await handleApiRoutes(
    { method } as IncomingMessage,
    res,
    new URL(`http://localhost/api/project-kit${query}`),
    { projectRoot: root, globalRoot: '/global' },
    true,
    authorized,
    vi.fn(),
  );
  return { status, body, handled };
}

async function seed() {
  const template = (await projectKitTool.execute(
    { action: 'template', name: 'strings.unique' },
    { projectRoot: root } as never,
    { signal: new AbortController().signal },
  )) as { files: Record<string, string> };
  for (const [file, text] of Object.entries(template.files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), text);
  }
  await writeFile(
    path.join(root, '.wrongstack/project-kit/strings.unique/main.mjs'),
    'throw new Error("discovery must not execute me");',
  );
}

describe('Project Kit HTTP browser', () => {
  it('lists and inspects through the real read-only service without importing kit code', async () => {
    await seed();
    const list = await request();
    expect(list).toMatchObject({
      status: 200,
      handled: true,
      body: { projectRoot: root, tools: [{ name: 'strings.unique' }], invalid: [] },
    });
    expect(await request('?name=strings.unique')).toMatchObject({
      status: 200,
      body: {
        kit: { verified: false, history: [], entry: 'main.mjs', files: ['kit.json', 'main.mjs'] },
      },
    });
  });
  it('uses the selected session project, and never falls back for an unknown session', async () => {
    await seed();
    const other = path.join(root, 'other-project');
    await mkdir(other);
    getSession.mockResolvedValueOnce({ projectRoot: other }).mockResolvedValueOnce(undefined);
    expect(await request('?sessionId=other')).toMatchObject({
      status: 200,
      body: { projectRoot: other, tools: [] },
    });
    expect(await request('?sessionId=missing')).toMatchObject({ status: 404 });
    expect(getSession).toHaveBeenCalledWith('other');
  });
  it('rejects unauthenticated access, mutations and path traversal', async () => {
    expect(await request('', 'GET', false)).toMatchObject({ status: 401 });
    expect(await request('', 'POST')).toMatchObject({ status: 405 });
    expect(await request('?name=..%2Foutside')).toMatchObject({ status: 400 });
    expect(await request('?sessionId=..%2Foutside')).toMatchObject({ status: 400 });
    expect(getSession).not.toHaveBeenCalled();
  });
  it('returns an empty catalog and distinguishes broken manifests', async () => {
    expect(await request()).toMatchObject({ status: 200, body: { tools: [], invalid: [] } });
    await mkdir(path.join(root, '.wrongstack/project-kit/broken'), { recursive: true });
    expect(await request()).toMatchObject({
      status: 200,
      body: { tools: [], invalid: [{ name: 'broken' }] },
    });
    expect(await request('?name=missing')).toMatchObject({ status: 404 });
  });
});
