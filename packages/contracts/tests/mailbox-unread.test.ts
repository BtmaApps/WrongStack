import { describe, expect, it } from 'vitest';
import { isMailboxMessageUnread } from '../src/types/mailbox.js';

describe('isMailboxMessageUnread', () => {
  it('treats a message nobody read as unread', () => {
    expect(isMailboxMessageUnread({ completed: false, readBy: {} })).toBe(true);
  });

  it('is not unread once any recipient read it', () => {
    expect(
      isMailboxMessageUnread({ completed: false, readBy: { 'agent-a': '2026-07-16T00:00:00Z' } }),
    ).toBe(false);
  });

  it('is not unread once the message is completed', () => {
    expect(isMailboxMessageUnread({ completed: true, readBy: {} })).toBe(false);
  });

  it('prefers the explicit count over a partial receipt map', () => {
    // A client-side projection can carry a truncated receipt map next to the
    // aggregate count; the count is the authoritative one, so the map must
    // not decide the answer.
    expect(isMailboxMessageUnread({ completed: false, readBy: {}, readByCount: 3 })).toBe(false);
    expect(isMailboxMessageUnread({ completed: false, readBy: {}, readByCount: 0 })).toBe(true);
  });

  it('falls back to the count-only projection shapes', () => {
    expect(isMailboxMessageUnread({ completed: false, readByCount: 0 })).toBe(true);
    expect(isMailboxMessageUnread({ completed: false, readCount: 2 })).toBe(false);
    expect(isMailboxMessageUnread({ completed: false, readCount: 0 })).toBe(true);
  });

  it('is unread when the projection carries no receipt information', () => {
    expect(isMailboxMessageUnread({ completed: false })).toBe(true);
  });
});
