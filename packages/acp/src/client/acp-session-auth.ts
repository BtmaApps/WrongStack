import type { AgentCapabilities, AuthMethod, SessionId } from '../types/acp-v1.js';

import type { State } from './acp-request-state.js';

import { ACPSessionError, isAuthRequiredError, isJsonRpcError } from './acp-session-errors.js';

import { type ACPSessionOpContext, executeCreateSession } from './acp-session-ops.js';

import type { ACPSessionOptions } from './acp-session-types.js';

export interface AcpSessionAuthHost {
  state: State;
  authMethods: AuthMethod[];
  allocId: () => number;
  sendRequest: (
    id: number,
    method: string,
    params: unknown,
    timeoutMs?: number,
  ) => Promise<unknown>;
  agentCapabilities: AgentCapabilities;
  opContext: () => ACPSessionOpContext;
  ensureAuthenticated: () => Promise<void>;
  authenticate: (methodId: string) => Promise<void>;
  opts: ACPSessionOptions;
}
export async function authenticate(host: AcpSessionAuthHost, methodId: string): Promise<void> {
  if (host.state === 'closed') {
    throw new ACPSessionError('closed', 'session is closed');
  }
  if (host.state !== 'ready' && host.state !== 'authenticated') {
    throw new ACPSessionError(
      'protocol_error',
      `authenticate called in state=${host.state} (expected 'ready')`,
    );
  }
  if (host.state === 'authenticated') return;
  if (!host.authMethods.some((m) => m.id === methodId)) {
    throw new ACPSessionError(
      'auth_failed',
      `auth method "${methodId}" not in advertised methods: ${host.authMethods.map((m) => m.id).join(', ')}`,
    );
  }
  if (host.authMethods.find((m) => m.id === methodId)?.type === 'terminal') {
    throw new ACPSessionError(
      'auth_failed',
      'Terminal authentication requires interactive login followed by reconnect; it cannot use authenticate',
    );
  }

  const id = host.allocId();
  const result = await host.sendRequest(id, 'authenticate', { methodId });
  if (isJsonRpcError(result)) {
    throw new ACPSessionError('auth_failed', `authenticate failed: ${result.message}`, result);
  }
  host.state = 'authenticated';
}

export async function logout(host: AcpSessionAuthHost): Promise<void> {
  if (host.state === 'closed') {
    throw new ACPSessionError('closed', 'session is closed');
  }
  if (!host.agentCapabilities.auth?.logout) {
    throw new ACPSessionError(
      'unsupported_capability',
      'agent does not support logout (auth.logout capability not advertised)',
    );
  }

  const id = host.allocId();
  const result = await host.sendRequest(id, 'logout', {});
  if (isJsonRpcError(result)) {
    throw new ACPSessionError('logout_failed', `logout failed: ${result.message}`, result);
  }
  host.state = 'ready';
}

export async function createSessionWithAuth(host: AcpSessionAuthHost): Promise<SessionId> {
  try {
    return await executeCreateSession(host.opContext());
  } catch (err) {
    if (host.state === 'authenticated' || !isAuthRequiredError(err)) {
      throw err instanceof ACPSessionError
        ? err
        : new ACPSessionError(
            'session_create_failed',
            err instanceof Error ? err.message : String(err),
            err,
          );
    }
    await host.ensureAuthenticated();
    return executeCreateSession(host.opContext());
  }
}

export async function ensureAuthenticated(host: AcpSessionAuthHost): Promise<void> {
  if (host.state === 'authenticated') return;
  if (host.authMethods.length === 0) {
    throw new ACPSessionError(
      'auth_failed',
      'This agent requires authentication before a session can start, but advertised no authMethods. Log into the CLI, then retry.',
    );
  }
  const inProcess = host.authMethods.find(
    (m) => m.type === undefined || m.type === 'agent' || m.type === 'oauth' || m.type === 'http',
  );
  if (inProcess) {
    await host.authenticate(inProcess.id);
    return;
  }
  const terminal = host.authMethods.find((m) => m.type === 'terminal');
  const setupArgs = terminal?.args?.length ? terminal.args.join(' ') : undefined;
  const setup =
    setupArgs !== undefined
      ? `${host.opts.command}${host.opts.args?.length ? ` ${host.opts.args.join(' ')}` : ''} ${setupArgs}`
      : `${host.opts.command}${host.opts.args?.length ? ` ${host.opts.args.join(' ')}` : ''}`;
  throw new ACPSessionError(
    'auth_failed',
    `This agent requires a terminal login before ACP can start. Run \`${setup}\` (or the CLI's /login), then retry.`,
  );
}
