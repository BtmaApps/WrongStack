/**
 * Reconnect catch-up for `session.subscribe`.
 *
 * A page that reconnects re-declares its tabs and, for each one, the sequence
 * number of the last frame it applied (`cursors`, with the `eventEpoch` it got
 * from this server's `session.start`). When the frame log still covers the gap,
 * the missed frames are sent back in order and the tab keeps everything it was
 * showing: the half-streamed answer, the running tool cards, the run state.
 * Otherwise the tab is answered `resumed: false` and gets the transcript replay
 * every reconnect used to get.
 */
import type { WebSocket } from 'ws';
import { webuiSessionFrameLog } from './session-frame-log.js';
import { send, sendSerialized } from './ws-utils.js';

/** The cursors of a `session.subscribe` payload; malformed entries are ignored. */
export function readFrameCursors(payload: {
  cursors?: unknown;
  eventEpoch?: unknown;
}): { epoch: string; cursors: Map<string, number> } | null {
  if (typeof payload.eventEpoch !== 'string' || !payload.eventEpoch) return null;
  const raw = payload.cursors;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const cursors = new Map<string, number>();
  for (const [id, seq] of Object.entries(raw as Record<string, unknown>)) {
    if (id && typeof seq === 'number' && Number.isInteger(seq) && seq >= 0) cursors.set(id, seq);
  }
  return { epoch: payload.eventEpoch, cursors };
}

/**
 * Answer every declared tab that sent a cursor, and return the ids that were
 * caught up (they need no transcript replay). Each answer is a
 * `session.frames_resumed` frame after the missed frames, so the page knows
 * when its catch-up is complete.
 */
export function resumeSessionFrames(
  ws: WebSocket,
  declared: Iterable<string>,
  request: { epoch: string; cursors: Map<string, number> },
): Set<string> {
  const log = webuiSessionFrameLog();
  const resumed = new Set<string>();
  for (const sessionId of declared) {
    const cursor = request.cursors.get(sessionId);
    if (cursor === undefined) continue;
    const frames = request.epoch === log.epoch ? log.since(sessionId, cursor) : null;
    if (frames) {
      for (const frame of frames) sendSerialized(ws, frame);
      resumed.add(sessionId);
    }
    send(ws, {
      type: 'session.frames_resumed',
      payload: {
        sessionId,
        resumed: frames !== null,
        ...(frames ? { frames: frames.length } : {}),
      },
    });
  }
  return resumed;
}
