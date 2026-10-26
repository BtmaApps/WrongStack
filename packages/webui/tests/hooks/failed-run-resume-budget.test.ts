import { MAX_FAILED_RUN_RESUMES } from '@wrongstack/contracts/types/failed-run-resume';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// handleRunResult touches several side-effecty modules; stub them so the test
// sees only how a failed run arms the automatic resume.
vi.mock('@/lib/favicon', () => ({ setFaviconStatus: vi.fn() }));
vi.mock('@/lib/chime', () => ({
  playCompletionChime: vi.fn(),
  playPermissionChime: vi.fn(),
}));
vi.mock('@/lib/notify', () => ({
  ensureNotificationPermission: vi.fn(),
  notifyIfHidden: vi.fn(),
}));
vi.mock('@/lib/ws-client', () => ({
  getWSClient: () => ({ send: vi.fn(), sendMessage: vi.fn() }),
}));

import { handleRunResult } from '../../src/hooks/ws-handlers/chat-handlers';
import { useChatStore } from '../../src/stores/chat-store';
import type { WSServerMessage } from '../../src/types';

function timedOut(): WSServerMessage {
  return {
    type: 'run.result',
    payload: {
      status: 'failed',
      iterations: 1,
      error: { code: 'PROVIDER_NETWORK_ERROR', message: 'stream timeout', recoverable: true },
    },
  } as unknown as WSServerMessage;
}

function done(): WSServerMessage {
  return {
    type: 'run.result',
    payload: { status: 'done', iterations: 1, finalText: 'ok' },
  } as unknown as WSServerMessage;
}

const errorBubbles = () => useChatStore.getState().messages.filter((m) => m.isError);

describe('handleRunResult: automatic resume budget after provider failures', () => {
  beforeEach(() => {
    useChatStore.setState({
      queue: [],
      messages: [],
      currentAssistantMessageId: null,
      runStart: { at: Date.now() - 1000, cost: 0 },
    });
    // A completed run clears any budget a previous test left behind.
    handleRunResult(done());
    useChatStore.setState({ messages: [] });
  });

  it('arms a numbered resume for each failure in a row, then pauses and says why', () => {
    for (let i = 0; i < MAX_FAILED_RUN_RESUMES + 1; i++) handleRunResult(timedOut());

    const bubbles = errorBubbles();
    expect(bubbles.map((m) => m.autoContinue === true)).toEqual([
      ...Array.from({ length: MAX_FAILED_RUN_RESUMES }, () => true),
      false,
    ]);
    expect(bubbles.map((m) => m.resumeAttempt)).toEqual([
      ...Array.from({ length: MAX_FAILED_RUN_RESUMES }, (_, i) => i + 1),
      undefined,
    ]);
    const last = useChatStore.getState().messages.at(-1);
    expect(last?.content).toContain('Automatic resume paused');
  });

  it('gives the next outage the full budget once a run completes', () => {
    for (let i = 0; i < MAX_FAILED_RUN_RESUMES; i++) handleRunResult(timedOut());
    handleRunResult(done());
    handleRunResult(timedOut());

    const latest = errorBubbles().at(-1);
    expect(latest?.autoContinue).toBe(true);
    expect(latest?.resumeAttempt).toBe(1);
  });
});
