import { describe, expect, it } from 'vitest';
import { replayToMessages } from '../src/lib/chat-model.js';
import { delegationNoticeText } from '../src/lib/message-handler.js';

/**
 * A woken turn's `[AUTO-WAKE]` input is runtime text. Replayed, it must render
 * as a system marker — the line the live stream showed — not a user bubble.
 */
describe('SimpleUI auto-wake rendering', () => {
  it('replays the [AUTO-WAKE] prompt as a system marker', () => {
    const messages = replayToMessages([
      { role: 'user', content: 'review the diff', ts: '2026-01-01T00:00:00Z' },
      {
        role: 'user',
        content:
          '[AUTO-WAKE] Background delegation result(s) arrived: del_7, del_8. Review and continue.',
        ts: '2026-01-01T00:00:01Z',
      },
    ]);
    expect(messages.map((m) => m.role)).toEqual(['user', 'system']);
    expect(messages[1]?.text).toContain('Auto-wake');
    expect(messages[1]?.text).toContain('del_7, del_8');
    expect(messages[1]?.text).not.toContain('[AUTO-WAKE]');
  });

  it('projects the three notices and skips an undisplayed hold', () => {
    expect(
      delegationNoticeText('delegation.delivery_pending', { count: 2, delegationIds: ['a', 'b'] }),
    ).toBe('2 background delegation results ready (a, b).');
    expect(
      delegationNoticeText('delegation.auto_wake_started', { delegationIds: ['a'], chain: 3 }),
    ).toContain('woken turn 3');
    expect(
      delegationNoticeText('delegation.auto_wake_suppressed', { reason: 'chain_cap', pending: 1 }),
    ).toContain('Auto-wake paused');
    expect(
      delegationNoticeText('delegation.auto_wake_suppressed', {
        reason: 'undisplayed',
        pending: 1,
      }),
    ).toBeNull();
  });
});
