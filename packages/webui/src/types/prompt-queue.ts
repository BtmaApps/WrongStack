import type { SessionScopedPayload, WSUserMessageImage } from './protocol-core.js';

/**
 * The host-owned prompt queue (`session.prompt-queue` capability): prompts
 * queued for a session live on the server, which runs them one after another
 * as the session's turns end — whether or not this page is still open.
 */

/** One queued prompt as the server lists it (image bytes stay on the server). */
export interface WSQueuedPromptView {
  id: string;
  text: string;
  addedAt: number;
  imageCount: number;
}

export type WSPromptQueueClientMessage =
  | {
      type: 'queue.add';
      payload: SessionScopedPayload & { text: string; images?: WSUserMessageImage[] | undefined };
    }
  | { type: 'queue.remove'; payload: SessionScopedPayload & { id: string } }
  | { type: 'queue.clear'; payload?: SessionScopedPayload }
  | { type: 'queue.get'; payload?: SessionScopedPayload };

/** The session's whole queue, after every change. */
export interface WSQueueState {
  type: 'queue.state';
  payload: SessionScopedPayload & { items: WSQueuedPromptView[] };
}

/** A queued prompt just started its turn: render it as the user's message. */
export interface WSQueueDrained {
  type: 'queue.drained';
  payload: SessionScopedPayload & {
    item: {
      id: string;
      text: string;
      addedAt: number;
      images?: Array<{ data: string; mediaType?: string | undefined; name?: string | undefined }>;
    };
  };
}
