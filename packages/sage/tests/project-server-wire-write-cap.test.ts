import { describe, expect, it, vi } from 'vitest';
import type { ClientState } from '../src/project-server-options.js';
import { writeEncoded } from '../src/project-server-wire.js';

const CAP = 8 * 1024 * 1024;

function makeState(writableLength: number) {
  const write = vi.fn();
  const destroy = vi.fn();
  return {
    state: {
      socket: { destroyed: false, writableEnded: false, writableLength, write, destroy },
    } as unknown as ClientState,
    write,
    destroy,
  };
}

describe('SAGE server outbound write cap', () => {
  it('allows a frame that brings queued bytes exactly to the cap', () => {
    const { state, write, destroy } = makeState(CAP - 20);
    writeEncoded(state, 'x'.repeat(20));
    expect(destroy).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('destroys the socket before a frame pushes cumulative queued bytes over the cap', () => {
    const { state, write, destroy } = makeState(CAP - 10);
    writeEncoded(state, 'x'.repeat(20));
    expect(write).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('fell too far behind') }),
    );
  });
});
