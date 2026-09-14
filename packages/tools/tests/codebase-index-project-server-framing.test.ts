import { describe, expect, it, vi } from 'vitest';
import { encodeBinaryFrame } from '../src/codebase-index/binary-frame.js';
import { consumeClientChunk } from '../src/codebase-index/project-server-framing.js';
import type { ClientState } from '../src/codebase-index/project-server-types.js';

function fakeState(): ClientState & { socket: { destroy: ReturnType<typeof vi.fn> } } {
  return {
    socket: {
      destroyed: false,
      destroy: vi.fn(),
      writableLength: 0,
      write: vi.fn(),
    } as never,
    buffer: Buffer.alloc(0),
    cancelled: new Set(),
    cancel: new Map(),
    watchExternal: false,
    debounceMs: 0,
    coalesceWindowMs: 0,
    lastSeenAt: 0,
    binary: false,
  } as never;
}

describe('project server framing — pre-auth frame validation', () => {
  it.each(['null', '[]', '42', '"ping"', '{}', '{"type":7}'])(
    'drops the JSON frame %s without dispatching it',
    (frame) => {
      const state = fakeState();
      const onMessage = vi.fn();
      consumeClientChunk(state, Buffer.from(`${frame}\n`), onMessage);
      expect(onMessage).not.toHaveBeenCalled();
      expect(state.socket.destroy).toHaveBeenCalled();
    },
  );

  it('drops a binary nil frame without dispatching it', () => {
    const state = fakeState();
    const onMessage = vi.fn();
    consumeClientChunk(state, encodeBinaryFrame(null), onMessage);
    expect(onMessage).not.toHaveBeenCalled();
    expect(state.socket.destroy).toHaveBeenCalled();
  });

  it('dispatches well-formed frames in order', () => {
    const state = fakeState();
    const onMessage = vi.fn();
    consumeClientChunk(
      state,
      Buffer.from('{"type":"ping","id":1}\n{"type":"cancel","id":2}\n'),
      onMessage,
    );
    expect(onMessage.mock.calls.map((call) => call[1].id)).toEqual([1, 2]);
    expect(state.socket.destroy).not.toHaveBeenCalled();
  });

  it('contains a rejecting handler to its connection instead of an unhandled rejection', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const state = fakeState();
      consumeClientChunk(state, Buffer.from('{"type":"ping","id":1}\n'), async () => {
        throw new Error('handler bug');
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).not.toHaveBeenCalled();
      expect(state.socket.destroy).toHaveBeenCalled();
      expect(String(stderr.mock.calls.at(-1)?.[0])).toContain('handler bug');
    } finally {
      process.off('unhandledRejection', unhandled);
      stderr.mockRestore();
    }
  });
});
