import { describe, expect, it } from 'vitest';
import {
  BUG_HUNT_MODE_SLUGS,
  BUG_HUNT_MODES,
  buildBugHuntMessage,
  parseBugHuntMessage,
} from '../../src/lib/bug-hunt-message';

describe('bug hunt message limits', () => {
  it.each([1, 3, 10] as const)(
    'recovers the %s-round budget from persisted messages',
    (maxBugs) => {
      const summary = { scope: 'packages/webui', maxBugs, currentRound: maxBugs };
      expect(parseBugHuntMessage(buildBugHuntMessage('hunt', summary))).toEqual(summary);
    },
  );

  it.each([0, 11, 100])('rejects a budget of %s outside the form range', (maxBugs) => {
    expect(
      parseBugHuntMessage(
        `<!-- wrongstack-bug-hunt scope="" max-bugs="${maxBugs}" round="1" -->\nhunt`,
      ),
    ).toBeUndefined();
  });

  it('round-trips non-default Proof-Driven Hunt modes and rejects unknown modes', () => {
    for (const mode of BUG_HUNT_MODES) {
      expect(BUG_HUNT_MODE_SLUGS[mode]).toMatch(/^proof-driven-/);
      const summary = {
        scope: 'packages/core',
        maxBugs: 5 as const,
        currentRound: 2,
        ...(mode !== 'bughunt' ? { mode } : {}),
      };
      expect(parseBugHuntMessage(buildBugHuntMessage('hunt', summary))).toEqual(summary);
    }
    expect(
      parseBugHuntMessage(
        '<!-- wrongstack-bug-hunt scope="" max-bugs="3" round="1" mode="unknownmode" -->\nhunt',
      ),
    ).toBeUndefined();
  });
});
