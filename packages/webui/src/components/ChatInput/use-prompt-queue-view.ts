import { useCallback, useMemo } from 'react';
import {
  clearServerQueue,
  removeServerQueuedPrompt,
} from '@/hooks/ws-handlers/prompt-queue-handlers';
import { useChatStore } from '@/stores';
import type { QueuedItem } from '@/stores/chat-store-types';

/**
 * The queue as the chips and the queue panel show it: this lane's local items
 * (btw notes, and everything on a server without a session queue) followed by
 * the prompts the server holds for the session. Removing or clearing goes to
 * whoever owns the item.
 */
export function usePromptQueueView(): {
  queue: QueuedItem[];
  remove: (index: number) => void;
  clear: () => void;
} {
  const local = useChatStore((s) => s.queue);
  const server = useChatStore((s) => s.serverQueue);
  const sessionId = useChatStore((s) => s.boundSessionId);
  const removeQueued = useChatStore((s) => s.removeQueued);
  const clearQueue = useChatStore((s) => s.clearQueue);

  const queue = useMemo(
    () =>
      server.length === 0
        ? local
        : [
            ...local,
            ...server.map(
              (item, i): QueuedItem => ({
                text:
                  item.imageCount > 0
                    ? `${item.text} (+${item.imageCount} image${item.imageCount === 1 ? '' : 's'})`
                    : item.text,
                mode: 'queue',
                addedAt: item.addedAt,
                // Negative: never collides with a local item's id.
                itemId: -(i + 1),
              }),
            ),
          ],
    [local, server],
  );

  const remove = useCallback(
    (index: number) => {
      if (index < local.length) {
        removeQueued(index);
        return;
      }
      const item = server[index - local.length];
      if (item && sessionId) removeServerQueuedPrompt(sessionId, item.id);
    },
    [local.length, server, sessionId, removeQueued],
  );

  const clear = useCallback(() => {
    clearQueue();
    if (server.length > 0 && sessionId) clearServerQueue(sessionId);
  }, [clearQueue, server.length, sessionId]);

  return { queue, remove, clear };
}
