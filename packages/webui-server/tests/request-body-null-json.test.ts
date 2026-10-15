/**
 * The JSON body reader resolves the "error response already sent" sentinel
 * (null) through its success path whenever the body is the literal JSON
 * `null` — every handler then reads "response already sent", writes nothing,
 * and the connection hangs. `JSON.stringify(null)` on a client produces
 * exactly this body. Real http server, real handlers; the service is mocked
 * so the tests also prove a rejected body never reaches the domain layer.
 */
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

import { handleRequirementIntakeCreate } from '../src/server/requirement-intake-handlers.js';

const RESPONSE_TIMEOUT_MS = 1_500;

let createIntakeCalls = 0;

const mockService = {
  createIntake: async (body: unknown) => {
    createIntakeCalls += 1;
    return {
      record: { id: 'int_test', title: (body as { title?: string }).title ?? 'untitled' },
      created: true,
      idempotent: false,
    };
  },
} as never;

/** POST a raw JSON body and wait — bounded, so a hung handler fails fast. */
function post(payload: string): Promise<{ status: number; code?: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      void handleRequirementIntakeCreate(res, req, mockService, 'proj_body');
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error(`no response within ${RESPONSE_TIMEOUT_MS}ms — connection hung`));
    }, RESPONSE_TIMEOUT_MS);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          method: 'POST',
          path: '/api/projects/proj_body/requirement-intakes',
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(payload),
          },
        },
        (res) => {
          let bodyText = '';
          res.on('data', (chunk: Buffer) => {
            bodyText += chunk.toString('utf8');
          });
          res.on('end', () => {
            clearTimeout(timer);
            server.close();
            let code: string | undefined;
            try {
              code = (JSON.parse(bodyText) as { error?: { code?: string } }).error?.code;
            } catch {
              // 201 replies are JSON objects without an error envelope
            }
            resolve({ status: res.statusCode ?? 0, code });
          });
        },
      );
      req.on('error', (error) => {
        clearTimeout(timer);
        server.close();
        reject(error);
      });
      req.end(payload);
    });
  });
}

afterEach(() => {
  createIntakeCalls = 0;
});

describe('JSON request bodies that parse to a non-object', () => {
  it('answers a literal null body with 400 and never reaches the service', async () => {
    const result = await post('null');
    expect(result.status).toBe(400);
    expect(result.code).toBe('INVALID_BODY');
    expect(createIntakeCalls).toBe(0);
  });

  it('answers a primitive body (42) with 400', async () => {
    const result = await post('42');
    expect(result.status).toBe(400);
    expect(result.code).toBe('INVALID_BODY');
    expect(createIntakeCalls).toBe(0);
  });

  it('still creates a record for a valid JSON object body', async () => {
    const result = await post(JSON.stringify({ title: 'valid request' }));
    expect(result.status).toBe(201);
    expect(createIntakeCalls).toBe(1);
  });

  it('still treats an empty body as an empty object', async () => {
    const result = await post('');
    expect(result.status).toBe(201);
    expect(createIntakeCalls).toBe(1);
  });

  it('still rejects syntactically invalid JSON with 400', async () => {
    const result = await post('{');
    expect(result.status).toBe(400);
    expect(result.code).toBe('INVALID_BODY');
    expect(createIntakeCalls).toBe(0);
  });
});
