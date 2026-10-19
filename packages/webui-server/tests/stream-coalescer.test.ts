import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStreamCoalescer } from '../src/server/stream-coalescer.js';

function harness() {
  const broadcast = vi.fn();
  const coalescer = createStreamCoalescer({
    broadcast,
    sessionPayload: (payload) => ({ ...payload, sessionId: String(payload.sessionId ?? 'live') }),
  });
  return { broadcast, coalescer };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createStreamCoalescer', () => {
  it('coalesces text deltas for the same session on the frame timer', () => {
    vi.useFakeTimers();
    const { broadcast, coalescer } = harness();

    coalescer.queueTextDelta('hello', 's1');
    coalescer.queueTextDelta(' world', 's1');
    expect(broadcast).not.toHaveBeenCalled();

    vi.advanceTimersByTime(16);
    expect(broadcast).toHaveBeenCalledWith({
      type: 'provider.text_delta',
      payload: { sessionId: 's1', text: 'hello world', messageId: 'current' },
    });
  });

  it('flushes the previous session before accepting a new text delta', () => {
    vi.useFakeTimers();
    const { broadcast, coalescer } = harness();

    coalescer.queueTextDelta('first', 's1');
    coalescer.queueTextDelta('second', 's2');

    expect(broadcast).toHaveBeenNthCalledWith(1, {
      type: 'provider.text_delta',
      payload: { sessionId: 's1', text: 'first', messageId: 'current' },
    });
    coalescer.flushAllStreamBuffers();
    expect(broadcast).toHaveBeenNthCalledWith(2, {
      type: 'provider.text_delta',
      payload: { sessionId: 's2', text: 'second', messageId: 'current' },
    });
  });

  it('preserves non-text tool progress after flushing buffered text', () => {
    vi.useFakeTimers();
    const { broadcast, coalescer } = harness();
    coalescer.queueToolProgress({
      sessionId: 's1',
      id: 'tool-1',
      name: 'write',
      event: { type: 'progress', text: 'partial' },
    });
    coalescer.queueToolProgress({
      sessionId: 's1',
      id: 'tool-1',
      name: 'write',
      event: { type: 'file', path: 'src/a.ts', operation: 'edit' },
    });

    expect(broadcast).toHaveBeenNthCalledWith(1, {
      type: 'tool.progress',
      payload: {
        sessionId: 's1',
        name: 'write',
        id: 'tool-1',
        event: { type: 'progress', text: 'partial' },
      },
    });
    expect(broadcast).toHaveBeenNthCalledWith(2, {
      type: 'tool.progress',
      payload: {
        sessionId: 's1',
        id: 'tool-1',
        name: 'write',
        event: { type: 'file', path: 'src/a.ts', operation: 'edit' },
      },
    });
  });

  it('preserves event.data and avoids duplicate newlines when coalescing livePreview tool progress (F165)', () => {
    vi.useFakeTimers();
    const { broadcast, coalescer } = harness();
    coalescer.queueToolProgress({
      sessionId: 's1',
      id: 'tool-write',
      name: 'write',
      event: {
        type: 'progress',
        text: 'line 1\n',
        data: { livePreview: true, filePath: 'src/a.ts' },
      },
    });
    coalescer.queueToolProgress({
      sessionId: 's1',
      id: 'tool-write',
      name: 'write',
      event: {
        type: 'progress',
        text: 'line 2\n',
        data: { livePreview: true, filePath: 'src/a.ts' },
      },
    });
    coalescer.flushAllStreamBuffers();

    expect(broadcast).toHaveBeenCalledWith({
      type: 'tool.progress',
      payload: {
        sessionId: 's1',
        id: 'tool-write',
        name: 'write',
        event: {
          type: 'progress',
          text: 'line 1\nline 2\n',
          data: { livePreview: true, filePath: 'src/a.ts' },
        },
      },
    });
  });
});
