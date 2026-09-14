/**
 * W6 #5: the capability gate on HQ's mailbox-mutation routes.
 *
 * HQ exposes two control-plane writes that reach live agents and their mailbox
 * state — `POST /api/mailbox-send` (enqueue into a running session) and
 * `POST /api/mailbox/messages/:id/action` (mark-read, acknowledge, reopen,
 * soft-delete, restore). Both gate on `control.enqueue` through the single
 * shared `callerCanEnqueue` predicate.
 *
 * That predicate is the load-bearing surface, and it carries two documented
 * hardening fixes worth pinning here:
 *
 *  - WS-012: the action route performed NO capability check at all before this
 *    helper existed — its auth parameters were `_`-prefixed as deliberately
 *    unused — so mailbox mutation was reachable by any authenticated caller.
 *  - WS-077: the unauthenticated fallback tested `browserTokens.size === 0`
 *    alone, so an all-expired token file or a live revocation (requireAuthFloor)
 *    read as "open mode" and returned true: unauthenticated enqueue into
 *    running agents.
 *
 * These tests are the first coverage of this predicate; nothing in
 * packages/cli/tests referenced it before.
 *
 * @module tests/hq-mailbox-capability
 */
import { describe, expect, it } from 'vitest';
import { callerCanEnqueue } from '../src/hq-server/routes/mailbox-handlers.js';

/** Minimal `mutableAuth` shape, cast past the router type for unit testing. */
function authState(overrides: {
  browserTokens?: string[];
  passwordHash?: string | undefined;
  requireAuthFloor?: boolean;
}): never {
  return {
    browserTokens: new Set(overrides.browserTokens ?? []),
    passwordHash: overrides.passwordHash,
    requireAuthFloor: overrides.requireAuthFloor ?? false,
  } as never;
}

/** A credential-less caller: `authenticateBrowserRequest` returned nothing. */
const noCredential = undefined as never;

describe('callerCanEnqueue — cookie sessions', () => {
  it('allows a password session, which carries no token capabilities to check', () => {
    const auth = { kind: 'cookie', tokenId: undefined, capabilities: undefined } as never;
    expect(callerCanEnqueue(auth, authState({ browserTokens: ['k'] }))).toBe(true);
  });

  it('allows a session whose token carries control.enqueue', () => {
    const auth = { kind: 'cookie', tokenId: 't1', capabilities: ['control.enqueue'] } as never;
    expect(callerCanEnqueue(auth, authState({ browserTokens: ['k'] }))).toBe(true);
  });

  it('denies a session whose token lacks control.enqueue', () => {
    const auth = { kind: 'cookie', tokenId: 't1', capabilities: ['control.read'] } as never;
    expect(callerCanEnqueue(auth, authState({ browserTokens: ['k'] }))).toBe(false);
  });
});

describe('callerCanEnqueue — token credentials', () => {
  it('allows a token carrying control.enqueue', () => {
    const auth = { kind: 'token', id: 't1', capabilities: ['control.enqueue'] } as never;
    expect(callerCanEnqueue(auth, authState({ browserTokens: ['k'] }))).toBe(true);
  });

  it('denies a token lacking control.enqueue', () => {
    const auth = { kind: 'token', id: 't1', capabilities: ['control.read'] } as never;
    expect(callerCanEnqueue(auth, authState({ browserTokens: ['k'] }))).toBe(false);
  });

  it('allows a token that declares no capabilities at all', () => {
    // An unscoped token predates capability scoping and is treated as full.
    const auth = { kind: 'token', id: 't1', capabilities: undefined } as never;
    expect(callerCanEnqueue(auth, authState({ browserTokens: ['k'] }))).toBe(true);
  });
});

describe('callerCanEnqueue — unauthenticated (WS-077)', () => {
  it('allows a credential-less caller only when HQ genuinely has no auth configured', () => {
    expect(callerCanEnqueue(noCredential, authState({}))).toBe(true);
  });

  it('DENIES a credential-less caller when a browser token exists', () => {
    // The WS-077 regression: this returned true, so anyone could enqueue into
    // running agents via /api/mailbox-send.
    expect(callerCanEnqueue(noCredential, authState({ browserTokens: ['k'] }))).toBe(false);
  });

  it('DENIES a credential-less caller when only a password is configured', () => {
    expect(callerCanEnqueue(noCredential, authState({ passwordHash: 'scrypt:x' }))).toBe(false);
  });

  it('DENIES a credential-less caller when the auth floor is raised, even with zero live tokens', () => {
    // The exact trap WS-077 named: an all-expired token file leaves
    // `browserTokens` empty while `requireAuthFloor` records that auth IS
    // configured and has merely lapsed. Sizing the check on the token set alone
    // read that as "open mode".
    expect(
      callerCanEnqueue(noCredential, authState({ browserTokens: [], requireAuthFloor: true })),
    ).toBe(false);
  });
});
