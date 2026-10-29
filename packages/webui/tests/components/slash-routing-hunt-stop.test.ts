import { beforeEach, describe, expect, it } from 'vitest';
import { runHuntSlashCommand } from '../../src/components/ChatInput/slash-routing-hunt.js';
import { useBugHuntRunStore } from '../../src/stores/bug-hunt-run-store.js';

const run = { scope: '', totalRounds: 5, currentRound: 2 } as never;

function stop(sessionId: string | null): { messages: string[]; runs: string[] } {
  const messages: string[] = [];
  runHuntSlashCommand({
    cmd: '/bughunt',
    args: 'stop',
    sessionId,
    isLoading: false,
    client: null,
    addMessage: (message) => messages.push(String(message.content)),
    setLoading: () => {},
  });
  return { messages, runs: Object.keys(useBugHuntRunStore.getState().runs).sort() };
}

beforeEach(() => {
  useBugHuntRunStore.setState({ runs: {} });
});

// `stop` fell back to the first run in the store, so a tab without a hunt
// stopped another tab's multi-round run (F909).
describe('/bughunt stop scope (F909)', () => {
  it('leaves another session hunting when this session has no hunt', () => {
    useBugHuntRunStore.getState().start('tab-A', run);
    const result = stop('tab-B');
    expect(result.runs).toEqual(['tab-A']);
    expect(result.messages[0]).toContain('No Proof-Driven Hunt');
  });

  it('stops only this session when both hunt', () => {
    useBugHuntRunStore.getState().start('tab-A', run);
    useBugHuntRunStore.getState().start('tab-B', run);
    expect(stop('tab-B').runs).toEqual(['tab-A']);
  });
});
