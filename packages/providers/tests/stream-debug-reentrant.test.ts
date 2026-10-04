import { afterEach, expect, it, vi } from 'vitest';
import {
  pushDebugChunkStats,
  setDebugStreamCallback,
  setDebugStreamEnabled,
} from '../src/stream-debug-state.js';

afterEach(() => {
  setDebugStreamEnabled(false);
  setDebugStreamCallback(null);
  vi.useRealTimers();
});
it('retains a batch pushed by the callback', () => {
  vi.useFakeTimers();
  setDebugStreamEnabled(true);
  const control: number[] = [];
  setDebugStreamCallback((s) => control.push(s.totalBytes));
  pushDebugChunkStats(5, 1);
  vi.advanceTimersByTime(200);
  expect(control).toEqual([5]);
  const actual: number[] = [];
  setDebugStreamCallback((s) => {
    actual.push(s.totalBytes);
    if (actual.length === 1) pushDebugChunkStats(7, 2);
  });
  pushDebugChunkStats(3, 1);
  vi.advanceTimersByTime(400);
  expect(actual).toEqual([3, 7]);
});
