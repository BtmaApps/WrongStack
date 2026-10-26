import { describe, expect, it } from 'vitest';
import { isMailboxSendableType } from '../src/mailbox-predicates.js';
import {
  MAILBOX_MESSAGE_TYPES,
  MAILBOX_SENDABLE_MESSAGE_TYPES,
  MAILBOX_TYPE_PROPERTIES,
} from '../src/mailbox-types.js';

describe('MAILBOX_MESSAGE_TYPES (canonical runtime vocabulary)', () => {
  it('lists exactly the members of the MailboxMessageType union', () => {
    // `MAILBOX_TYPE_PROPERTIES` is typed `Record<MailboxMessageType, ...>`, so
    // TypeScript refuses to compile once a union member has no entry — its key
    // set IS the union at runtime. Comparing against it therefore detects
    // "a type was added to the union but the runtime list was not updated",
    // which is exactly the drift the hand-maintained copies allowed.
    expect([...MAILBOX_MESSAGE_TYPES].sort()).toEqual(Object.keys(MAILBOX_TYPE_PROPERTIES).sort());
  });

  it('exposes exactly the sendable subset, without the runtime-reserved control type', () => {
    expect([...MAILBOX_SENDABLE_MESSAGE_TYPES].sort()).toEqual(
      [...MAILBOX_MESSAGE_TYPES].filter((type) => type !== 'control').sort(),
    );
    expect(MAILBOX_SENDABLE_MESSAGE_TYPES).not.toContain('control');
  });

  it('accepts every sendable type through the guard and rejects everything else', () => {
    for (const type of MAILBOX_SENDABLE_MESSAGE_TYPES) {
      expect(isMailboxSendableType(type)).toBe(true);
    }
    expect(isMailboxSendableType('control')).toBe(false);
    expect(isMailboxSendableType('not-a-type')).toBe(false);
  });
});
