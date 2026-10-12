import { describe, expect, it } from 'vitest';
import { buildBugHuntMessage, parseBugHuntMessage } from '../../src/lib/bug-hunt-message';

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
});
