import { describe, expect, it, vi } from 'vitest';
import type { MessageHandlerDeps } from '../src/lib/message-handler-deps.js';
import { handleSessionStartMessage } from '../src/lib/message-handler-session-start.js';
import type { ServerMessage } from '../src/types.js';

function makeDeps(): MessageHandlerDeps {
  return {
    sessionIdRef: { current: null },
    draftRef: { current: '' },
    fileRefsRef: { current: [] },
    activeModelRef: { current: null },
    socketRef: { current: { send: vi.fn() } },
    stickToBottomRef: { current: true },
    writeComposerDraft: vi.fn(),
    setShowJumpToLatest: vi.fn(),
    worklists: { reset: vi.fn(), applyMessage: vi.fn() },
    setSession: vi.fn(),
    setModels: vi.fn(),
    setMessages: vi.fn(),
    onUpdateInfo: vi.fn(),
    setSubagents: vi.fn(),
    setAgentTranscripts: vi.fn(),
    readComposerDraft: vi.fn(() => ({ text: '', fileRefs: [] })),
    setDraft: vi.fn(),
    setFileRefs: vi.fn(),
    setFileMention: vi.fn(),
    clearComposerDraft: vi.fn(),
    setPendingConfirm: vi.fn(),
    setUserInputRequests: vi.fn(),
    setRunning: vi.fn(),
    setActivity: vi.fn(),
    setToolCalls: vi.fn(),
    setSelectedAgentId: vi.fn(),
    resetAgentNameCache: vi.fn(),
    setSessionStart: vi.fn(),
    setAttachedImages: vi.fn(),
    setSessionMenuOpen: vi.fn(),
    setContext: vi.fn(),
    requestProviderModels: vi.fn(),
  } as unknown as MessageHandlerDeps;
}

describe('handleSessionStartMessage — next-steps bookkeeping reset', () => {
  it('a malformed session.start leaves in-flight next-steps bookkeeping intact', () => {
    const map = new Map([['next-9', [{ index: 1, text: 'Step' }]]]);
    let resetCalled = false;
    handleSessionStartMessage({
      // A corrupt (non-record) payload fails projection: record() yields
      // null, the guard returns, and no state may be touched.
      message: { type: 'session.start', payload: 'corrupt' } as ServerMessage,
      deps: makeDeps(),
      nextStepsByToolId: map,
      resetCompletedToolNextSteps: () => {
        resetCalled = true;
      },
    });

    expect(map.size).toBe(1);
    expect(resetCalled).toBe(false);
  });

  it('a projectable session.start clears next-steps bookkeeping', () => {
    const map = new Map([['next-9', [{ index: 1, text: 'Step' }]]]);
    let resetCalled = false;
    handleSessionStartMessage({
      message: {
        type: 'session.start',
        payload: {
          sessionId: 'sess-2',
          provider: 'openai',
          model: 'gpt-4o',
          startedAt: '2026-09-23T10:00:00Z',
          reset: true,
          isRunning: false,
        },
      } as ServerMessage,
      deps: makeDeps(),
      nextStepsByToolId: map,
      resetCompletedToolNextSteps: () => {
        resetCalled = true;
      },
    });

    expect(map.size).toBe(0);
    expect(resetCalled).toBe(true);
  });
});
