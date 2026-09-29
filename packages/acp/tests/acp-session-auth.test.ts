/**
 * Coverage for the ACP client auth-detection and auth-state guards.
 *
 * These are the branches that decide whether a user is told to log in when an
 * agent refuses `session/new`. They were entirely untested, which is why
 * `acp-session-auth.ts` sat at 73.91% branch and `acp-session-errors.ts` at
 * 51.51% — together a third of the package's branch gap.
 *
 * No test imported these modules directly before; the behaviour was only ever
 * reached incidentally through a well-behaved agent, so the structured
 * `auth_required` shapes that real registry agents return were never exercised.
 */
import { describe, expect, it } from 'vitest';
import type { State } from '../src/client/acp-request-state.js';
import type { AcpSessionAuthHost } from '../src/client/acp-session-auth.js';
import {
  authenticate,
  createSessionWithAuth,
  ensureAuthenticated,
} from '../src/client/acp-session-auth.js';
import { ACPSessionError, isAuthRequiredError } from '../src/client/acp-session-errors.js';
import type { AuthMethod } from '../src/types/acp-v1.js';

function host(overrides: Partial<AcpSessionAuthHost> = {}): AcpSessionAuthHost {
  return {
    state: 'ready',
    authMethods: [],
    allocId: () => 1,
    sendRequest: async () => ({}),
    agentCapabilities: {},
    opContext: () => ({}) as never,
    ensureAuthenticated: async () => {},
    authenticate: async () => {},
    opts: { command: 'agent', projectRoot: process.cwd() },
    ...overrides,
  };
}

const auth = (id: string, type?: AuthMethod['type']): AuthMethod => ({
  id,
  name: id,
  ...(type ? { type } : {}),
});

describe('isAuthRequiredError', () => {
  it('detects auth_required from the error message (control)', () => {
    expect(isAuthRequiredError(new Error('authentication required'))).toBe(true);
    expect(isAuthRequiredError(new Error('auth_required'))).toBe(true);
    expect(isAuthRequiredError(new Error('auth-required'))).toBe(true);
  });

  // The structured shapes: an agent that returns a JSON-RPC error whose
  // *message* does not say "auth required" but whose `data` carries the marker.
  it('detects a bare auth_required string in cause.data', () => {
    const err = new ACPSessionError('session_create_failed', 'refused', { data: 'auth_required' });
    expect(isAuthRequiredError(err)).toBe(true);
  });

  it('detects the upper-case bare auth_required string in cause.data', () => {
    const err = new ACPSessionError('session_create_failed', 'refused', { data: 'AUTH_REQUIRED' });
    expect(isAuthRequiredError(err)).toBe(true);
  });

  it('detects the structured authRequired flag in cause.data', () => {
    const err = new ACPSessionError('session_create_failed', 'refused', {
      data: { authRequired: true },
    });
    expect(isAuthRequiredError(err)).toBe(true);
  });

  it('detects a nested auth_required code in cause.data', () => {
    const lower = new ACPSessionError('session_create_failed', 'refused', {
      data: { code: 'auth_required' },
    });
    const upper = new ACPSessionError('session_create_failed', 'refused', {
      data: { code: 'AUTH_REQUIRED' },
    });
    expect(isAuthRequiredError(lower)).toBe(true);
    expect(isAuthRequiredError(upper)).toBe(true);
  });

  it('unwraps a plain object carrying a cause, not just ACPSessionError', () => {
    expect(isAuthRequiredError({ cause: { data: { authRequired: true } }, message: 'nope' })).toBe(
      true,
    );
  });

  it('treats a raw JSON-RPC error object as its own cause', () => {
    expect(isAuthRequiredError({ code: -32000, message: 'nope', data: 'auth_required' })).toBe(
      true,
    );
  });

  it('returns false for a non-object cause', () => {
    expect(
      isAuthRequiredError(new ACPSessionError('session_create_failed', 'refused', 'oops')),
    ).toBe(false);
    expect(isAuthRequiredError(new ACPSessionError('session_create_failed', 'refused', null))).toBe(
      false,
    );
  });

  it('returns false for data that carries no auth marker (control)', () => {
    const err = new ACPSessionError('session_create_failed', 'refused', {
      data: { somethingElse: 1 },
    });
    expect(isAuthRequiredError(err)).toBe(false);
  });
});

