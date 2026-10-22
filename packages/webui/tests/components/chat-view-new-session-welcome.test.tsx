import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// virtua measures with a ResizeObserver; jsdom has none.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as never;

// virtua also calls scrollTo() asynchronously when items land in the viewport
// (it fires the rejection AFTER the tests settle, so it surfaces as an unhandled
// rejection instead of a failure). jsdom does not implement it.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

/** The session id the server will answer a `session.new` with. */
const NEW_SESSION_ID = 'sess_new';

const wsStub = {
  on: () => () => {},
  send: () => {},
  isConnected: true,
  sendAbort: () => {},
  listSavedProviders: () => {},
  listTools: () => {},
  getChimeraReports: () => {},
  withSession: <T,>(p: T) => p,
  supportsCapability: () => false,
  focusSessionById: () => {},
  subscribeSessions: () => {},
  listSessions: () => {},
  /**
   * The "this client asked for this session" grant. A `session.new` answer
   * names a session id the client could not know, so the real client matches it
   * by "the first RESET announcement for a session it has never seen" and then
   * hands the grant over keyed by id.
   */
  consumeRequestedSwitch: (sessionId: string) => sessionId === NEW_SESSION_ID,
};
vi.mock('../../src/lib/ws-client.js', () => ({ getWSClient: () => wsStub, WSClient: class {} }));
vi.mock('@/lib/ws-client', () => ({ getWSClient: () => wsStub, WSClient: class {} }));

import { ChatView } from '../../src/components/ChatView/index.js';
import { handleSessionStart } from '../../src/hooks/ws-handlers/session-replay-handlers.js';
import { useChatStore } from '../../src/stores/index.js';

/** The welcome screen is the only thing that renders the launcher cards. */
function welcomeScreen(): HTMLElement | null {
  return screen.queryByText(/Bug Hunter|bugHunterTitle/i);
}

/** The server's answer to `session.new`: a RESET announcement for a new id. */
function serverStartsNewSession(): void {
  handleSessionStart({
    type: 'session.start',
    payload: { sessionId: NEW_SESSION_ID, model: 'm', provider: 'p', reset: true },
  } as never);
}

describe('ChatView welcome screen for a new session', () => {
  beforeEach(() => {
    useChatStore.getState().clearMessages();
    useChatStore.getState().setLoading(false);
  });
  afterEach(cleanup);

  it('shows the welcome screen when the answer to a new session lands', () => {
    render(<ChatView />);

    // An existing conversation.
    act(() => {
      handleSessionStart({
        type: 'session.start',
        payload: { sessionId: 'sess_a', model: 'm', provider: 'p', reset: true },
      } as never);
      useChatStore.getState().addMessage({ role: 'user', content: 'old question' });
    });
    expect(welcomeScreen()).toBeNull();

    // New Session: the server answers with a fresh session id.
    act(serverStartsNewSession);

    expect(useChatStore.getState().boundSessionId).toBe(NEW_SESSION_ID);
    expect(useChatStore.getState().messages).toHaveLength(0);
    expect(useChatStore.getState().isLoading).toBe(false);
    expect(welcomeScreen()).not.toBeNull();
  });
});
