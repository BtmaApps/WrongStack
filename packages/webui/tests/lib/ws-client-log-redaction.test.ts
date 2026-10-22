import { createSurfaceConnectionState } from '@wrongstack/webui-protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindSocketLifecycle, retryNowHelper } from '../../src/lib/ws-client-connection';

const credential = `ghp_${'A'.repeat(36)}`;
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe('WebSocket error logs', () => {
  it('preserves the socket diagnostic while removing credentials', () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const socket = {} as WebSocket;
    const lifecycle = bindSocketLifecycle(socket, {
      isCurrentGeneration: () => true,
      onOpen() {},
      onMessage() {},
      onError() {},
      onClose() {},
      onTimeout() {},
    });
    try {
      socket.onerror?.(new Error(`Token rejected: ${credential}`) as unknown as Event);
      expect(log).toHaveBeenCalledOnce();
      const frame = JSON.parse(log.mock.calls[0]![0] as string);
      expect(frame.event).toBe('ws_client.error');
      expect(frame.message).toContain('Token rejected');
      expect(frame.message).not.toContain(credential);
    } finally {
      lifecycle.cancelTimeout();
    }
  });
  it('removes credentials from a rejected manual reconnect', async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    retryNowHelper('closed', null, createSurfaceConnectionState(), async () => {
      throw new Error(`Token rejected: ${credential}`);
    });
    await vi.runAllTimersAsync();
    expect(log).toHaveBeenCalledOnce();
    const frame = JSON.parse(log.mock.calls[0]![0] as string);
    expect(frame.event).toBe('ws_client.reconnect_failed');
    expect(frame.message).toContain('Token rejected');
    expect(frame.message).not.toContain(credential);
  });
});
