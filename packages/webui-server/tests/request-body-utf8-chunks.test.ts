/**
 * The JSON body readers appended each request chunk as a string
 * (`data += chunk` / `chunk.toString('utf8')`), decoding every chunk alone. A
 * body whose bytes arrive split inside a multibyte character — TCP delivers
 * wherever it likes — was parsed with U+FFFD in its place: a Fleet HQ message
 * reached the agent altered, an intake was stored altered. Real http server,
 * real handlers; the client writes the body in two pieces cut inside `ş`.
 */
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(async () => ({ id: 'm1' })),
}));
vi.mock('@wrongstack/core/storage', () => ({
  getSessionRegistry: () => ({
    get: async () => ({ projectRoot: '/project', status: 'running' }),
  }),
}));
vi.mock('@wrongstack/core/coordination', () => ({
  getSharedProjectMailbox: () => ({ send: mockSend }),
  mailboxSessionTag: (id: string) => id,
}));
vi.mock('@wrongstack/core/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wrongstack/core/utils')>()),
  resolveWstackPaths: () => ({ projectDir: '/project-dir' }),
}));

import { handleApiSessionMessage } from '../src/server/http-server/api-handlers.js';
import { handleRequirementIntakeCreate } from '../src/server/requirement-intake-handlers.js';

let server: http.Server | undefined;
afterEach(() => {
  server?.close();
  server = undefined;
  mockSend.mockClear();
});

/** POST `payload` as JSON, split inside its first `ş`, and wait for the reply. */
async function postSplit(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  payload: unknown,
): Promise<number> {
  server = http.createServer((req, res) => handler(req, res));
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  const body = Buffer.from(JSON.stringify(payload));
  const cut = body.indexOf(0xc5) + 1;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': body.length },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    req.on('error', reject);
    req.write(body.subarray(0, cut));
    // The first piece reaches the server as its own 'data' event.
    setTimeout(() => req.end(body.subarray(cut)), 30);
  });
}

describe('JSON request bodies split inside a multibyte character', () => {
  it('delivers the Fleet HQ message text intact', async () => {
    const status = await postSplit(
      (req, res) => void handleApiSessionMessage(res, req, '/global', 'sess-1'),
      { text: 'şemayı güncelle' },
    );
    expect(status).toBe(200);
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ body: 'şemayı güncelle' }));
  });

  it('stores the requirement intake intact', async () => {
    let captured: unknown;
    const service = {
      createIntake: async (body: unknown) => {
        captured = body;
        return { idempotent: false };
      },
    } as never;
    const status = await postSplit(
      (req, res) => void handleRequirementIntakeCreate(res, req, service, 'project'),
      { title: 'Kullanıcı şifre sıfırlama' },
    );
    expect(status).toBe(201);
    expect(captured).toEqual({ title: 'Kullanıcı şifre sıfırlama' });
  });
});
