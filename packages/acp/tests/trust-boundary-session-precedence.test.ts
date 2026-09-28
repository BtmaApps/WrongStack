/**
 * Regression: the TrustBoundary request took its session from the external
 * agent's `toolCall.rawInput.sessionId` before the host-supplied
 * `actor.sessionId`, so an agent could scope its permission request to another
 * session. The host's session now wins; the agent value is only a fallback.
 */
import { describe, expect, it } from 'vitest';
import { toTrustBoundaryRequest } from '../src/client/trust-boundary-permission.js';

function map(rawSessionId: string | undefined, hostSessionId: string | undefined) {
  const request = {
    toolCall: {
      toolCallId: 'call-1',
      title: 'Write file',
      kind: 'edit',
      rawInput: { path: '/p/x.ts', ...(rawSessionId ? { sessionId: rawSessionId } : {}) },
    },
    options: [],
    signal: new AbortController().signal,
  };
  const out = toTrustBoundaryRequest(request as never, {
    actor: { kind: 'agent', ...(hostSessionId ? { sessionId: hostSessionId } : {}) },
  });
  return [out.actor.sessionId, out.scope.sessionId];
}

describe('ACP TrustBoundary session precedence', () => {
  it('uses the host session over the one the agent claims', () => {
    expect(map('victim-session', 'host-session')).toEqual(['host-session', 'host-session']);
  });

  it('falls back to the agent session only when the host names none', () => {
    expect(map('agent-session', undefined)).toEqual(['agent-session', 'agent-session']);
    expect(map(undefined, undefined)).toEqual([undefined, undefined]);
  });
});
