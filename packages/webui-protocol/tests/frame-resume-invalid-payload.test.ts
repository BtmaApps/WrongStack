import { describe, expect, it } from 'vitest';
import { FrameResume, type SequencedFrame } from '../src/frame-resume.js';

describe('FrameResume invalid catch-up payloads', () => {
  it('ignores malformed answers while preserving pending catch-up frames', () => {
    type Frame = SequencedFrame & { type: string };
    const applied: Frame[] = [];
    const resume = new FrameResume<Frame>((frames) => applied.push(...frames));
    resume.gate.adoptEpoch('epoch');
    resume.gate.accept({ type: 'text', stream: 's', seq: 1 });
    resume.gate.beginResume(['s']);
    resume.gate.accept({ type: 'text', stream: 's', seq: 3 });
    for (const payload of [null, undefined, [], 0, '', {}, { sessionId: 123 }]) {
      expect(() =>
        resume.onFramesResumed({ type: 'session.frames_resumed', payload }),
      ).not.toThrow();
    }
    expect(resume.gate.isResuming('s')).toBe(true);
    expect(applied).toEqual([]);
    resume.onFramesResumed({ type: 'session.frames_resumed', payload: { sessionId: 's' } });
    expect(resume.gate.isResuming('s')).toBe(false);
    expect(applied.map((frame) => frame.seq)).toEqual([3]);
  });
});
