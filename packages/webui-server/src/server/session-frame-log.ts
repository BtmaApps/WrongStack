/**
 * Per-session sequence numbers for broadcast frames, with a bounded log of
 * the recent ones so a reconnecting page can catch up instead of rebuilding.
 *
 * A socket that drops mid-turn used to lose every frame broadcast while it was
 * down. The page then asked for a transcript replay, which is rebuilt from the
 * journal and so holds only COMMITTED messages: the half-streamed answer, the
 * running tool cards and the run state were gone, and the deltas that kept
 * arriving were appended to whatever the replay left. With a sequence number
 * on every session frame, the page sends the last one it applied, and the
 * server sends exactly the frames after it.
 *
 * The log is bounded per session and across sessions. A gap it can no longer
 * cover answers `null`, and the caller falls back to the transcript replay,
 * which is what every reconnect did before. The epoch is fixed per process: a
 * cursor from another server process can never be resumed.
 */
import { randomBytes } from 'node:crypto';

export interface SessionFrameLog {
  /** Identifies this process's numbering; cursors from another epoch never resume. */
  readonly epoch: string;
  /**
   * Stamp the next sequence number of `sessionId` onto `msg`, record the
   * frame, and return it serialized. `stream` is written onto the frame only
   * when the payload names a different session (a subagent's frame delivered
   * to its owning tab), so the page can tell which counter it advances.
   */
  sequence(sessionId: string, msg: object): string;
  /**
   * Frames recorded after `afterSeq`, oldest first. `null` when they can no
   * longer all be supplied: evicted, or a cursor this log never issued.
   */
  since(sessionId: string, afterSeq: number): string[] | null;
}

interface SessionLog {
  next: number;
  frames: { seq: number; data: string; bytes: number }[];
  bytes: number;
}

/** Frames kept per session. */
const MAX_FRAMES = 4_000;
/** Serialized bytes kept per session. */
const MAX_BYTES = 4 * 1024 * 1024;
/** Sessions kept; the least recently written one is dropped first. */
const MAX_SESSIONS = 16;

function createSessionFrameLog(): SessionFrameLog {
  // Map iteration order is insertion order: re-inserting on every write keeps
  // the least recently written session first.
  const logs = new Map<string, SessionLog>();

  return {
    epoch: randomBytes(8).toString('hex'),

    sequence(sessionId, msg) {
      let log = logs.get(sessionId);
      if (log) logs.delete(sessionId);
      else log = { next: 1, frames: [], bytes: 0 };
      logs.set(sessionId, log);
      if (logs.size > MAX_SESSIONS) {
        const oldest = logs.keys().next().value;
        if (oldest !== undefined) logs.delete(oldest);
      }

      const seq = log.next++;
      const payload = (msg as { payload?: { sessionId?: unknown } }).payload;
      const named = payload && typeof payload === 'object' ? payload.sessionId : undefined;
      const data = JSON.stringify(
        named === sessionId ? { ...msg, seq } : { ...msg, seq, stream: sessionId },
      );
      const bytes = Buffer.byteLength(data, 'utf8');
      log.frames.push({ seq, data, bytes });
      log.bytes += bytes;
      while (log.frames.length > MAX_FRAMES || (log.bytes > MAX_BYTES && log.frames.length > 1)) {
        const dropped = log.frames.shift();
        if (dropped) log.bytes -= dropped.bytes;
      }
      return data;
    },

    since(sessionId, afterSeq) {
      if (!Number.isInteger(afterSeq) || afterSeq < 0) return null;
      const log = logs.get(sessionId);
      if (!log) return afterSeq === 0 ? [] : null;
      const last = log.next - 1;
      if (afterSeq > last) return null;
      if (afterSeq === last) return [];
      const oldest = log.frames[0]?.seq;
      if (oldest === undefined || oldest > afterSeq + 1) return null;
      return log.frames.filter((f) => f.seq > afterSeq).map((f) => f.data);
    },
  };
}

let processLog: SessionFrameLog | null = null;

/**
 * The frame log of this process. Both WebUI hosts (the standalone server and
 * the CLI's `--webui`) broadcast through it, and a process runs one of them,
 * so one epoch per process is one epoch per server.
 */
export function webuiSessionFrameLog(): SessionFrameLog {
  processLog ??= createSessionFrameLog();
  return processLog;
}
