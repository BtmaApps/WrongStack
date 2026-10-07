/**
 * Regression guard: the send-failure arms of `submitWith` must restore the
 * composer draft. `resetComposerState()` clears the input BEFORE the wire
 * send, so when a send fails (no request id, or the send throws), the arm
 * must put the combined draft back — the same contract the not-connected arm
 * already honored — otherwise the `notConnectedDraftKept` toast lies and the
 * visible draft is lost. Found 2026-10-07 (bug-hunt r63): only the
 * not-connected arm restored the draft; the `!requestId` and catch arms did
 * not.
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { useWebSocket } from '@/hooks/useWebSocket';
import { useChatSubmit } from '../../src/components/ChatInput/use-chat-submit.js';

function makeWs(overrides: { sendMessage?: ReturnType<typeof vi.fn>; isConnected?: boolean }) {
  return {
    sendMessage: overrides.sendMessage ?? vi.fn(() => 'req-1'),
    sendAbort: vi.fn(),
    sendMailboxMessage: vi.fn(),
    client: { isConnected: overrides.isConnected ?? true, supportsCapability: () => false },
    refineModel: undefined,
    adviseTopic: vi.fn(),
  } as unknown as ReturnType<typeof useWebSocket>;
}

function renderSubmit(ws: ReturnType<typeof useWebSocket>) {
  const setInput = vi.fn();
  const rendered = renderHook(() =>
    useChatSubmit({
      input: 'hello world',
      setInput: setInput as unknown as React.Dispatch<React.SetStateAction<string>>,
      sessionId: null,
      textareaRef: { current: null },
      pendingImagesRef: { current: [] },
      clearPendingImages: vi.fn(),
      isLoading: false,
      setLoading: vi.fn(),
      addMessage: vi.fn(),
      enqueue: vi.fn(),
      ws,
      enhanceEnabled: false,
      pushPrompt: vi.fn(),
      setHistoryIdx: vi.fn(),
      stickyDraftRef: { current: null },
      refineBackstopTimerRef: { current: null },
      topicCheckBusyRef: { current: false },
      topicCheckAbortRef: { current: null },
      setTopicCheckBusy: vi.fn(),
      runSlashCommand: vi.fn(() => false),
      clearTextarea: vi.fn(),
      t: (key: string) => key,
    }),
  );
  return { setInput, submitWith: rendered.result.current.submitWith };
}

describe('useChatSubmit — send failures restore the composer draft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restores the draft when the send returns no request id', async () => {
    const ws = makeWs({ sendMessage: vi.fn(() => undefined) });
    const { setInput, submitWith } = renderSubmit(ws);
    await act(async () => {
      await submitWith('btw');
    });
    expect(ws.sendMessage).toHaveBeenCalledWith('hello world', undefined);
    expect(setInput).toHaveBeenLastCalledWith('hello world');
  });

  it('restores the draft when the send throws', async () => {
    const ws = makeWs({
      sendMessage: vi.fn(() => {
        throw new Error('socket gone');
      }),
    });
    const { setInput, submitWith } = renderSubmit(ws);
    await act(async () => {
      await submitWith('btw');
    });
    expect(setInput).toHaveBeenLastCalledWith('hello world');
  });

  it('not-connected arm still restores the draft (existing contract)', async () => {
    const ws = makeWs({ isConnected: false });
    const { setInput, submitWith } = renderSubmit(ws);
    await act(async () => {
      await submitWith('btw');
    });
    expect(setInput).toHaveBeenLastCalledWith('hello world');
  });
});
