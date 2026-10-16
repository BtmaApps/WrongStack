import type { useAppTranslation } from '@/i18n';
import { getWSClient } from '@/lib/ws-client';
import { useChatStore } from '@/stores';
import type { ChatState } from '@/stores/chat-store-types';
import { fillInput } from '../NextStepsBar';
import { toast } from '../Toaster';

interface MessageBubbleSubmitInput {
  wsUrl: string;
  t: ReturnType<typeof useAppTranslation>['t'];
  addMessage: ChatState['addMessage'];
  setLoading: ChatState['setLoading'];
  canAutoSubmit: () => boolean;
  capWarned: boolean;
  recordPrompt: (text: string) => boolean;
  recordAutoSubmit: () => void;
}

/** The next-steps submit paths of one bubble: countdown auto-submit and batch. */
export function createMessageBubbleSubmitters({
  wsUrl,
  t,
  addMessage,
  setLoading,
  canAutoSubmit,
  capWarned,
  recordPrompt,
  recordAutoSubmit,
}: MessageBubbleSubmitInput) {
  /** Auto-submit callback for YOLO+auto mode countdown completion */
  const handleAutoSubmit = (text: string) => {
    if (useChatStore.getState().isLoading) return;
    if (!canAutoSubmit()) {
      // Cap already hit — show a one-time warning and stop.
      if (!capWarned) {
        addMessage({
          role: 'assistant',
          content: t('activity:message.autoPaused'),
        });
      }
      return;
    }
    const client = getWSClient(wsUrl);
    if (!client.isConnected) {
      toast.error(t('common:status.notConnectedRetry'));
      return;
    }
    // Record at the final automatic-submission boundary. All MessageBubble
    // instances share one session guard through useAutoSubmitStreak().
    if (!recordPrompt(text)) {
      addMessage({
        role: 'assistant',
        content: t('activity:message.autoLoopHalted'),
      });
      fillInput('');
      return;
    }
    recordAutoSubmit();
    addMessage({ role: 'user', content: text });
    setLoading(true);
    client.sendMessage(text);
    // Clear the input field after auto-submitting, matching the behaviour
    // of the normal form submission path in ChatInput.
    fillInput('');
  };

  /** Batch-submit callback for multi-select: joins selected step texts and
   *  sends as a single user message, bypassing the refine/enhance panel. */
  const handleBatchSubmit = (texts: string[]) => {
    if (useChatStore.getState().isLoading) return;
    const combined = texts.join('\n');
    const client = getWSClient(wsUrl);
    if (!client.isConnected) {
      toast.error(t('common:status.notConnectedRetry'));
      return;
    }
    addMessage({ role: 'user', content: combined });
    setLoading(true);
    client.sendMessage(combined);
    fillInput('');
  };

  return { handleAutoSubmit, handleBatchSubmit };
}
