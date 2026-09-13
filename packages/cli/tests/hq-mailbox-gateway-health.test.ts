import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HqAuthState } from '../src/hq-server/auth-state.js';
import { MailboxGatewayManager } from '../src/hq-server/mailbox-gateway-manager.js';

/**
 * W2 #14 (RFC hq-improvements-2026-09.md): focused tests for
 * `MailboxGatewayManager.getHealth()`.
 *
 * The health snapshot is the cockpit's "Mailbox gateway" card. These
 * tests verify the three load-bearing contract facts that an operator
 * depends on:
 *
 *   1. `projectId` is the **basename** of the project directory (matches
 *      the mailbox credential contract from `mailbox-serve.ts:192`).
 *   2. `actorAttached` is `false` on the HQ mount — HQ's
 *      `authorizeMailboxGateway` never attaches a `MailboxActorContext`,
 *      and the dashboard must surface that truth honestly.
 *   3. `gateways` is sorted by `projectId` for stable dashboard rendering
 *      across renders and HQ restarts.
 */

function makeMutableAuth(): HqAuthState['mutableAuth'] {
  // Minimal mutableAuth shape — only the fields `authorizeMailboxGateway`
  // touches (browserTokens for the token-mode branch). All other fields
  // are defaulted to empty/zero to avoid pulling in the full HQ server
  // boot path.
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

let manager: MailboxGatewayManager;
beforeEach(() => {
  // sessions map is empty — authorizeMailboxGateway only consults it for
  // the cookie-auth branch, and these tests assert health shape, not
  // authorization outcomes.
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

describe('MailboxGatewayManager.getHealth (W2 #14)', () => {
  it('returns an empty health snapshot when no gateways are bound', () => {
    const health = manager.getHealth();
    expect(health.gatewayCount).toBe(0);
    expect(health.gateways).toEqual([]);
    expect(health.actorAttached).toBe(false);
    expect(health.rateLimiterConfigured).toBe(true);
    expect(health.sweepIntervalMs).toBeGreaterThan(0);
    expect(health.idleTtlMs).toBeGreaterThan(health.sweepIntervalMs);
  });

  it('reports actorAttached: false on the HQ mount (HQ never attaches a MailboxActorContext)', () => {
    // This is a load-bearing contract: the dashboard must render "no actor
    // context" honestly, not paper over it. If a future refactor adds an
    // actor context to HQ's authorize path, this test should be updated
    // AND the RFC's "actorAttached" flag should be re-evaluated.
    const health = manager.getHealth();
    expect(health.actorAttached).toBe(false);
  });

  it('reports projectId as the basename of the full path (credential contract)', () => {
    // Bind a gateway via getMailboxGateway — it creates the entry on
    // first call. We do not exercise the auth path here; the binding
    // is the only thing `getHealth` reads.
    manager.getMailboxGateway('/home/user/projects/my-app');
    const health = manager.getHealth();
    expect(health.gatewayCount).toBe(1);
    expect(health.gateways[0]?.projectId).toBe('my-app');
    expect(health.gateways[0]?.projectRoot).toBe('/home/user/projects/my-app');
  });

  it('surfaces the full path separately for operator debugging', () => {
    const fullPath = '/data/workspaces/2026-Q3/acme-web';
    manager.getMailboxGateway(fullPath);
    const health = manager.getHealth();
    expect(health.gateways[0]?.projectId).toBe('acme-web');
    expect(health.gateways[0]?.projectRoot).toBe(fullPath);
  });

  it('handles Windows-style paths correctly (projectId = basename)', () => {
    manager.getMailboxGateway('D:\\projects\\acme-web');
    const health = manager.getHealth();
    expect(health.gateways[0]?.projectId).toBe('acme-web');
    expect(health.gateways[0]?.projectRoot).toBe('D:\\projects\\acme-web');
  });

  it('sorts gateways by projectId for stable dashboard rendering', () => {
    manager.getMailboxGateway('/projects/gamma');
    manager.getMailboxGateway('/projects/alpha');
    manager.getMailboxGateway('/projects/beta');
    const health = manager.getHealth();
    expect(health.gateways.map((g) => g.projectId)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('reports hasActiveStreams: false for freshly bound gateways', () => {
    manager.getMailboxGateway('/projects/my-app');
    const health = manager.getHealth();
    expect(health.gateways[0]?.hasActiveStreams).toBe(false);
  });

  it('reports lastUsedAt and idleForMs after binding', async () => {
    const before = Date.now();
    manager.getMailboxGateway('/projects/my-app');
    const after = Date.now();
    const health = manager.getHealth();
    const entry = health.gateways[0];
    expect(entry).toBeDefined();
    if (entry && entry.lastUsedAt !== null && entry.idleForMs !== null) {
      // lastUsedAt should be between `before` and `after` (tolerance: ±10ms
      // for the wall clock between the two reads).
      expect(entry.lastUsedAt).toBeGreaterThanOrEqual(before - 10);
      expect(entry.lastUsedAt).toBeLessThanOrEqual(after + 10);
      // idleForMs is the time since the last use; should be small and non-negative.
      expect(entry.idleForMs).toBeGreaterThanOrEqual(0);
      expect(entry.idleForMs).toBeLessThan(60_000);
    } else {
      throw new Error('expected lastUsedAt and idleForMs to be set');
    }
  });

  it('returns gatewayCount equal to the number of bound gateways', () => {
    manager.getMailboxGateway('/projects/one');
    manager.getMailboxGateway('/projects/two');
    manager.getMailboxGateway('/projects/three');
    const health = manager.getHealth();
    expect(health.gatewayCount).toBe(3);
    expect(health.gateways).toHaveLength(3);
  });
});
