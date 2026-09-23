/**
 * Server-owned prompt queue: prompts a user queued for a session to run after
 * the current turn.
 *
 * The queue used to live in the browser tab (localStorage) and drained on the
 * `run.result` that tab received, so it only advanced while that one tab was
 * open and connected, and no other tab or device could see it. Here the host
 * that owns the run owns the queue: it drains when the session's run ends
 * whether or not any page is watching, every page showing the session sees the
 * same list (`queue.state`), and it is persisted per session so a host restart
 * resumes it the next time the session is opened.
 */
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import { QUEUE_MAX_BYTES, QUEUE_MAX_ITEM_BYTES, QUEUE_MAX_ITEMS } from '@wrongstack/core/storage';
import {
  atomicWrite,
  type IncomingImagePayload,
  parseIncomingImages,
  toErrorMessage,
} from '@wrongstack/core/utils';

export interface QueuedPrompt {
  id: string;
  text: string;
  addedAt: number;
  images?: IncomingImagePayload[] | undefined;
}

/** What a page renders: the prompt without its image bytes. */
export interface QueuedPromptView {
  id: string;
  text: string;
  addedAt: number;
  imageCount: number;
}

type OutboundMessage = { type: string; payload: unknown };

export interface SessionPromptQueueDeps {
  /** Directory holding one `<sessionId>.json` per session with a queue; undefined keeps it in memory. */
  dir?: string | undefined;
  /** True while the session holds its run lock. */
  isBusy: (sessionId: string) => boolean;
  /**
   * Start a turn for a drained prompt through the host's one turn path.
   * `onStart` runs synchronously once the turn holds the run lock and before
   * the run emits anything. Resolves `true` once the run started, `false` when
   * the session was busy or not ready — the prompt then keeps its place.
   */
  startTurn: (sessionId: string, prompt: QueuedPrompt, onStart: () => void) => Promise<boolean>;
  /** Session-scoped broadcast to every page showing the session. */
  broadcast: (message: OutboundMessage) => void;
  warn?: ((message: string) => void) | undefined;
}

export type AddPromptResult = { ok: true; item: QueuedPrompt } | { ok: false; reason: string };

export interface SessionPromptQueue {
  add(
    sessionId: string,
    prompt: { text: string; images?: IncomingImagePayload[] },
  ): Promise<AddPromptResult>;
  remove(sessionId: string, id: string): Promise<boolean>;
  clear(sessionId: string): Promise<number>;
  /** Current items; the first read of a session loads what a previous host persisted. */
  list(sessionId: string): Promise<QueuedPrompt[]>;
  /** Start the front prompt if the session is idle. Safe to call at any time. */
  drain(sessionId: string): Promise<void>;
}

/**
 * The queue directory for a project: a sibling of its sessions directory, so
 * nothing that walks the sessions tree ever meets a non-session entry.
 */
export function promptQueueDirFor(sessionsDir: string | undefined): string | undefined {
  return sessionsDir ? path.join(path.dirname(sessionsDir), 'prompt-queue') : undefined;
}

/** Longest session id persisted; a longer one stays in memory only. */
const MAX_SESSION_ID_CHARS = 200;

/**
 * The file a session's queue lives in. Session ids are date-scoped
 * (`2026-09-23/sess_…`), so every character outside a plain file-name set is
 * escaped (`/` → `%2f`): the name stays one path segment, unique per id, and
 * can never climb out of the queue directory.
 */
