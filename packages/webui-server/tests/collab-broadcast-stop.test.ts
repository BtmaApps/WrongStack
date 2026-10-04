import { afterEach, expect, it, vi } from 'vitest';
import { CollabBroadcastScheduler } from '../src/server/collab/broadcast-scheduler.js';

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
it('owns a fresh pass after gated reentrant restart', () => {
  vi.useFakeTimers();
  const seen: string[] = [];
  let restarted = false;
  const scheduler = new CollabBroadcastScheduler(
    { sessionIds: () => ['a', 'b'], stateFingerprint: () => 'v' } as never,
    (id) => {
      seen.push(id);
      if (!restarted) {
        restarted = true;
        scheduler.stop();
        scheduler.ensure();
      }
    },
  );
  scheduler.ensure();
  vi.advanceTimersByTime(2000);
  expect(seen).toEqual(['a']);
  vi.advanceTimersByTime(2000);
  expect(seen).toEqual(['a', 'a', 'b']);
  scheduler.stop();
  scheduler.stop();
  expect(vi.getTimerCount()).toBe(0);
});
it('skips unchanged fingerprints, forgets independently and handles empty registry', () => {
  vi.useFakeTimers();
  const seen: string[] = [];
  const scheduler = new CollabBroadcastScheduler(
    { sessionIds: () => ['a', 'b'], stateFingerprint: () => 'v' } as never,
    (id) => seen.push(id),
  );
  scheduler.record('a');
  scheduler.record('b');
  scheduler.ensure();
  scheduler.ensure();
  expect(vi.getTimerCount()).toBe(1);
  vi.advanceTimersByTime(2000);
  expect(seen).toEqual([]);
  scheduler.forget('b');
  vi.advanceTimersByTime(2000);
  expect(seen).toEqual(['b']);
  scheduler.stop();
  const empty = new CollabBroadcastScheduler(
    { sessionIds: () => [], stateFingerprint: () => 'v' } as never,
    () => {
      throw Error('unexpected');
    },
  );
  empty.ensure();
  vi.advanceTimersByTime(2000);
  empty.stop();
  expect(vi.getTimerCount()).toBe(0);
});
