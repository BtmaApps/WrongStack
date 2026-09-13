import type { ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HqAuthState } from '../src/hq-server/auth-state.js';
import { MailboxGatewayManager } from '../src/hq-server/mailbox-gateway-manager.js';
import { handleApiMailboxHealth } from '../src/hq-server/routes/system-handlers.js';

/**
 * W2 #14 (RFC hq-improvements-2026-09.md): focused tests for the
 * `handleApiMailboxHealth` HTTP handler.
 *
 * The handler is a thin wrapper over `MailboxGatewayManager.getHealth()`;
 * the contract is locked by `packages/cli/tests/hq-mailbox-gateway-health.test.ts`.
 * These tests verify the WIRE contract: response headers, JSON shape, and
 * Cache-Control directives.
 */

function makeMutableAuth(): HqAuthState['mutableAuth'] {
  return {
    browserTokens: new Map(),
    clientTokens: new Map(),
    browserTokenObjs: new Map(),
    clientTokenObjs: new Map(),
    passwordHash: undefined,
    cookieSecret: 'test-secret',
    totpSecret: undefined,
    totpPendingSecret: undefined,
    totpRecoveryCodes: [],
    totpLastUsedCounter: 0,
    updatedAt: new Date().toISOString(),
    version: 1 as const,
  } as unknown as HqAuthState['mutableAuth'];
}

interface MockResponse extends ServerResponse {
  statusCode: number;
  headers: Record<string, string | number>;
  body: string;
}

function makeMockResponse(): MockResponse {
  const headers: Record<string, string | number> = {};
  const mock = {
    statusCode: 0,
    headers,
    body: '',
    setHeader(name: string, value: string | number): void {
      headers[name] = value;
    },
    getHeader(name: string): string | number | undefined {
      return headers[name];
    },
    writeHead(statusCode: number, hdrs?: Record<string, string | number>): void {
      mock.statusCode = statusCode;
      if (hdrs) {
        for (const [k, v] of Object.entries(hdrs)) {
          headers[k] = v;
        }
      }
    },
    end(chunk?: string | Buffer): void {
      mock.body = typeof chunk === 'string' ? chunk : (chunk?.toString('utf8') ?? '');
    },
  } as unknown as MockResponse;
  return mock;
}

let manager: MailboxGatewayManager;
beforeEach(() => {
  manager = new MailboxGatewayManager({
    host: '127.0.0.1',
    port: 3499,
    mutableAuth: makeMutableAuth(),
    sessions: new Map(),
  });
});
afterEach(() => {
  manager.close();
});

describe('handleApiMailboxHealth (W2 #14)', () => {
  it('responds with 200 and JSON content-type', () => {
    const res = makeMockResponse();
    handleApiMailboxHealth(res, manager);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('application/json');
  });

  it('sets Cache-Control: no-store (snapshot is live, not cacheable)', () => {
    const res = makeMockResponse();
    handleApiMailboxHealth(res, manager);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('response body is valid JSON matching the health shape', () => {
    const res = makeMockResponse();
    handleApiMailboxHealth(res, manager);
    const parsed: unknown = JSON.parse(res.body);
    expect(parsed).toMatchObject({
      gatewayCount: 0,
      rateLimiterConfigured: true,
      actorAttached: false,
      gateways: [],
    });
    // sweepIntervalMs and idleTtlMs are positive numbers.
    const p = parsed as { sweepIntervalMs: number; idleTtlMs: number };
    expect(p.sweepIntervalMs).toBeGreaterThan(0);
    expect(p.idleTtlMs).toBeGreaterThan(p.sweepIntervalMs);
  });

  it('reports bound gateways with projectId = basename (credential contract)', () => {
    manager.getMailboxGateway('/data/workspaces/acme-web');
    manager.getMailboxGateway('/data/workspaces/bravo-svc');
    const res = makeMockResponse();
    handleApiMailboxHealth(res, manager);
    const parsed = JSON.parse(res.body) as {
      gatewayCount: number;
      gateways: { projectId: string; projectRoot: string }[];
    };
    expect(parsed.gatewayCount).toBe(2);
    expect(parsed.gateways.map((g) => g.projectId)).toEqual(['acme-web', 'bravo-svc']);
    expect(parsed.gateways.map((g) => g.projectRoot)).toEqual([
      '/data/workspaces/acme-web',
      '/data/workspaces/bravo-svc',
    ]);
  });

  it('surfaces actorAttached: false on the HQ mount (no MailboxActorContext)', () => {
    // Load-bearing contract from SAGE memory:
    // `authorizeMailboxGateway` in mailbox-gateway-manager.ts never sets
    // `actor`. So on the HQ mount, `access.actor` is always undefined.
    // The handler must surface this truthfully as `actorAttached: false`.
    const res = makeMockResponse();
    handleApiMailboxHealth(res, manager);
    const parsed = JSON.parse(res.body) as { actorAttached: boolean };
    expect(parsed.actorAttached).toBe(false);
  });

  it('is synchronous (handler returns void, not Promise)', () => {
    const res = makeMockResponse();
    const result = handleApiMailboxHealth(res, manager);
    expect(result).toBeUndefined();
  });
});