function queueFileName(sessionId: string): string | undefined {
  if (!sessionId || sessionId.length > MAX_SESSION_ID_CHARS) return undefined;
  const escaped = sessionId.replace(
    /[^A-Za-z0-9_-]/g,
    (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`,
  );
  return `${escaped}.json`;
}

let idCounter = 0;
function nextId(): string {
  idCounter = (idCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `q-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

function bytesOf(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function promptView(item: QueuedPrompt): QueuedPromptView {
  return {
    id: item.id,
    text: item.text,
    addedAt: item.addedAt,
    imageCount: item.images?.length ?? 0,
  };
}

function isQueuedPrompt(value: unknown): value is QueuedPrompt {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['id'] === 'string' &&
    typeof v['text'] === 'string' &&
    typeof v['addedAt'] === 'number' &&
    (v['images'] === undefined || Array.isArray(v['images']))
  );
}

export function createSessionPromptQueue(deps: SessionPromptQueueDeps): SessionPromptQueue {
  const queues = new Map<string, QueuedPrompt[]>();
  const loading = new Map<string, Promise<QueuedPrompt[]>>();
  /** Sessions with a drain in progress — one turn start at a time per session. */
  const draining = new Set<string>();
  /** Serialises file writes per session so an older snapshot never lands last. */
  const writes = new Map<string, Promise<void>>();

  const fileFor = (sessionId: string): string | undefined => {
    const name = queueFileName(sessionId);
    return deps.dir && name ? path.join(deps.dir, name) : undefined;
  };

  const load = (sessionId: string): Promise<QueuedPrompt[]> => {
    const known = queues.get(sessionId);
    if (known) return Promise.resolve(known);
    const pending = loading.get(sessionId);
    if (pending) return pending;
    const file = fileFor(sessionId);
    const read = (async (): Promise<QueuedPrompt[]> => {
      let items: QueuedPrompt[] = [];
      if (file) {
        try {
          const stat = await fsp.stat(file);
          if (stat.size <= QUEUE_MAX_BYTES) {
            const parsed: unknown = JSON.parse(await fsp.readFile(file, 'utf8'));
            if (Array.isArray(parsed))
              items = parsed.filter(isQueuedPrompt).slice(0, QUEUE_MAX_ITEMS);
          } else {
            deps.warn?.(`prompt queue for ${sessionId} exceeds ${QUEUE_MAX_BYTES} bytes; ignored`);
          }
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            deps.warn?.(`prompt queue for ${sessionId} unreadable: ${toErrorMessage(err)}`);
          }
        }
      }
      // A mutation that raced the read already created the live list.
      const live = queues.get(sessionId);
      if (live) return live;
      queues.set(sessionId, items);
      return items;
    })().finally(() => loading.delete(sessionId));
    loading.set(sessionId, read);
    return read;
  };

  const persist = (sessionId: string): Promise<void> => {
    const file = fileFor(sessionId);
    if (!file) return Promise.resolve();
    const previous = writes.get(sessionId) ?? Promise.resolve();
    const next = previous
      .then(async () => {
        const items = queues.get(sessionId) ?? [];
        if (items.length === 0) {
          await fsp.rm(file, { force: true });
          return;
        }
        await fsp.mkdir(path.dirname(file), { recursive: true });
        await atomicWrite(file, JSON.stringify(items), { mode: 0o600 });
      })
      .catch((err) =>
        deps.warn?.(`prompt queue for ${sessionId} not saved: ${toErrorMessage(err)}`),
      );
    writes.set(sessionId, next);
    void next.finally(() => {
      if (writes.get(sessionId) === next) writes.delete(sessionId);
    });
    return next;
  };

  const publish = (sessionId: string): void => {
    deps.broadcast({
      type: 'queue.state',
      payload: { sessionId, items: (queues.get(sessionId) ?? []).map(promptView) },
    });
  };

  const changed = async (sessionId: string): Promise<void> => {
    publish(sessionId);
    await persist(sessionId);
  };

  const drain = async (sessionId: string): Promise<void> => {
    if (draining.has(sessionId)) return;
    draining.add(sessionId);
    try {
      const items = await load(sessionId);
      const front = items[0];
      if (!front || deps.isBusy(sessionId)) return;
      items.shift();
      let started = false;
      try {
        started = await deps.startTurn(sessionId, front, () => {
          // Pages add the user bubble from this, ahead of the run's own events.
          deps.broadcast({ type: 'queue.drained', payload: { sessionId, item: front } });
          publish(sessionId);
        });
      } catch (err) {
        deps.warn?.(`queued prompt for ${sessionId} failed to start: ${toErrorMessage(err)}`);
      }
      if (!started) {
        // Lost the lock (another turn got there first) or the session is not
        // open yet: the prompt keeps its place and runs after that turn.
        items.unshift(front);
        return;
      }
      await persist(sessionId);
    } finally {
      draining.delete(sessionId);
    }
  };

  return {
    async add(sessionId, prompt) {
      const text = prompt.text.trim();
      const images = prompt.images?.length ? prompt.images : undefined;
      if (!text && !images) return { ok: false, reason: 'A queued prompt needs text or an image.' };
      const items = await load(sessionId);
      if (items.length >= QUEUE_MAX_ITEMS) {
        return { ok: false, reason: `The queue is full (${QUEUE_MAX_ITEMS} prompts).` };
      }
      const item: QueuedPrompt = {
        id: nextId(),
        text,
        addedAt: Date.now(),
        ...(images ? { images } : {}),
      };
      const itemBytes = bytesOf(item);
      if (itemBytes > QUEUE_MAX_ITEM_BYTES) {
        return { ok: false, reason: 'This prompt is too large to queue.' };
      }
      if (bytesOf(items) + itemBytes > QUEUE_MAX_BYTES) {
        return { ok: false, reason: 'The queue is full; remove a prompt first.' };
      }
      items.push(item);
      await changed(sessionId);
      // Queued while idle: nothing will end to drain it, so start it now.
      void drain(sessionId);
      return { ok: true, item };
    },

    async remove(sessionId, id) {
      const items = await load(sessionId);
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) return false;
      items.splice(index, 1);
      await changed(sessionId);
      return true;
    },

    async clear(sessionId) {
      const items = await load(sessionId);
      const count = items.length;
      if (count === 0) {
        publish(sessionId);
        return 0;
      }
      items.length = 0;
      await changed(sessionId);
      return count;
    },

    list: load,
    drain,
  };
}

type QueueReply = (message: OutboundMessage) => void;

/**
 * Serve one `queue.*` client message for `sessionId`. Changes reach every page
 * showing the session through the queue's own `queue.state` broadcast; the
 * asking page gets a direct answer only for `queue.get` and for a refusal.
 */
export async function handlePromptQueueMessage(
  queue: SessionPromptQueue,
  request: { sessionId: string; type: string; payload: unknown; reply: QueueReply },
): Promise<void> {
  const { sessionId, reply } = request;
  const payload = (
    request.payload && typeof request.payload === 'object' ? request.payload : {}
  ) as Record<string, unknown>;
  const refuse = (message: string): void =>
    reply({ type: 'error', payload: { sessionId, phase: request.type, message } });

  switch (request.type) {
    case 'queue.get': {
      const items = await queue.list(sessionId);
      reply({ type: 'queue.state', payload: { sessionId, items: items.map(promptView) } });
      // A page opening the session is the resume point: whatever a previous
      // host left queued runs now if nothing else is.
      void queue.drain(sessionId);
      return;
    }
    case 'queue.add': {
      const text = typeof payload['text'] === 'string' ? payload['text'] : '';
      const raw = Array.isArray(payload['images'])
        ? (payload['images'] as IncomingImagePayload[])
        : undefined;
      let images: IncomingImagePayload[] | undefined;
      try {
        // Validated now, so a bad image is refused while the user is here —
        // not when the prompt drains and nobody is watching.
        if (raw && parseIncomingImages(raw).length > 0) images = raw;
      } catch (err) {
        refuse(toErrorMessage(err));
        return;
      }
      const result = await queue.add(sessionId, { text, ...(images ? { images } : {}) });
      if (!result.ok) refuse(result.reason);
      return;
    }
    case 'queue.remove': {
      if (typeof payload['id'] === 'string') await queue.remove(sessionId, payload['id']);
      return;
    }
    case 'queue.clear':
      await queue.clear(sessionId);
      return;
  }
}
