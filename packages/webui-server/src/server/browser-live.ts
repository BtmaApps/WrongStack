/**
 * Read-only live view of the agent's browser for the WebUI.
 *
 *   browser.live.list    → the tab's open browser sessions
 *   browser.live.watch   → frames (`browser.live.frame`) and, every 1.5 s,
 *                          URL/title/console/network (`browser.live.details`)
 *   browser.live.unwatch → stop
 *
 * Frames come from the session's CDP screencast (tools browser/manager.ts),
 * which sends one when the page changes. A socket watches one session at a
 * time. Frames are sent at most ten a second, the newest winning, and are
 * held back while the socket's send buffer is full: `sendSerialized`
 * terminates a socket past 32 MB buffered, and a screencast can outrun a slow
 * link. Nothing sent here reaches the page.
 *
 * A tab sees only the sessions its own conversation opened, as for processes.
 */
import { toErrorMessage } from '@wrongstack/core/utils';
import { liveBrowser } from '@wrongstack/tools';
import type { WebSocket } from 'ws';
import type { WSClientMessage } from './types.js';
import { messageSessionId, send, sendResult } from './ws-utils.js';

const FRAME_INTERVAL_MS = 100;
const DETAILS_INTERVAL_MS = 1500;
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;
const ENTRY_LIMIT = 40;

interface Watch {
  id: string;
  stop: () => Promise<void>;
}

const watches = new WeakMap<WebSocket, Watch>();

function stamp(sessionId: string | undefined) {
  return sessionId ? { sessionId } : {};
}

async function tabSessions(projectRoot: string, sessionId: string | undefined) {
  const sessions = await liveBrowser.sessions(projectRoot);
  return sessions.filter((s) => !sessionId || s.conversationId === sessionId);
}

export async function handleBrowserLiveList(
  ws: WebSocket,
  message: WSClientMessage,
  projectRoot: string,
): Promise<void> {
  const sessionId = messageSessionId(message);
  const sessions = await tabSessions(projectRoot, sessionId).catch(() => []);
  send(ws, {
    type: 'browser.live.list',
    payload: {
      sessions: sessions.map(({ id, ownerId, url, title, createdAt, lastUsedAt }) => ({
        id,
        ownerId,
        url,
        title,
        createdAt,
        lastUsedAt,
      })),
      ...stamp(sessionId),
    },
  });
}

export async function handleBrowserLiveUnwatch(ws: WebSocket): Promise<void> {
  const watch = watches.get(ws);
  watches.delete(ws);
  await watch?.stop();
}

export async function handleBrowserLiveWatch(
  ws: WebSocket,
  message: WSClientMessage,
  projectRoot: string,
): Promise<void> {
  const sessionId = messageSessionId(message);
  const payload = message.payload as { id?: unknown } | undefined;
  const id = typeof payload?.id === 'string' ? payload.id : undefined;
  if (!id) {
    sendResult(ws, false, 'browser.live.watch payload.id must be a browser session id');
    return;
  }
  await handleBrowserLiveUnwatch(ws);
  const sessions = await tabSessions(projectRoot, sessionId).catch(() => []);
  if (!sessions.some((s) => s.id === id)) {
    sendResult(ws, false, `Browser session ${id} is not open in this session`);
    return;
  }

  let pending: { data: string; width: number; height: number } | undefined;
  let lastSent = 0;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const flush = () => {
    flushTimer = undefined;
    if (stopped || !pending) return;
    const wait = FRAME_INTERVAL_MS - (Date.now() - lastSent);
    if (wait > 0 || ws.bufferedAmount > MAX_BUFFERED_BYTES) {
      flushTimer = setTimeout(flush, Math.max(wait, FRAME_INTERVAL_MS));
      return;
    }
    const frame = pending;
    pending = undefined;
    lastSent = Date.now();
    send(ws, { type: 'browser.live.frame', payload: { id, ...frame, ...stamp(sessionId) } });
  };

  const sendDetails = async (): Promise<boolean> => {
    const details = await liveBrowser.details(projectRoot, id, ENTRY_LIMIT).catch(() => undefined);
    if (stopped) return false;
    send(ws, {
      type: 'browser.live.details',
      payload: details
        ? { id, ...details, ...stamp(sessionId) }
        : { id, gone: true, ...stamp(sessionId) },
    });
    return details !== undefined;
  };

  let stopScreencast: (() => Promise<void>) | undefined;
  const detailsTimer = setInterval(() => {
    void sendDetails().then((open) => {
      if (!open && watches.get(ws) === watch) void handleBrowserLiveUnwatch(ws);
    });
  }, DETAILS_INTERVAL_MS);
  const watch: Watch = {
    id,
    stop: async () => {
      stopped = true;
      clearInterval(detailsTimer);
      if (flushTimer) clearTimeout(flushTimer);
      await stopScreencast?.().catch(() => undefined);
    },
  };
  watches.set(ws, watch);
  ws.once?.('close', () => {
    if (watches.get(ws) === watch) void handleBrowserLiveUnwatch(ws);
  });

  try {
    stopScreencast = await liveBrowser.watch(projectRoot, id, (frame) => {
      pending = frame;
      if (!flushTimer) flush();
    });
  } catch (err) {
    if (watches.get(ws) === watch) await handleBrowserLiveUnwatch(ws);
    sendResult(ws, false, toErrorMessage(err));
    return;
  }
  if (stopped) await stopScreencast();
  else await sendDetails();
}
