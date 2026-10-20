import { describe, expect, it, vi } from 'vitest';
import type { ClientState } from '../src/project-server-options.js';
import { consumeClientFrames } from '../src/project-server-wire.js';

const CAP = 8 * 1024 * 1024;

function makeState() {
  const destroy = vi.fn();
  const state = {
    socket: { destroy },
    buffer: '',
    active: new Map(),
    connectedAt: Date.now(),
    spoken: false,
    authenticated: false,
    unsettled: new Set(),
    clientId: 'frame-cap-test',
  } as unknown as ClientState;
  return { state, destroy };
}

describe('SAGE server inbound frame cap', () => {
  it('accepts multiple complete frames whose cumulative chunk exceeds the cap', () => {
    const { state, destroy } = makeState();
    let handled = 0;
    const frame = '{"type":"cancel","id":1}\n';
    const frameCount = Math.ceil((CAP + 1) / frame.length);
    const chunk = frame.repeat(frameCount);

    consumeClientFrames(state, chunk, () => {
      handled++;
    });

    expect(Buffer.byteLength(chunk)).toBeGreaterThan(CAP);
    expect(destroy).not.toHaveBeenCalled();
    expect(handled).toBe(frameCount);
    expect(state.buffer).toBe('');
  });

  it('destroys the socket for one complete frame exceeding the cap', () => {
    const { state, destroy } = makeState();
    const handled = vi.fn();
    const oversized = `${JSON.stringify({ type: 'cancel', id: 1, padding: 'x'.repeat(CAP) })}\n`;

    consumeClientFrames(state, oversized, handled);

    expect(destroy).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('exceeded maximum size') }),
    );
    expect(handled).not.toHaveBeenCalled();
  });
});
