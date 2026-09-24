import { describe, expect, it } from 'vitest';
import { webuiSessionFrameLog } from '../src/server/session-frame-log.js';

// The process log is shared, so every test numbers its own session ids. The
// caps below are the production ones: 4,000 frames and 4 MiB per session,
// 16 sessions.
const log = webuiSessionFrameLog();
const frame = (sessionId: string, n: number, pad = 0) => ({
  type: 'provider.text_delta',
  payload: { sessionId, text: `t${n}${'x'.repeat(pad)}` },
});
const seqs = (frames: string[] | null) =>
  frames?.map((f) => (JSON.parse(f) as { seq: number }).seq);

describe('session frame log', () => {
  it('numbers each session on its own counter, from 1', () => {
    const a1 = JSON.parse(log.sequence('num-a', frame('num-a', 1)));
    const b1 = JSON.parse(log.sequence('num-b', frame('num-b', 1)));
    const a2 = JSON.parse(log.sequence('num-a', frame('num-a', 2)));
    expect([a1.seq, b1.seq, a2.seq]).toEqual([1, 1, 2]);
    // The payload already names the session, so no `stream` is added.
    expect(a1.stream).toBeUndefined();
    expect(a2.payload).toEqual({ sessionId: 'num-a', text: 't2' });
  });

  it('names the counter on a frame delivered to a session its payload does not name', () => {
    const sub = JSON.parse(log.sequence('stream-tab', frame('stream-subagent', 1)));
    expect(sub).toMatchObject({ seq: 1, stream: 'stream-tab' });
  });

  it('returns exactly the frames after a cursor, and nothing at the head', () => {
    for (let i = 1; i <= 5; i++) log.sequence('since', frame('since', i));
    expect(seqs(log.since('since', 2))).toEqual([3, 4, 5]);
    expect(log.since('since', 5)).toEqual([]);
    expect(seqs(log.since('since', 0))).toEqual([1, 2, 3, 4, 5]);
  });

  it('refuses a cursor it never issued', () => {
    log.sequence('bad', frame('bad', 1));
    expect(log.since('bad', 2)).toBeNull();
    expect(log.since('bad', -1)).toBeNull();
    expect(log.since('bad', 0.5)).toBeNull();
    // A session with no frames on this server: only "nothing applied" is consistent.
    expect(log.since('never-written', 0)).toEqual([]);
    expect(log.since('never-written', 4)).toBeNull();
  });

  it('refuses a gap older than the frames it keeps', () => {
    for (let i = 1; i <= 4_003; i++) log.sequence('evict', frame('evict', i));
    // Frames 1-3 were evicted: a page at 2 missed 3, which is gone.
    expect(log.since('evict', 2)).toBeNull();
    expect(log.since('evict', 3)).toHaveLength(4_000);
  });

  it('keeps each session under its byte budget', () => {
    const MiB = 1024 * 1024;
    for (let i = 1; i <= 6; i++) log.sequence('bytes', frame('bytes', i, MiB));
    expect(log.since('bytes', 1)).toBeNull();
    expect(seqs(log.since('bytes', 3))).toEqual([4, 5, 6]);
  });

  it('drops the least recently written session first', () => {
    log.sequence('lru-old', frame('lru-old', 1));
    log.sequence('lru-kept', frame('lru-kept', 1));
    for (let i = 0; i < 15; i++) {
      log.sequence(`lru-fill-${i}`, frame(`lru-fill-${i}`, 1));
      // Writing keeps a session fresh.
      if (i === 7) log.sequence('lru-kept', frame('lru-kept', 2));
    }
    // Its frames are gone; a page that had applied them all missed nothing.
    expect(log.since('lru-old', 0)).toBeNull();
    expect(log.since('lru-old', 1)).toEqual([]);
    expect(seqs(log.since('lru-kept', 0))).toEqual([1, 2]);
  });

  it('keeps numbering a session whose frames were dropped', () => {
    log.sequence('renum', frame('renum', 1));
    log.sequence('renum', frame('renum', 2));
    for (let i = 0; i < 16; i++) log.sequence(`renum-fill-${i}`, frame(`renum-fill-${i}`, 1));
    expect(log.since('renum', 0)).toBeNull();
    // Restarting at 1 would read as "already applied" on every page at 2.
    const next = JSON.parse(log.sequence('renum', frame('renum', 3)));
    expect(next.seq).toBe(3);
    expect(seqs(log.since('renum', 2))).toEqual([3]);
  });

  it('has one epoch for the process', () => {
    expect(webuiSessionFrameLog().epoch).toBe(log.epoch);
    expect(log.epoch).toMatch(/^[0-9a-f]{16}$/);
  });
});
