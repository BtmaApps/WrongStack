/**
 * Applies each session's numbered frames in order across a reconnect.
 *
 * The server numbers every session-scoped broadcast (`seq`, per session; a
 * frame delivered to a tab other than the session its payload names also
 * carries `stream`). After a reconnect the page sends the last number it
 * applied per tab and gets back the frames it missed, followed by
 * `session.frames_resumed`. Live frames of the new connection can arrive
 * before that catch-up, so while a tab is resuming, a frame that skips ahead
 * waits here until the missing ones have been applied, and a frame that was
 * already applied is dropped.
 *
 * Outside a resume a gap is normal (frames broadcast while no tab showed the
 * session were never delivered) and is accepted as is.
 */

interface SequencedFrame {
  seq?: unknown;
  stream?: unknown;
  payload?: unknown;
}

function frameSeq(msg: SequencedFrame): { sessionId: string; seq: number } | null {
  const seq = msg.seq;
  if (typeof seq !== 'number' || !Number.isInteger(seq)) return null;
  const payload = msg.payload as { sessionId?: unknown } | undefined;
  const sessionId =
    typeof msg.stream === 'string'
      ? msg.stream
      : payload && typeof payload === 'object'
        ? payload.sessionId
        : undefined;
  return typeof sessionId === 'string' && sessionId ? { sessionId, seq } : null;
}

class SessionFrameGate<T extends SequencedFrame> {
  private epoch: string | undefined;
  private readonly applied = new Map<string, number>();
  private readonly held = new Map<string, Map<number, T>>();
  private readonly resuming = new Set<string>();

  /**
   * The epoch of a new connection's `session.start`. A different one means the
   * server process changed and every cursor is meaningless: held frames are
   * released and the numbering starts over.
   */
  adoptEpoch(epoch: string): T[] {
    if (epoch === this.epoch) return [];
    const released = this.releaseAll();
    this.applied.clear();
    this.epoch = epoch;
    return released;
  }

  /** Cursors worth sending for `sessionIds`, or null when nothing can be resumed. */
  cursors(
    sessionIds: readonly string[],
  ): { eventEpoch: string; cursors: Record<string, number> } | null {
    if (!this.epoch) return null;
    const cursors: Record<string, number> = {};
    for (const id of sessionIds) {
      const seq = this.applied.get(id);
      if (seq !== undefined) cursors[id] = seq;
    }
    return Object.keys(cursors).length > 0 ? { eventEpoch: this.epoch, cursors } : null;
  }

  beginResume(sessionIds: Iterable<string>): void {
    for (const id of sessionIds) this.resuming.add(id);
  }

  isResuming(sessionId: string): boolean {
    return this.resuming.has(sessionId);
  }

  /** The frames to apply now, in order, for one frame that arrived. */
  accept(msg: T): T[] {
    const at = frameSeq(msg);
    if (!at) return [msg];
    const last = this.applied.get(at.sessionId);
    if (last !== undefined && at.seq <= last) return [];
    if (this.resuming.has(at.sessionId) && last !== undefined && at.seq > last + 1) {
      let held = this.held.get(at.sessionId);
      if (!held) {
        held = new Map();
        this.held.set(at.sessionId, held);
      }
      held.set(at.seq, msg);
      return [];
    }
    this.applied.set(at.sessionId, at.seq);
    return [msg, ...this.drainContiguous(at.sessionId)];
  }

  /** The catch-up for one tab is complete (or refused): release what waited. */
  finishResume(sessionId: string): T[] {
    if (!this.resuming.delete(sessionId)) return [];
    return this.release(sessionId);
  }

  /** Give up on every catch-up still pending (no answer came). */
  releaseAll(): T[] {
    const out: T[] = [];
    for (const id of [...this.resuming]) out.push(...this.finishResume(id));
    this.resuming.clear();
    return out;
  }

  private drainContiguous(sessionId: string): T[] {
    const held = this.held.get(sessionId);
    if (!held) return [];
    const out: T[] = [];
    let last = this.applied.get(sessionId) ?? 0;
    for (;;) {
      const next = held.get(last + 1);
      if (!next) break;
      held.delete(last + 1);
      out.push(next);
      last += 1;
    }
    this.applied.set(sessionId, last);
    for (const seq of held.keys()) if (seq <= last) held.delete(seq);
    if (held.size === 0) this.held.delete(sessionId);
    return out;
  }

  /** Everything held for a session, in order, gaps accepted. */
  private release(sessionId: string): T[] {
    const held = this.held.get(sessionId);
    this.held.delete(sessionId);
    if (!held) return [];
    const last = this.applied.get(sessionId) ?? 0;
    const ordered = [...held.entries()].filter(([seq]) => seq > last).sort(([a], [b]) => a - b);
    const top = ordered.at(-1);
    if (top) this.applied.set(sessionId, top[0]);
    return ordered.map(([, msg]) => msg);
  }
}

/** How long a reconnect waits for its catch-up before accepting the gap. */
const FRAME_RESUME_TIMEOUT_MS = 5_000;

/** Replay fields of `session.start`; see `@wrongstack/webui-protocol` replay-payload. */
const REPLAY_FIELDS = ['replayMessages', 'replayMarkers', 'replayToolMeta', 'replayUsage'] as const;

/**
 * The client's side of the reconnect catch-up: the gate, plus the give-up
 * timer and the `session.start` handling that go with it.
 */
export class FrameResume<T extends SequencedFrame & { type: string }> {
  readonly gate = new SessionFrameGate<T>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly apply: (frames: T[]) => void,
    private readonly timeoutMs = FRAME_RESUME_TIMEOUT_MS,
  ) {}

  /**
   * Cursors for a reconnect's `session.subscribe`. The tabs they name hold
   * their frames until `session.frames_resumed` (or the timeout).
   */
  request(sessionIds: readonly string[]): ReturnType<SessionFrameGate<T>['cursors']> {
    const request = this.gate.cursors(sessionIds);
    if (!request) return null;
    this.gate.beginResume(Object.keys(request.cursors));
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.apply(this.gate.releaseAll());
    }, this.timeoutMs);
    return request;
  }

  /**
   * A `session.start`: adopt a connection's epoch, and drop the transcript
   * replay of a tab that is being caught up. Its pane is kept; the frames it
   * missed are on their way, and a replay rebuilt from the journal would
   * throw away the answer still streaming.
   */
  onSessionStart(msg: T): T {
    const payload = msg.payload as Record<string, unknown>;
    if (typeof payload.eventEpoch === 'string')
      this.apply(this.gate.adoptEpoch(payload.eventEpoch));
    const sessionId = payload.sessionId;
    if (typeof sessionId !== 'string' || !this.gate.isResuming(sessionId)) return msg;
    const kept = { ...payload };
    for (const field of REPLAY_FIELDS) delete kept[field];
    return { ...msg, payload: kept };
  }

  /** `session.frames_resumed`: one tab's catch-up is over. */
  onFramesResumed(msg: T): void {
    const sessionId = (msg.payload as { sessionId?: unknown }).sessionId;
    if (typeof sessionId === 'string') this.apply(this.gate.finishResume(sessionId));
  }
}
