import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ws-client', () => ({
  getWSClient: () => ({ send: vi.fn(), listSavedProviders: vi.fn() }),
}));

vi.mock('@/components/Toaster', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { WS_HANDLERS } from '../../src/hooks/ws-handlers';
import { useChatStore } from '../../src/stores/chat-store';
import { useConfigStore } from '../../src/stores/config-store';

describe('model switch ws handler', () => {
  beforeEach(() => {
    useChatStore.getState().clearMessages();
  });

  it('updates the visible identity without posting anything into the conversation', () => {
    WS_HANDLERS['model.switch_result']?.({
      type: 'model.switch_result',
      payload: {
        requestId: 'switch-1',
        success: true,
        message: 'Switched',
        previousProvider: 'openai',
        previousModel: 'gpt-old',
        provider: 'anthropic',
        model: 'claude-new',
        runActive: true,
      },
    });

    expect(useConfigStore.getState()).toMatchObject({
      provider: 'anthropic',
      model: 'claude-new',
    });
    // Switching the model is a UI event. It used to append a system message
    // to the transcript, which dropped a "Model switched: …" bubble into the
    // middle of the conversation, where it read as something the agent had
    // said. The switch is reported by a toast instead.
    expect(useChatStore.getState().messages).toHaveLength(0);
  });
});
