import { describe, expect, it, vi } from 'vitest';
import type {
  MCPAuthorizationServerMetadata,
  requestPinnedJson,
} from '../src/authorization-discovery.js';
import { registerMcpOAuthClient } from '../src/authorization-registration.js';

type RequestJson = typeof requestPinnedJson;

const authorizationServer: MCPAuthorizationServerMetadata = {
  issuer: 'https://auth.example.com',
  authorizationEndpoint: 'https://auth.example.com/authorize',
  tokenEndpoint: 'https://auth.example.com/token',
  registrationEndpoint: 'https://auth.example.com/register',
  scopesSupported: ['tools:read'],
};

function stubRegistration(response: unknown) {
  return vi.fn<RequestJson>(async () => response);
}

describe('registerMcpOAuthClient', () => {
  it('registers as a public client and returns the issued id', async () => {
    const request = stubRegistration({ client_id: 'generated-client' });

    const registration = await registerMcpOAuthClient({
      authorizationServer,
      redirectUris: ['http://127.0.0.1:43123/callback'],
      scopes: ['tools:read'],
      requestJson: request,
    });

    expect(registration).toMatchObject({
      clientId: 'generated-client',
      issuer: 'https://auth.example.com',
    });
    expect(registration.clientSecret).toBeUndefined();

    const [url, options] = request.mock.calls[0]!;
    expect(url).toBe('https://auth.example.com/register');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body!) as Record<string, unknown>;
    // A CLI cannot keep a secret: the PKCE-only exchange is the whole point.
    expect(body['token_endpoint_auth_method']).toBe('none');
    expect(body['grant_types']).toEqual(['authorization_code', 'refresh_token']);
    expect(body['redirect_uris']).toEqual(['http://127.0.0.1:43123/callback']);
    expect(body['scope']).toBe('tools:read');
  });

  it('keeps a client secret when the server issues a confidential client', async () => {
    const registration = await registerMcpOAuthClient({
      authorizationServer,
      redirectUris: ['https://app.example.com/callback'],
      requestJson: stubRegistration({
        client_id: 'confidential',
        client_secret: 'shh',
        client_secret_expires_at: 0,
      }),
    });

    expect(registration.clientSecret).toBe('shh');
  });

  it('refuses a secret that has already expired', async () => {
    await expect(
      registerMcpOAuthClient({
        authorizationServer,
        redirectUris: ['https://app.example.com/callback'],
        requestJson: stubRegistration({
          client_id: 'stale',
          client_secret: 'shh',
          client_secret_expires_at: Math.floor(Date.now() / 1_000) - 60,
        }),
      }),
    ).rejects.toThrow(/already-expired/);
  });

  it('refuses a server that advertises no registration endpoint', async () => {
    await expect(
      registerMcpOAuthClient({
        authorizationServer: { ...authorizationServer, registrationEndpoint: undefined },
        redirectUris: ['https://app.example.com/callback'],
      }),
    ).rejects.toThrow(/does not support dynamic client registration/);
  });

  it('refuses a redirect URI that is neither HTTPS nor loopback', async () => {
    await expect(
      registerMcpOAuthClient({
        authorizationServer,
        redirectUris: ['http://attacker.example.com/callback'],
        requestJson: stubRegistration({ client_id: 'never-reached' }),
      }),
    ).rejects.toThrow(/HTTPS or loopback/);
  });

  it('refuses a registration response without a client id', async () => {
    await expect(
      registerMcpOAuthClient({
        authorizationServer,
        redirectUris: ['https://app.example.com/callback'],
        requestJson: stubRegistration({ client_secret: 'orphan' }),
      }),
    ).rejects.toThrow(/client_id/);
  });
});
