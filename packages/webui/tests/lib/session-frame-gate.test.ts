import { afterEach, describe, expect, it, vi } from 'vitest';
import { FrameResume } from '../../src/lib/session-frame-gate';

type Frame = { type: string; seq?: number; stream?: string; payload: Record<string, unknown> };
const f = (seq: number, sessionId = 's1', text = `t${seq}`): Frame => ({
  type: 'provider.text_delta',
  seq,
  payload: { sessionId, text },
});
const texts = (frames: Frame[]) => frames.map((x) => x.payload['text']);
/** The gate a client's `FrameResume` owns. */
const newGate = () => new FrameResume<Frame>(() => undefined).gate;

describe('FrameResume gate', () => {
  it('passes frames straight through outside a resume, gaps included', () => {
    const gate = newGate();
    expect(texts(gate.accept(f(1)))).toEqual(['t1']);
    // A frame broadcast while no tab showed the session never came: accepted.
    expect(texts(gate.accept(f(5)))).toEqual(['t5']);
    expect(texts(gate.accept({ type: 'sessions.list', payload: {} }))).toEqual([undefined]);
  });

  it('drops a frame it already applied', () => {
    const gate = newGate();
    gate.accept(f(1));
    gate.accept(f(2));
    expect(gate.accept(f(2))).toEqual([]);
    expect(gate.accept(f(1))).toEqual([]);
  });

  it('holds live frames that skip ahead during a resume, then applies them in order', () => {
    const gate = newGate();
    gate.adoptEpoch('e1');
    gate.accept(f(1));
    gate.accept(f(2));
    expect(gate.cursors(['s1', 'other'])).toEqual({ eventEpoch: 'e1', cursors: { s1: 2 } });
    gate.beginResume(['s1']);

    // The new connection's live frames race the catch-up.
    expect(gate.accept(f(5))).toEqual([]);
    expect(gate.accept(f(6))).toEqual([]);
    // The catch-up fills the gap; the held frames follow in order, and the
    // catch-up's own copy of 5 is not applied twice.
    expect(texts(gate.accept(f(3)))).toEqual(['t3']);
    expect(texts(gate.accept(f(4)))).toEqual(['t4', 't5', 't6']);
    expect(gate.accept(f(5))).toEqual([]);
    expect(gate.finishResume('s1')).toEqual([]);
    expect(texts(gate.accept(f(7)))).toEqual(['t7']);
  });

  it('releases what waited, in order, when the catch-up is refused', () => {
    const gate = newGate();
    gate.adoptEpoch('e1');
    gate.accept(f(1));
    gate.beginResume(['s1']);
    gate.accept(f(9));
    gate.accept(f(7));
    expect(texts(gate.finishResume('s1'))).toEqual(['t7', 't9']);
    expect(gate.accept(f(8))).toEqual([]);
    expect(texts(gate.accept(f(10)))).toEqual(['t10']);
  });

  it('counts a frame under `stream` when its payload names another session', () => {
    const gate = newGate();
    gate.adoptEpoch('e1');
    gate.accept({ ...f(1, 'subagent'), stream: 'tab' });
    expect(gate.cursors(['tab', 'subagent'])).toEqual({ eventEpoch: 'e1', cursors: { tab: 1 } });
  });

  it('forgets every cursor when the server process changed', () => {
    const gate = newGate();
    gate.adoptEpoch('e1');
    gate.accept(f(4));
    gate.beginResume(['s1']);
    gate.accept(f(9));
    expect(texts(gate.adoptEpoch('e2'))).toEqual(['t9']);
    expect(gate.isResuming('s1')).toBe(false);
    expect(gate.cursors(['s1'])).toBeNull();
    // Numbering restarted on the new server.
    expect(texts(gate.accept(f(1)))).toEqual(['t1']);
  });

  it('has nothing to resume before it knows the server epoch', () => {
    const gate = newGate();
    gate.accept(f(3));
    expect(gate.cursors(['s1'])).toBeNull();
  });
});

describe('FrameResume', () => {
  afterEach(() => vi.useRealTimers());

  const start = (sessionId: string, extra: Record<string, unknown> = {}): Frame => ({
    type: 'session.start',
    payload: {
      sessionId,
      replayMessages: [{ role: 'user', content: 'x' }],
      replayMarkers: [],
      replayToolMeta: [],
      replayUsage: { input: 1, output: 1 },
      model: 'm',
      ...extra,
    },
  });

  it('drops the transcript replay of a tab being caught up, and only of that tab', () => {
    const applied: Frame[] = [];
    const resume = new FrameResume<Frame>((frames) => applied.push(...frames));
    resume.onSessionStart(start('s1', { eventEpoch: 'e1' }));
    resume.gate.accept(f(1));
    expect(resume.request(['s1'])).toEqual({ eventEpoch: 'e1', cursors: { s1: 1 } });

    const kept = resume.onSessionStart(start('s1', { eventEpoch: 'e1' }));
    expect(Object.keys(kept.payload).sort()).toEqual(['eventEpoch', 'model', 'sessionId']);
    const other = resume.onSessionStart(start('s2'));
    expect(other.payload['replayMessages']).toHaveLength(1);
  });

  it('lets a new server epoch keep its replay', () => {
    const resume = new FrameResume<Frame>(() => undefined);
    resume.onSessionStart(start('s1', { eventEpoch: 'e1' }));
    resume.gate.accept(f(1));
    resume.request(['s1']);
    const fresh = resume.onSessionStart(start('s1', { eventEpoch: 'e2' }));
    expect(fresh.payload['replayMessages']).toHaveLength(1);
  });

  it('applies held frames when the catch-up answer arrives', () => {
    const applied: Frame[] = [];
    const resume = new FrameResume<Frame>((frames) => applied.push(...frames));
    resume.onSessionStart(start('s1', { eventEpoch: 'e1' }));
    resume.gate.accept(f(1));
    resume.request(['s1']);
    resume.gate.accept(f(4));
    resume.onFramesResumed({ type: 'session.frames_resumed', payload: { sessionId: 's1' } });
    expect(texts(applied)).toEqual(['t4']);
  });

  it('gives up waiting after the timeout and applies what it held', () => {
    vi.useFakeTimers();
    const applied: Frame[] = [];
    const resume = new FrameResume<Frame>((frames) => applied.push(...frames), 1_000);
    resume.onSessionStart(start('s1', { eventEpoch: 'e1' }));
    resume.gate.accept(f(1));
    resume.request(['s1']);
    resume.gate.accept(f(3));
    vi.advanceTimersByTime(999);
    expect(applied).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(texts(applied)).toEqual(['t3']);
    expect(resume.gate.isResuming('s1')).toBe(false);
  });
});
