import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MessageBubble } from '../../src/components/MessageBubble/index.js';
import { useLocalPrefs } from '../../src/stores/local-prefs.js';
import type { ChatMessage } from '../../src/stores/types.js';
import { useUIStore } from '../../src/stores/ui-store.js';

function thinkingMessage(overrides: Partial<ChatMessage['thinkingLog']> = {}): ChatMessage {
  return {
    id: 'thinking_1',
    role: 'system',
    content: '',
    timestamp: 1_700_000_000_000,
    thinkingLog: {
      iteration: 2,
      text: 'line 1\nline 2\nline 3\nline 4\nline 5',
      startedAt: 1_700_000_000_000,
      durationMs: 1_250,
      ...overrides,
    },
  };
}

describe('MessageBubble thinking logs', () => {
  beforeEach(() => {
    useUIStore.setState({
      searchOpen: false,
      searchQuery: '',
      searchActiveMessageId: null,
    });
    useLocalPrefs.getState().set({ showThinkingLogs: true });
  });

  it('renders live thinking logs with duration and expandable full text', () => {
    const { container } = render(<MessageBubble message={thinkingMessage()} isFirst />);

    expect(screen.getByText('Thinking')).toBeDefined();
    expect(screen.getByText('Model Reasoning')).toBeDefined();
    expect(screen.getByText('iter 2 · 1.3s · 5 lines')).toBeDefined();
    expect(container.textContent).not.toContain('line 1');

    fireEvent.click(screen.getByText('Show full log'));

    expect(container.textContent).toContain('line 1');
  });

  it('labels replayed thinking logs without inventing a duration', () => {
    render(
      <MessageBubble
        message={thinkingMessage({
          iteration: 1,
          text: 'replayed reasoning',
          durationMs: 0,
          replayed: true,
        })}
        isFirst
      />,
    );

    expect(screen.getByText('iter 1 · replay · 1 line')).toBeDefined();
  });

  it('hides and restores a thinking-only bubble without changing hook count', async () => {
    render(<MessageBubble message={thinkingMessage()} isFirst />);
    expect(screen.getByText('Model Reasoning')).toBeDefined();

    await act(async () => {
      useLocalPrefs.getState().set({ showThinkingLogs: false });
    });
    expect(screen.queryByText('Model Reasoning')).toBeNull();

    await act(async () => {
      useLocalPrefs.getState().set({ showThinkingLogs: true });
    });
    expect(screen.getByText('Model Reasoning')).toBeDefined();
  });

  it('expands when the active search hit is inside hidden thinking text', async () => {
    useUIStore.setState({
      searchOpen: true,
      searchQuery: 'line 1',
      searchActiveMessageId: 'thinking_1',
    });

    const { container } = render(<MessageBubble message={thinkingMessage()} isFirst />);

    await waitFor(() => expect(container.textContent).toContain('line 1'));
  });
});