describe('authenticate', () => {
  it('rejects a call made in the wrong state', async () => {
    await expect(authenticate(host({ state: 'prompting' as State }), 'any')).rejects.toMatchObject({
      kind: 'protocol_error',
    });
  });

  it('refuses a terminal auth method, which cannot run in-process', async () => {
    await expect(
      authenticate(host({ authMethods: [auth('t', 'terminal')] }), 't'),
    ).rejects.toMatchObject({ kind: 'auth_failed' });
  });

  it('rejects a method the agent never advertised', async () => {
    await expect(
      authenticate(host({ authMethods: [auth('a', 'agent')] }), 'nope'),
    ).rejects.toMatchObject({ kind: 'auth_failed' });
  });

  it('is a no-op once already authenticated', async () => {
    await expect(
      authenticate(
        host({ state: 'authenticated' as State, authMethods: [auth('a', 'agent')] }),
        'a',
      ),
    ).resolves.toBeUndefined();
  });

  it('sends authenticate and lands in the authenticated state (control)', async () => {
    let sent: { method?: string } | undefined;
    const h = host({
      authMethods: [auth('a', 'agent')],
      sendRequest: async (_id, method) => {
        sent = { method };
        return {};
      },
    });
    await authenticate(h, 'a');
    expect(sent?.method).toBe('authenticate');
    expect(h.state).toBe('authenticated');
  });
});

describe('ensureAuthenticated', () => {
  it('returns immediately when already authenticated', async () => {
    const h = host({ state: 'authenticated' as State });
    await expect(ensureAuthenticated(h)).resolves.toBeUndefined();
  });

  it('throws a log-in hint when the agent advertises no auth methods at all', async () => {
    await expect(ensureAuthenticated(host({ authMethods: [] }))).rejects.toMatchObject({
      kind: 'auth_failed',
      message: expect.stringContaining('advertised no authMethods'),
    });
  });

  it('throws a terminal-login hint when only terminal auth is available', async () => {
    await expect(
      ensureAuthenticated(
        host({ authMethods: [{ id: 't', name: 't', type: 'terminal', args: ['auth'] }] }),
      ),
    ).rejects.toMatchObject({ kind: 'auth_failed' });
  });

  it('omits the setup args from the hint when the terminal method carries none', async () => {
    // A terminal method with no `args` makes `setupArgs` undefined, so the hint
    // is the bare command rather than "<command> <args>".
    await expect(
      ensureAuthenticated(host({ authMethods: [{ id: 't', name: 't', type: 'terminal' }] })),
    ).rejects.toMatchObject({ message: expect.stringContaining('Run `agent`') });
  });

  it('includes the configured command args in the terminal-login hint', async () => {
    const h = host({
      authMethods: [{ id: 't', name: 't', type: 'terminal' }],
      opts: { command: 'agent', args: ['--acp'], projectRoot: process.cwd() },
    });
    await expect(ensureAuthenticated(h)).rejects.toMatchObject({
      message: expect.stringContaining('agent --acp'),
    });
  });
});

describe('createSessionWithAuth failure wrapping', () => {
  it('wraps a non-Error throw into a session_create_failed ACPSessionError', async () => {
    // A rejected value that is not an Error and not an ACPSessionError takes
    // the String(err) wrapping path rather than rethrowing the original.
    const h = host({
      opContext: () =>
        ({
          closed: false,
          sessionId: null,
          agentCapabilities: {},
          opts: { command: 'agent', projectRoot: process.cwd() },
          allocId: () => 1,
          sendRequest: async () => {
            throw 'plain rejection value';
          },
          setSessionId: () => {},
          resetScratch: () => {},
          closeSession: async () => {},
        }) as never,
    });
    await expect(createSessionWithAuth(h)).rejects.toMatchObject({
      name: 'ACPSessionError',
      kind: 'session_create_failed',
      message: 'plain rejection value',
    });
  });
});
