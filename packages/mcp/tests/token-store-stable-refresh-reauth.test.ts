import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MCPRefreshingAuthorizationProvider,
  type MCPStoredAuthorization,
} from '../src/token-store.js';

let closeServer: (() => Promise<void>) | undefined;
let origin = '';
let calls = 0;
let acceptedRefreshTokens = new Set<string>();

beforeEach(async () => {
  calls = 0;
  acceptedRefreshTokens = new Set<string>();
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      calls++;
      const refreshToken = new URLSearchParams(body).get('refresh_token') ?? '';
      response.setHeader('content-type', 'application/json');
      if (!acceptedRefreshTokens.has(refreshToken)) {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: 'invalid_grant' }));
        return;
      }
      response.statusCode = 200;
      response.end(
        JSON.stringify({
          access_token: `fresh-${refreshToken}`,
          refresh_token: refreshToken,
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(async () => {
  await closeServer?.();
  closeServer = undefined;
});

function authorization(refreshToken: string, updatedAt: string): MCPStoredAuthorization {
  const resource = `${origin}/mcp`;
  return {
    serverName: 'fixture',
    resource,
    clientId: 'client',
    updatedAt,
    authorizationServer: {
      issuer: `${origin}/auth`,
      authorizationEndpoint: `${origin}/authorize`,
      tokenEndpoint: `${origin}/token`,
      scopesSupported: ['tools:read'],
    },
    tokenSet: {
      accessToken: `old-${refreshToken}`,
      refreshToken,
      tokenType: 'Bearer',
      resource,
      expiresAt: 0,
      scopes: ['tools:read'],
    },
  };
}

function providerFixture(initial: MCPStoredAuthorization) {
  let stored = initial;
  const provider = new MCPRefreshingAuthorizationProvider({
    serverName: initial.serverName,
    resource: initial.resource,
    store: {
      load: async () => stored,
      save: async (next: MCPStoredAuthorization) => {
        stored = next;
      },
    } as never,
  });
  return {
    get: () =>
      provider.getAccessToken({ serverName: initial.serverName, resource: initial.resource }),
    replaceAuthorization: (next: MCPStoredAuthorization) => {
      stored = next;
    },
  };
}

describe('MCP refresh rejection lifecycle', () => {
  it('retries a stable refresh token after a newer authorization replaces the rejected grant', async () => {
    const auth = providerFixture(authorization('stable-token', '2026-10-17T00:00:00.000Z'));
    await expect(auth.get()).resolves.toBeUndefined();
    expect(calls).toBe(1);

    auth.replaceAuthorization(authorization('stable-token', '2026-10-17T00:01:00.000Z'));
    acceptedRefreshTokens.add('stable-token');

    await expect(auth.get()).resolves.toMatchObject({ accessToken: 'fresh-stable-token' });
    expect(calls).toBe(2);
  });

  it('continues suppressing retries for the same rejected authorization revision', async () => {
    const auth = providerFixture(authorization('stable-token', '2026-10-17T00:00:00.000Z'));
    await expect(auth.get()).resolves.toBeUndefined();
    acceptedRefreshTokens.add('stable-token');

    await expect(auth.get()).resolves.toBeUndefined();
    expect(calls).toBe(1);
  });
});
