import { describe, expect, it, vi } from 'vitest';
import { FrameResume } from '@wrongstack/webui-protocol';
import {
  installWsClientSessionMethods,
  type WsClientSessionMethods,
} from '../../src/lib/ws-client-session-methods';
import type { WSServerMessage } from '../../src/types';

function host(replayOnNextSubscribe: boolean) {
  const send = vi.fn(() => true);
  const frameResume = new FrameResume<WSServerMessage>(() => undefined);
  // The methods the real client class gets, on a bare host.
  class Host {}
  installWsClientSessionMethods(Host as never);
  const h = Object.assign(new Host(), {
    send,
    withSession: (payload: Record<string, unknown>) => payload,
    subscribedSessionIds: [] as string[],
    replayOnNextSubscribe,
    frameResume,
  }) as unknown as WsClientSessionMethods;
  return { h, send, frameResume };
}

const knowEpochAndFrame = (frameResume: FrameResume<WSServerMessage>, sessionId: string) => {
  frameResume.onSessionStart({
    type: 'session.start',
    payload: { sessionId, eventEpoch: 'e1' },
  } as unknown as WSServerMessage);
  frameResume.gate.accept({
    type: 'provider.text_delta',
    seq: 4,
    payload: { sessionId, text: 'x' },
  } as unknown as WSServerMessage);
};

describe('subscribeSessions frame cursors', () => {
  it('asks a reconnect to catch up the tabs it can, and a transcript for the rest', () => {
    const { h, send, frameResume } = host(true);
    knowEpochAndFrame(frameResume, 'live');

    h.subscribeSessions(['live', 'blank']);

    expect(send).toHaveBeenCalledWith({
      type: 'session.subscribe',
      payload: {
        sessionIds: ['live', 'blank'],
        replayFor: ['blank'],
        eventEpoch: 'e1',
        cursors: { live: 4 },
      },
    });
    expect(frameResume.gate.isResuming('live')).toBe(true);
  });

  it('sends no cursors on a later subscribe (a tab opened or closed)', () => {
    const { h, send, frameResume } = host(false);
    knowEpochAndFrame(frameResume, 'live');

    h.subscribeSessions(['live', 'other']);

    expect(send).toHaveBeenCalledWith({
      type: 'session.subscribe',
      payload: { sessionIds: ['live', 'other'] },
    });
    expect(frameResume.gate.isResuming('live')).toBe(false);
  });
});
