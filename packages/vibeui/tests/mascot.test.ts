import { describe, expect, it } from 'vitest';
import {
  MASCOT_HEIGHT,
  MASCOT_WIDTH,
  mascotMoveDuration,
  mascotState,
  mascotStopIndex,
  mascotWaypoints,
} from '../src/lib/mascot';

describe('Stacky stays out of the conversation', () => {
  it.each([1120, 1366, 1512, 1920])('keeps every stop inside the spare gutter at %ipx', (width) => {
    const composerTop = 690;
    const points = mascotWaypoints({ width, height: 900, contentTop: 135, composerTop });
    expect(points).toHaveLength(3);
    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(16);
      expect(point.x + MASCOT_WIDTH).toBeLessThanOrEqual((width - 848) / 2);
      expect(point.y).toBeGreaterThanOrEqual(149);
      expect(point.y + MASCOT_HEIGHT).toBeLessThan(composerTop);
    }
  });
  it.each([
    { width: 390, height: 844, contentTop: 100, composerTop: 660 },
    { width: 1100, height: 900, contentTop: 100, composerTop: 700 },
    { width: 1512, height: 400, contentTop: 100, composerTop: 300 },
    { width: 1512, height: 900, contentTop: 150, composerTop: 260 },
    { width: Number.NaN, height: 900, contentTop: 100, composerTop: 700 },
  ])('docks when the layout has no safe roaming room: %j', (frame) => {
    expect(mascotWaypoints(frame)).toEqual([]);
  });
});

describe('a truthful, gentle companion', () => {
  it.each([
    [{ connected: false, working: true, outcome: 'done', attention: true }, 'offline'],
    [{ connected: true, working: true, outcome: 'done', attention: true }, 'working'],
    [{ connected: true, working: false, outcome: 'error' }, 'attention'],
    [{ connected: true, working: false, outcome: 'aborted', attention: true }, 'stopped'],
    [{ connected: true, working: false, outcome: 'done', attention: true }, 'attention'],
    [{ connected: true, working: false, outcome: 'done' }, 'done'],
    [{ connected: true, working: false, outcome: null }, 'idle'],
  ] as const)('uses %s without hiding unfinished or failed work', (state, mood) => {
    expect(mascotState(state).mood).toBe(mood);
    expect(mascotState(state).status).not.toBe('');
  });
  it('walks back through the middle instead of jumping from bottom to top', () => {
    expect(Array.from({ length: 8 }, (_, index) => mascotStopIndex(index))).toEqual([
      0, 1, 2, 1, 0, 1, 2, 1,
    ]);
    expect(mascotStopIndex(Number.NaN)).toBe(0);
  });
  it('paces shorter and longer walks within a gentle duration range', () => {
    expect(mascotMoveDuration(100)).toBeLessThan(mascotMoveDuration(250));
    expect(mascotMoveDuration(0)).toBe(1600);
    expect(mascotMoveDuration(10000)).toBe(3400);
    expect(mascotMoveDuration(Number.NaN)).toBe(1600);
  });
});
