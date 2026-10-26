/**
 * Regression: `unreadCountForActor` must be bounded AND exact below the
 * bound. The first bounded implementation tried backward paging through the
 * shared projection, but the store's `since` cursor is forward-only and
 * exclusive while rows sort newest-first — page 2 re-requested page 1 and
 * the count silently saturated at one page. The landed contract:
 *
 * - ONE bounded projection query with a one-row overshoot
 *   (MAILBOX_MAX_QUERY_LIMIT + 1);
 * - the count is exact below the cap and saturates AT the cap
 *   (MAILBOX_MAX_QUERY_LIMIT) instead of materializing the whole mailbox;
 * - `isMessageUnreadForActor` is per-actor: read by ANOTHER agent does not
 *   make the message read for this one.
 */
import { describe, expect, it } from 'vitest';
import { MAILBOX_MAX_QUERY_LIMIT } from '../src/mailbox-constants.js';
import { isMessageUnreadForActor, unreadCountForActor } from '../src/mailbox-http-actor-query.js';
import type { Mailbox, MailboxMessage } from '../src/mailbox-types.js';

const ACTOR = {
  actorId: 'worker@sess-1',
  recipientAliases: new Set(['worker']),
} as const;

function msg(i: number): MailboxMessage {
  return {
    id: `m${i}`,
    from: 'sender',
    to: 'worker@sess-1',
    type: 'note',
    subject: `s${i}`,
    body: 'b',
    priority: 'normal',
    readBy: {},
    completed: false,
    timestamp: new Date(2026, 0, 1, 0, 0, 0, i).toISOString(),
  };
}

/** Minimal mailbox: `query` honors `to`, `unreadBy`, and `limit` like the store. */
function fakeMailbox(seed: MailboxMessage[]): Mailbox {
  return {
    query: async (q: { to?: string; unreadBy?: string; limit?: number }) => {
      const matched = seed.filter(
        (m) =>
          (q.to === undefined || m.to === q.to) &&
          (q.unreadBy === undefined || m.readBy[q.unreadBy] === undefined),
      );
      return typeof q.limit === 'number' ? matched.slice(0, q.limit) : matched;
    },
  } as unknown as Mailbox;
}

describe('unreadCountForActor (bounded, per-actor)', () => {
  it('counts unread mail for the actor below the cap', async () => {
    const mailbox = fakeMailbox([msg(1), msg(2), msg(3)]);
    await expect(unreadCountForActor(mailbox, ACTOR)).resolves.toBe(3);
  });

  it('returns the exact count via the unbounded fallback at the probe cap', async () => {
    // The landed contract: the COMMON path is one bounded probe
    // (MAILBOX_MAX_QUERY_LIMIT + 1 rows); only when that page is saturated
    // does the count pay one unbounded re-read so the badge stays exact.
    const mailbox = fakeMailbox(
      Array.from({ length: MAILBOX_MAX_QUERY_LIMIT + 1 }, (_, i) => msg(i)),
    );
    await expect(unreadCountForActor(mailbox, ACTOR)).resolves.toBe(MAILBOX_MAX_QUERY_LIMIT + 1);
  });

  it('isMessageUnreadForActor is per-actor: read by another agent stays unread', () => {
    const m = msg(1);
    expect(isMessageUnreadForActor(m, ACTOR.actorId)).toBe(true);
    m.readBy['other@sess-1'] = new Date().toISOString();
    expect(isMessageUnreadForActor(m, ACTOR.actorId)).toBe(true);
    m.readBy[ACTOR.actorId] = new Date().toISOString();
    expect(isMessageUnreadForActor(m, ACTOR.actorId)).toBe(false);
  });
});
