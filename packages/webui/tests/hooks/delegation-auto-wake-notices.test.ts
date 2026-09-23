import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ws-client', () => ({
  getWSClient: () => ({
    send: vi.fn(),
    supportsCapability: () => false,
    consumeRequestedSwitch: () => true,
  }),
}));

import { WS_HANDLERS } from '../../src/hooks/ws-handlers';
import { hydrateReplayMessages } from '../../src/hooks/ws-handlers/session-replay-handlers';
import { useChatLanes } from '../../src/stores/chat-lanes';
import { useChatStore } from '../../src/stores/chat-store';
import { useFleetStore } from '../../src/stores/fleet-store';
import { useSessionLanes } from '../../src/stores/session-lanes';
import { useSessionStore } from '../../src/stores/session-store';
import type { WSServerMessage } from '../../src/types';

/**
 * Background-delegation auto-wake, as the WebUI chat shows it: compact system
 * lines for the three server notices, and a woken turn's `[AUTO-WAKE]` input
 * replayed as a runtime marker — never as a user bubble.
 */

const SESSION = 'sess_wake';
const BASE = { sessionId: SESSION, model: 'm', provider: 'p', maxContext: 200_000 };

function fire(type: WSServerMessage['type'], payload: Record<string, unknown>): void {
  WS_HANDLERS[type]?.({ type, payload: { sessionId: SESSION, ...payload } } as never);
}

function reset(): void {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })) as never;
  }
  useChatLanes.setState({ lanes: {}, activeSessionId: '__unbound__' } as never);
  useSessionLanes.setState({ lanes: {}, activeSessionId: '__unbound__' } as never);
  useFleetStore.setState({
    agents: new Map(),
    leaderId: undefined,
    eventTimeline: [],
    agentTimeline: [],
    agentTranscripts: new Map(),
  } as never);
  useSessionStore.setState({ sessionId: SESSION } as never);
  fire('session.start', { ...BASE, reset: true });
  useChatStore.getState().clearMessages();
}

const rows = () =>
  useChatStore.getState().messages.map((m) => ({ role: m.role, content: m.content }));

beforeEach(reset);

describe('delegation notices', () => {
  it('renders delivery_pending as a compact system line', () => {
    fire('delegation.delivery_pending', { count: 1, delegationIds: ['del_1'] });
    expect(rows()).toEqual([
      { role: 'system', content: 'Background delegation result ready (del_1).' },
    ]);
  });

  it('renders auto_wake_started as a runtime line, not a user bubble', () => {
    fire('delegation.auto_wake_started', { delegationIds: ['del_1', 'del_2'], chain: 2 });
    const [row] = rows();
    expect(row?.role).toBe('system');
    expect(row?.content).toContain('Auto-wake');
    expect(row?.content).toContain('del_1, del_2');
    expect(rows().some((r) => r.role === 'user')).toBe(false);
  });

  it('renders a chain-cap suppression and ignores any other reason', () => {
    fire('delegation.auto_wake_suppressed', { reason: 'undisplayed', pending: 1 });
    expect(rows()).toEqual([]);
    fire('delegation.auto_wake_suppressed', { reason: 'chain_cap', pending: 2 });
    const [row] = rows();
    expect(row?.role).toBe('system');
    expect(row?.content).toContain('Auto-wake paused');
    expect(row?.content).toContain('send a message to continue');
  });
});

describe('replayed auto-wake input', () => {
  it('replays the [AUTO-WAKE] prompt as a system marker and ordinary input as a user bubble', () => {
    const messages = hydrateReplayMessages([
      { role: 'user', content: 'please review', ts: '2026-01-01T00:00:00Z' },
      { role: 'assistant', content: 'delegated', ts: '2026-01-01T00:00:01Z' },
      {
        role: 'user',
        content: '[AUTO-WAKE] Background delegation result(s) arrived: del_9. Review and continue.',
        ts: '2026-01-01T00:00:02Z',
      },
    ] as never);
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'system']);
    expect(messages[2]?.content).toContain('Auto-wake');
    expect(messages[2]?.content).toContain('del_9');
    expect(messages[2]?.content).not.toContain('[AUTO-WAKE]');
  });
});
