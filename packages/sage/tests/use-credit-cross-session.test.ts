/**
 * A memory injected into two sessions sharing one process-wide tracker (a
 * subagent, a second WebUI tab, an earlier session within the 2h TTL) must
 * still be creditable in the session that used it.
 */

import { describe, expect, it } from 'vitest';
import { InjectionTracker } from '../src/middleware/injection-tracker.js';

const TEXT =
  'The live Config object is frozen at boot; assigning to it in place throws. ' +
  'Always go through patchConfig() and setConfig() instead.';
const REPLY =
  'The live Config object is frozen at boot, so assigning to it in place throws; ' +
  'use patchConfig() and setConfig() instead.';

describe('InjectionTracker — cross-session attribution', () => {
  it('credits a memory in the session that used it even if another session also got it', () => {
    const tracker = new InjectionTracker();
    const now = Date.now();
    tracker.record('mem_a', TEXT, now, 'leader', TEXT);
    tracker.record('mem_a', TEXT, now, 'subagent-1', TEXT);
    tracker.snapshotContextParts([TEXT], 'leader', now);
    const used = tracker.consumeMatches(REPLY, now, 'leader', {
      onlyIds: tracker.activeMemoryIds('leader'),
    });
    expect(used).toEqual(['mem_a']);
  });

  it('credits each session once when both independently received the same memory', () => {
    const tracker = new InjectionTracker();
    const now = Date.now();
    tracker.record('mem_shared', TEXT, now, 'leader', TEXT);
    tracker.record('mem_shared', TEXT, now, 'subagent-1', TEXT);
    tracker.snapshotContextParts([TEXT], 'leader', now);
    tracker.snapshotContextParts([TEXT], 'subagent-1', now);
    const leaderIds = tracker.activeMemoryIds('leader');
    const subagentIds = tracker.activeMemoryIds('subagent-1');

    expect(tracker.consumeMatches(REPLY, now + 1, 'leader', { onlyIds: leaderIds })).toEqual([
      'mem_shared',
    ]);
    expect(tracker.consumeMatches(REPLY, now + 2, 'leader', { onlyIds: leaderIds })).toEqual([]);
    expect(tracker.consumeMatches(REPLY, now + 3, 'subagent-1', { onlyIds: subagentIds })).toEqual([
      'mem_shared',
    ]);
    expect(tracker.consumeMatches(REPLY, now + 4, 'subagent-1', { onlyIds: subagentIds })).toEqual(
      [],
    );
  });

  it('still refuses a memory that only another session received', () => {
    const tracker = new InjectionTracker();
    const now = Date.now();
    tracker.record('mem_b', TEXT, now, 'other', TEXT);
    expect(tracker.consumeMatches(REPLY, now, 'leader')).toEqual([]);
  });
});
