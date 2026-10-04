import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ACPClientTransport } from '../src/agent/stdio-transport.js';
import { cancelLateAcpSession } from '../src/client/acp-late-session.js';
import type { SessionId } from '../src/types/acp-v1.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('late ACP cancel timer lifecycle', () => {
  it.each(['throw', 'reject'])('cleans the timeout when send fails via %s', async (mode) => {
    vi.useFakeTimers();
    let finished!: () => void;
    const warning = new Promise<void>((resolve) => {
      finished = resolve;
    });
    vi.spyOn(console, 'warn').mockImplementation(() => finished());
    let release!: (id: SessionId) => void;
    const created = new Promise<SessionId>((resolve) => {
      release = resolve;
    });
    const transport = {
      send: () => {
        if (mode === 'throw') throw new Error('send failed');
        return Promise.reject(new Error('send failed'));
      },
    } as unknown as ACPClientTransport;
    cancelLateAcpSession(transport, created);
    release('late-session' as SessionId);
    await warning;
    expect(vi.getTimerCount()).toBe(0);
  });
});
