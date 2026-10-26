/**
 * Regression: cross-path double delivery (architecture review finding C1).
 *
 * The inline and awareness mailbox wrappers each kept their own dedup
 * state, so one message could surface twice per iteration — a
 * `[MAILBOX BTW]` awareness preview AND the inline `[MAILBOX]` block.
 * The production composition threads ONE shared delivered-id ledger
 * through both wrappers (`attachMailboxCheckerInner`). Rules pinned here:
 *
 *  - awareness-only types (`backgroundEligible: false`: note, btw,
 *    broadcast, status) surface exactly once: a BTW preview is followed
 *    by an inline ABSORB (acked, not re-injected);
 *  - `backgroundEligible` types (ask/assign/steer/review/result) still
 *    deliver inline after a preview — the inline block is the canonical
 *    delivery with its action guidance and acknowledgement footer;
 *  - a message the inline path already delivered is never re-previewed;
 *  - awareness-only dedup stays wrapper-owned, so affinity-dropped mail
 *    stays redeliverable across an in-process session swap (the awareness
 *    inner checker must keep `trackInjected: false`, matching the inline
 *    checker's contract in the session-affinity redelivery suite).
 */

import { createMailboxChecker } from '@wrongstack/core/agent';
import { describe, expect, it } from 'vitest';
import { applySessionAffinityFilter } from '../src/mailbox-attach.js';
import type { Mailbox, MailboxMessage } from '../src/mailbox-types.js';
import { MAILBOX_TYPE_PROPERTIES } from '../src/mailbox-types.js';

const SESSION_A = 'sess-aaaaaaaaaaaaaaaa';
const SESSION_B = 'sess-bbbbbbbbbbbbbbbb';
const IDENTITY = 'leader@tagA';

function msg(partial: Partial<MailboxMessage> & Pick<MailboxMessage, 'type'>): MailboxMessage {
  return {
    id: partial.id ?? 'm1',
    from: partial.from ?? 'peer@tag1',
    to: partial.to ?? 'leader',
    type: partial.type,
    subject: partial.subject ?? 'Note',
    body: partial.body ?? 'b',
    priority: partial.priority ?? 'normal',
    readBy: partial.readBy ?? {},
    completed: partial.completed ?? false,
    timestamp: partial.timestamp ?? '2026-10-25T00:00:00.000Z',
    ...(partial.sessionAffinity !== undefined ? { sessionAffinity: partial.sessionAffinity } : {}),
  };
}

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/**
 * Minimal in-memory mailbox: query filters by address + readBy (what the
 * server does), ackMany stamps the receipt. `parkAcks` holds acks in flight
 * to expose the read-receipt latency window the shared ledger must cover.
 */
function fakeMailbox(seed: MailboxMessage[]) {
  const store = new Map(seed.map((m) => [m.id, { ...m }]));
  const ackCalls: Array<{ readerId: string; messageIds: string[] }> = [];
  let parked = false;
  let waiters: Array<() => void> = [];
  const stub = {
    query: async (q: { to: string; unreadBy?: string }) =>
      [...store.values()].filter(
        (m) => m.to === q.to && !(q.unreadBy !== undefined && m.readBy[q.unreadBy] !== undefined),
      ),
    ackMany: async (input: { acks: Array<{ messageId: string; readerId: string }> }) => {
      if (parked) await new Promise<void>((resolve) => waiters.push(resolve));
      ackCalls.push({
        readerId: input.acks[0]?.readerId ?? IDENTITY,
        messageIds: input.acks.map((a) => a.messageId),
      });
      for (const a of input.acks) {
        const m = store.get(a.messageId);
        if (m) m.readBy[a.readerId] = new Date().toISOString();
      }
      return input.acks.map(() => null);
    },
  };
  return {
    mailbox: stub as unknown as Mailbox,
    ackCalls,
    parkAcks: (): void => {
      parked = true;
    },
    releaseAcks: async (): Promise<void> => {
      parked = false;
      const release = waiters;
      waiters = [];
      for (const w of release) w();
      await flush();
    },
  };
}

/**
 * Exactly the production composition from `attachMailboxCheckerInner`:
 * inner checkers with `ack: false` + `trackInjected: false`, the awareness
 * one additionally excluding out-of-band types, both wrapped by
 * `applySessionAffinityFilter` sharing one delivered-id ledger.
 */
