/**
 * The server-owned prompt queue, client side.
 *
 * When the server advertises `session.prompt-queue`, a prompt queued with
 * mode `queue` is handed to the server instead of the lane's local queue. The
 * server runs it when the session's turn ends — whether or not this page is
 * still open — and every page showing the session gets the same list through
 * `queue.state`. The lane keeps that list in `serverQueue` for display only;
 * the local drain on `run.result` never touches it.
 */
import { toWireImages } from '@/components/ChatInput/image-attachments';
import { getWSClient } from '@/lib/ws-client';
import { chatFor } from '@/lib/ws-client-utils';
import { useConfigStore } from '@/stores';
import type { ChatLaneActions } from '@/stores/chat-lane-data';
import { setRemotePromptQueue } from '@/stores/chat-queue-helpers';
import type { QueuedItem } from '@/stores/chat-store-types';
import type { WSServerMessage } from '@/types';
import type { WSQueueDrained, WSQueueState } from '@/types/prompt-queue';

const CAPABILITY = 'session.prompt-queue';

function client() {
  return getWSClient(useConfigStore.getState().wsUrl);
}

/** Queue a prompt on the server; false when this server or connection cannot. */
function queuePromptOnServer(
  sessionId: string,
  text: string,
  images: QueuedItem['images'],
): boolean {
  const ws = client();
  if (!ws.isConnected || !ws.supportsCapability(CAPABILITY)) return false;
  return ws.send({
    type: 'queue.add',
    payload: { sessionId, text, ...(images?.length ? { images: toWireImages(images) } : {}) },
  });
}

setRemotePromptQueue(queuePromptOnServer);

export function removeServerQueuedPrompt(sessionId: string, id: string): void {
  client().send({ type: 'queue.remove', payload: { sessionId, id } });
}

export function clearServerQueue(sessionId: string): void {
  client().send({ type: 'queue.clear', payload: { sessionId } });
}

/**
 * Ask for a session's queue when the session starts on this connection — the
 * moment the capability is known. Opening the session is also the server's cue
 * to run whatever a previous host left queued.
 */
export function requestPromptQueue(msg: WSServerMessage): void {
  const sessionId = (msg.payload as { sessionId?: unknown } | undefined)?.sessionId;
  const ws = client();
  if (typeof sessionId !== 'string' || !sessionId || !ws.supportsCapability(CAPABILITY)) return;
  ws.send({ type: 'queue.get', payload: { sessionId } });
}

/**
 * Prompts this lane queued locally before the server took over queues (they
 * persist in the browser) move to the server once, so the two queues never
 * both try to start a turn when a run ends.
 */
function moveLocalQueueToServer(lane: ChatLaneActions): void {
  const local = lane.queue.filter((q) => q.mode === 'queue' && q.alreadyDispatched !== true);
  if (local.length === 0) return;
  const moved = new Set<QueuedItem>();
  for (const item of local) {
    if (!queuePromptOnServer(lane.sessionId, item.text, item.images)) break;
    moved.add(item);
  }
  if (moved.size > 0) lane.patch({ queue: lane.queue.filter((q) => !moved.has(q)) });
}

function handleQueueState(msg: WSServerMessage): void {
  const lane = chatFor(msg);
  if (!lane) return;
  const { items } = (msg as WSQueueState).payload;
  lane.patch({ serverQueue: Array.isArray(items) ? items : [] });
  moveLocalQueueToServer(lane);
}

/** A queued prompt started its turn: it becomes the user's message in the transcript. */
function handleQueueDrained(msg: WSServerMessage): void {
  const lane = chatFor(msg);
  if (!lane) return;
  const { item } = (msg as WSQueueDrained).payload;
  const images = item.images ?? [];
  lane.addMessage({
    role: 'user',
    content: item.text,
    ...(images.length > 0
      ? {
          attachments: images.map((img, i) => {
            const mediaType = img.mediaType ?? 'image/png';
            return {
              id: `${item.id}-${i}`,
              kind: 'image' as const,
              dataUrl: `data:${mediaType};base64,${img.data}`,
              mediaType,
              bytes: Math.floor((img.data.length * 3) / 4),
              ...(img.name ? { name: img.name } : {}),
            };
          }),
        }
      : {}),
  });
  lane.setLoading(true);
}

export const promptQueueHandlerMap = {
  'queue.state': handleQueueState,
  'queue.drained': handleQueueDrained,
} satisfies Partial<Record<WSServerMessage['type'], (msg: WSServerMessage) => void>>;
