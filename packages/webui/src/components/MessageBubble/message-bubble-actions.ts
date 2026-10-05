import { expectDefined } from '@wrongstack/core/utils/expect-defined';
import type { useAppTranslation } from '@/i18n';
import { getWSClient } from '@/lib/ws-client';
import type { ChatMessage } from '@/stores';
import { useChatStore } from '@/stores';
import { toWireImages } from '../ChatInput/image-attachments.js';
import { toast } from '../Toaster';

interface CreateMessageBubbleActionsInput {
  wsUrl: string;
  t: ReturnType<typeof useAppTranslation>['t'];
  message: import('../../stores/types.js').ChatMessage;
  truncateAfter: (id: string) => void;
  updateMessage: (
    id: string,
    updates: Partial<import('../../stores/types.js').ChatMessage>,
  ) => void;
  setLoading: (loading: boolean) => void;
  setEditValue: React.Dispatch<React.SetStateAction<string>>;
  setEditing: React.Dispatch<React.SetStateAction<boolean>>;
  editValue: string;
}

export function createMessageBubbleActions({
  wsUrl,
  t,
  message,
  truncateAfter,
  updateMessage,
  setLoading,
  setEditValue,
  setEditing,
  editValue,
}: CreateMessageBubbleActionsInput) {
  /** Attachments of a user message that can still be resent — only those
   *  whose data URL survived (persistence strips it, so after a refresh a
   *  regenerate/edit resend degrades to text-only, matching the placeholder
   *  chip the bubble already shows). */
  const resendableAttachments = (msg: ChatMessage) =>
    (msg.attachments ?? []).flatMap((a) =>
      a.dataUrl
        ? [{ id: a.id, dataUrl: a.dataUrl, mediaType: a.mediaType, bytes: a.bytes, name: a.name }]
        : [],
    );

  const retryUserMessage = () => {
    const client = getWSClient(wsUrl);
    if (!client.isConnected) {
      toast.error(t('common:status.notConnectedRetry'));
      return;
    }
    const atts = resendableAttachments(message);
    truncateAfter(message.id);
    updateMessage(message.id, { status: undefined });
    setLoading(true);
    client.sendMessage(message.content, atts.length > 0 ? toWireImages(atts) : undefined);
  };

  const regenerate = () => {
    const all = useChatStore.getState().messages;
    const idx = all.findIndex((m) => m.id === message.id);
    if (idx === -1) return;
    let userIdx = -1;
    for (let i = idx - 1; i >= 0; i--) {
      if (all[i]?.role === 'user') {
        userIdx = i;
        break;
      }
    }
    if (userIdx === -1) return;
    const client = getWSClient(wsUrl);
    if (!client.isConnected) {
      toast.error(t('common:status.notConnectedRetry'));
      return;
    }
    const userMsg = expectDefined(all[userIdx]);
    const atts = resendableAttachments(userMsg);
    truncateAfter(userMsg.id);
    updateMessage(userMsg.id, { status: undefined });
    setLoading(true);
    client.sendMessage(userMsg.content, atts.length > 0 ? toWireImages(atts) : undefined);
  };

  const startEdit = () => {
    setEditValue(message.content);
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setEditValue('');
  };
  const saveEdit = () => {
    const next = editValue.trim();
    if (!next) {
      cancelEdit();
      return;
    }
    const client = getWSClient(wsUrl);
    if (!client.isConnected) {
      toast.error(t('common:status.notConnectedRetry'));
      return;
    }
    const atts = resendableAttachments(message);
    truncateAfter(message.id);
    updateMessage(message.id, {
      content: next,
      status: undefined,
      ...(atts.length > 0
        ? { attachments: atts.map((a) => ({ ...a, kind: 'image' as const })) }
        : {}),
    });
    setLoading(true);
    client.sendMessage(next, atts.length > 0 ? toWireImages(atts) : undefined);
    setEditing(false);
    setEditValue('');
  };
  return { retryUserMessage, regenerate, startEdit, cancelEdit, saveEdit };
}