function productionComposition(
  mailbox: Mailbox,
  sharedDeliveredIds: Set<string>,
  opts?: { sessionId?: () => string },
) {
  const sessionId = opts?.sessionId ?? ((): string => SESSION_A);
  const wrapperDeps = {
    getSessionId: sessionId,
    getAgentId: (): string => IDENTITY,
    getMailbox: (): Mailbox => mailbox,
    affinityCtx: { resolveChimeraReportSessionId: async () => undefined },
    sharedDeliveredIds,
  };
  const base = {
    mailbox,
    agentId: IDENTITY,
    aliases: ['leader'],
    sessionId,
    ack: false as const,
    trackInjected: false as const,
  };
  const inline = applySessionAffinityFilter(createMailboxChecker({ ...base }), true, wrapperDeps);
  const awareness = applySessionAffinityFilter(
    createMailboxChecker({
      ...base,
      // Production construction: awareness excludes out-of-band types via
      // the canonical table. `trackInjected: false` comes from `base` —
      // keep it, or affinity-dropped mail is consumed by the inner set.
      include: (m) => !MAILBOX_TYPE_PROPERTIES[m.type]?.outOfBand,
    }),
    false,
    wrapperDeps,
  );
  return { inline, awareness };
}

describe('shared cross-path delivered ledger (inline ↔ awareness)', () => {
  it('absorbs an awareness-only type inline after a BTW preview (acked, not re-injected)', async () => {
    const { mailbox, ackCalls } = fakeMailbox([msg({ type: 'status', id: 's1' })]);
    const shared = new Set<string>();
    const { inline, awareness } = productionComposition(mailbox, shared);

    expect((await awareness()).map((m) => m.id)).toEqual(['s1']);
    // The status mail was already previewed; backgroundEligible:false types
    // must NOT re-surface in the inline block — they are absorbed (acked).
    expect((await inline()).map((m) => m.id)).toEqual([]);
    await flush();
    expect(ackCalls).toEqual([{ readerId: IDENTITY, messageIds: ['s1'] }]);
    expect(shared.has('s1')).toBe(true);
  });

  it('still delivers an actionable type inline after a preview (canonical delivery)', async () => {
    const { mailbox, ackCalls } = fakeMailbox([msg({ type: 'ask', id: 'a1' })]);
    const shared = new Set<string>();
    const { inline, awareness } = productionComposition(mailbox, shared);

    expect((await awareness()).map((m) => m.id)).toEqual(['a1']);
    expect((await inline()).map((m) => m.id)).toEqual(['a1']);
    await flush();
    expect(ackCalls).toEqual([{ readerId: IDENTITY, messageIds: ['a1'] }]);
    // Preview + inline happened, but each path surfaced it exactly once.
    expect((await awareness()).map((m) => m.id)).toEqual([]);
    expect((await inline()).map((m) => m.id)).toEqual([]);
  });

  it('never re-previews a message the inline path already delivered (ack in flight)', async () => {
    const { mailbox, ackCalls, parkAcks, releaseAcks } = fakeMailbox([
      msg({ type: 'ask', id: 'a2' }),
    ]);
    parkAcks();
    const shared = new Set<string>();
    const { inline, awareness } = productionComposition(mailbox, shared);

    expect((await inline()).map((m) => m.id)).toEqual(['a2']);
    // The ack is parked (server still reports the message unread), but the
    // shared ledger already holds it — awareness must not preview it again.
    expect((await awareness()).map((m) => m.id)).toEqual([]);
    await releaseAcks();
    expect(ackCalls).toEqual([{ readerId: IDENTITY, messageIds: ['a2'] }]);
  });

  it('keeps awareness redelivery after a session swap (awareness inner checker parity)', async () => {
    const { mailbox, ackCalls } = fakeMailbox([
      msg({ type: 'review', id: 'm-swap', sessionAffinity: { sessionId: SESSION_B } }),
    ]);
    let currentSession = SESSION_A;
    const shared = new Set<string>();
    const { awareness } = productionComposition(mailbox, shared, {
      sessionId: () => currentSession,
    });

    expect(await awareness()).toEqual([]);
    currentSession = SESSION_B;
    expect((await awareness()).map((m) => m.id)).toEqual(['m-swap']);
    expect(await awareness()).toEqual([]);
    expect(ackCalls).toEqual([]);
  });
});
