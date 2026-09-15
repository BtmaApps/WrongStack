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
};
vi.mock('../../src/lib/ws-client.js', () => ({ getWSClient: () => wsStub, WSClient: class {} }));
vi.mock('@/lib/ws-client', () => ({ getWSClient: () => wsStub, WSClient: class {} }));

import { runChatSlashCommand } from '../../src/components/ChatInput/slash-routing.js';
import { ChatView } from '../../src/components/ChatView/index.js';
import { handleSessionStart } from '../../src/hooks/ws-handlers/session-replay-handlers.js';
import { useChatStore } from '../../src/stores/index.js';
import { nestedButtons } from '../helpers/nested-buttons.js';

/** The composer's `/clear` wiring, with the store as its backing state. */
function clearViaSlashCommand(): void {
  const chat = useChatStore.getState();
  runChatSlashCommand({
    raw: '/clear',
    addMessage: (m) => useChatStore.getState().addMessage(m),
    clearMessages: () => useChatStore.getState().clearMessages(),
    isLoading: chat.isLoading,
    client: { clearContext: () => {} },
    queue: [],
    sendAbort: () => {},
    sendMsg: () => {},
    setLoading: (l) => useChatStore.getState().setLoading(l),
    setCurrentView: () => {},
    toggleRefineEnabled: () => {},
    setProcessMonitorOpen: () => {},
    setQueuePanelOpen: () => {},
    ws: wsStub as never,
    handleNextList: () => false,
    handleNextSelect: () => false,
  });
}

/** The welcome screen is the only thing that renders the launcher cards. */
function welcomeScreen(): HTMLElement | null {
  return screen.queryByText(/Bug Hunter|bugHunterTitle/i);
}

/**
 * `/clear` must hand the pane back to the welcome screen — the one surface
 * that carries the Bug Hunter and performance-ratchet launchers.
 *
 * ChatView shows it only for a lane that is empty AND idle, and `isLoading`
 * is not part of the transcript, so `clearMessages()` alone left a clear
 * issued mid-run (or after a launcher armed the flag) rendering the loading
 * branch over zero rows: a blank pane with no way back.
 */
describe('ChatView welcome screen after a clear', () => {
  beforeEach(() => {
    useChatStore.getState().clearMessages();
    useChatStore.getState().setLoading(false);
  });
  afterEach(cleanup);

  it('comes back when the transcript is emptied', () => {
    render(<ChatView />);
    expect(welcomeScreen()).not.toBeNull();

    act(() => {
      useChatStore.getState().addMessage({ role: 'user', content: 'hello' });
    });
    expect(welcomeScreen()).toBeNull();

    act(() => {
      useChatStore.getState().clearMessages();
    });
    expect(welcomeScreen()).not.toBeNull();
  });

  it('comes back after /clear and the server`s session.start answer', () => {
    render(<ChatView />);
    act(() => {
      handleSessionStart({
        type: 'session.start',
        payload: { sessionId: 's1', model: 'm', provider: 'p' },
      } as never);
      useChatStore.getState().addMessage({ role: 'user', content: 'hello' });
      useChatStore.getState().addMessage({ role: 'assistant', content: 'hi there' });
    });
    expect(welcomeScreen()).toBeNull();

    act(() => {
      clearViaSlashCommand();
      handleSessionStart({
        type: 'session.start',
        payload: { sessionId: 's1', model: 'm', provider: 'p', reset: true },
      } as never);
    });

    expect(useChatStore.getState().messages).toHaveLength(0);
    expect(welcomeScreen()).not.toBeNull();
  });

  it('comes back when the lane still believes a run is in flight', () => {
    render(<ChatView />);
    act(() => {
      useChatStore.getState().addMessage({ role: 'user', content: 'start a bug hunt' });
      // What the Bug Hunter / performance-ratchet launchers do on send.
      useChatStore.getState().setLoading(true);
    });
    expect(welcomeScreen()).toBeNull();

    act(clearViaSlashCommand);

    expect(useChatStore.getState().messages).toHaveLength(0);
    expect(useChatStore.getState().isLoading).toBe(false);
    expect(welcomeScreen()).not.toBeNull();
  });

  it('renders no button nested inside another button in the chat header', () => {
    const { container } = render(<ChatView />);

    // ChatHeader is hand-rolled and carries a row of inline action controls
    // (open-sidebar, rename, session switcher, iteration chip, tool-stats /
    // memory / processes / checkpoints) next to regions that are themselves
    // clickable. None of them may wrap another button.
    expect(nestedButtons(container)).toEqual([]);

    // A transcript is the other phase that adds header controls: the status
    // strip (context fill bar, Edit, cost and quota chips) only renders once
    // there is recorded usage, so assert it separately rather than assuming the
    // empty state covered it.
    act(() => {
      useChatStore.getState().addMessage({ role: 'user', content: 'hello' });
    });
    expect(welcomeScreen()).toBeNull();
    expect(nestedButtons(container)).toEqual([]);
  });
});
