import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageBubble } from '../../src/components/MessageBubble/index.js';
import { useChatStore } from '../../src/stores/chat-store.js';
import { useLocalPrefs } from '../../src/stores/local-prefs.js';
import type { ChatMessage } from '../../src/stores/types.js';

const mockWs = {
  sendMessage: vi.fn(),
  isConnected: true,
};

vi.mock('@/lib/ws-client', () => ({
  getWSClient: () => mockWs,
}));

function userMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'user_1',
    role: 'user',
    content: 'hello world',
    timestamp: 1_700_000_000_000,
    ...overrides,
  };
}

function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'assistant_1',
    role: 'assistant',
    content: 'hi back',
    timestamp: 1_700_000_000_001,
    ...overrides,
  };
}

describe('MessageBubble edit and retry operations', () => {
  beforeEach(() => {
    mockWs.sendMessage.mockClear();
    useChatStore.getState().clearMessages();
    useChatStore.getState().setLoading(false);
  });

  afterEach(async () => {
    // MessageBubble renders its body through LazyMarkdown, whose
    // `import('react-markdown')` chunk resolves on its own schedule — after the
    // synchronous test body has finished. Awaiting the same import inside act()
    // pulls the Suspense resolution into the act window; without it React
    // reports "a suspended resource finished loading inside a test, but the
    // event was not wrapped in act(...)". RTL's auto-cleanup registers its own
    // afterEach at import time, and after-hooks run in reverse registration
    // order, so this drain happens while the tree is still mounted.
    await act(async () => {
      await import('react-markdown');
    });
  });

  it('saveEdit updates the message in place and does NOT add a duplicate user message', () => {
    const userMsg = userMessage({ id: 'u1', content: 'original prompt' });
    const asstMsg = assistantMessage({ id: 'a1', content: 'original response' });
    useChatStore.getState().setMessages([userMsg, asstMsg]);

    render(<MessageBubble message={userMsg} isFirst />);

    // Click Edit button
    const editBtn = screen.getByRole('button', { name: /Edit/i });
    fireEvent.click(editBtn);

    // Change textarea value
    const textarea = screen.getByDisplayValue('original prompt');
    fireEvent.change(textarea, { target: { value: 'edited prompt' } });

    // Click Save button
    const saveBtn = screen.getByRole('button', { name: /Save & Send|Save/i });
    fireEvent.click(saveBtn);

    // Assert WebSocket sent the new prompt
    expect(mockWs.sendMessage).toHaveBeenCalledWith('edited prompt', undefined);

    // Assert chat store messages:
    // Should have only 1 user message (edited), and the subsequent assistant message truncated
    const messages = useChatStore.getState().messages;
    expect(messages.length).toBe(1);
    expect(messages[0]?.id).toBe('u1');
    expect(messages[0]?.content).toBe('edited prompt');
    expect(messages[0]?.role).toBe('user');
  });

  it('retryUserMessage resends failed message without duplicating it in history', () => {
    const failedUserMsg = userMessage({ id: 'u1', content: 'failed prompt', status: 'failed' });
    useChatStore.getState().setMessages([failedUserMsg]);

    render(<MessageBubble message={failedUserMsg} isFirst />);

    // Should see a Retry button on the failed user message
    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    fireEvent.click(retryBtn);

    expect(mockWs.sendMessage).toHaveBeenCalledWith('failed prompt', undefined);

    const messages = useChatStore.getState().messages;
    expect(messages.length).toBe(1);
    expect(messages[0]?.id).toBe('u1');
    expect(messages[0]?.content).toBe('failed prompt');
    expect(messages[0]?.status).toBeUndefined();
  });

  it('regenerate resends user message without creating duplicate user messages', () => {
    const userMsg = userMessage({ id: 'u1', content: 'my prompt' });
    const asstMsg = assistantMessage({ id: 'a1', content: 'error reply', isError: true });
    useChatStore.getState().setMessages([userMsg, asstMsg]);

    render(<MessageBubble message={asstMsg} isFirst />);

    // Click Retry / Regenerate on assistant message
    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    fireEvent.click(retryBtn);

    expect(mockWs.sendMessage).toHaveBeenCalledWith('my prompt', undefined);

    // Chat store should keep the 1 user message, truncate the assistant message, and NOT add a duplicate user message
    const messages = useChatStore.getState().messages;
    expect(messages.length).toBe(1);
    expect(messages[0]?.id).toBe('u1');
    expect(messages[0]?.content).toBe('my prompt');
    expect(messages[0]?.role).toBe('user');
  });
});

describe('MessageBubble footer under calm chrome', () => {
  beforeEach(() => {
    useChatStore.getState().clearMessages();
    useChatStore.getState().setLoading(false);
  });

  afterEach(async () => {
    useLocalPrefs.setState({ chromeLevel: 'calm' });
    await act(async () => {
      await import('react-markdown');
    });
  });

  const footer = (container: HTMLElement) =>
    container.querySelector('[data-footer-quiet]') as HTMLElement | null;

  it('quiets the footer of an older message and keeps the latest reply loud', () => {
    useLocalPrefs.setState({ chromeLevel: 'calm' });
    const u = userMessage({ id: 'u1' });
    const older = assistantMessage({ id: 'a1', content: 'older reply' });
    const latest = assistantMessage({ id: 'a2', content: 'latest reply' });
    useChatStore.getState().setMessages([u, older, latest]);

    const first = render(<MessageBubble message={older} isFirst />);
    expect(footer(first.container)).not.toBeNull();
    first.unmount();

    const last = render(<MessageBubble message={latest} isFirst />);
    expect(footer(last.container)).toBeNull();
  });

  it('keeps a failed user message footer visible (its retry must be reachable)', () => {
    useLocalPrefs.setState({ chromeLevel: 'calm' });
    const failed = userMessage({ id: 'u1', status: 'failed' });
    useChatStore.getState().setMessages([failed]);
    const { container } = render(<MessageBubble message={failed} isFirst />);
    expect(footer(container)).toBeNull();
  });

  it('full chrome never quiets the footer', () => {
    useLocalPrefs.setState({ chromeLevel: 'full' });
    const u = userMessage({ id: 'u1' });
    const older = assistantMessage({ id: 'a1' });
    const latest = assistantMessage({ id: 'a2' });
    useChatStore.getState().setMessages([u, older, latest]);
    const { container } = render(<MessageBubble message={older} isFirst />);
    expect(footer(container)).toBeNull();
  });
});
