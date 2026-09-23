import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { messageSearchText, SearchOverlay } from '../../src/components/SearchOverlay';
import type { ChatMessage } from '../../src/stores';
import { useChatStore, useUIStore } from '../../src/stores';

function msg(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm1',
    role: 'assistant',
    content: '',
    timestamp: 1_700_000_000_000,
    ...overrides,
  };
}

import { i18n } from '../../src/i18n';

describe('messageSearchText', () => {
  // Pin the language before rendering: the component renders t()-derived
  // labels, and an unpinned translator can race initialization into raw keys.
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  it('includes archived thinking log text', () => {
    const text = messageSearchText(
      msg({
        role: 'system',
        thinkingLog: {
          iteration: 3,
          text: 'hidden reasoning needle',
          startedAt: 1_700_000_000_000,
          durationMs: 500,
        },
      }),
    );

    expect(text).toContain('hidden reasoning needle');
  });

  it('keeps tool name, input, and output searchable', () => {
    const text = messageSearchText(
      msg({
        role: 'tool',
        toolName: 'bash',
        toolInput: { command: 'pnpm test' },
        toolResult: 'passed',
      }),
    );

    expect(text).toContain('bash');
    expect(text).toContain('pnpm test');
    expect(text).toContain('passed');
  });
});

describe('SearchOverlay thinking log hits', () => {
  it('publishes the active thinking-log hit id for message rendering', async () => {
    useChatStore.setState({
      messages: [
        msg({
          id: 'thinking-hit',
          role: 'system',
          thinkingLog: {
            iteration: 1,
            text: 'archived hidden needle',
            startedAt: 1_700_000_000_000,
            durationMs: 100,
          },
        }),
      ],
    });
    useUIStore.setState({
      searchOpen: true,
      searchQuery: 'needle',
      searchActiveMessageId: null,
      scrollTarget: null,
    });

    render(<SearchOverlay />);

    await waitFor(() => {
      expect(useUIStore.getState().searchActiveMessageId).toBe('thinking-hit');
    });
  });
});
