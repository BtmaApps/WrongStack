import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ClientStdioHost, notifyStdio } from '../src/client-stdio.js';

afterEach(() => vi.useRealTimers());

describe('stdio notification drain lifecycle', () => {
  it.each(['close', 'drain', 'error', 'timeout'] as const)(
    'settles on %s and releases temporary stream ownership',
    async (mode) => {
      vi.useFakeTimers();
      const stdin = Object.assign(new EventEmitter(), { write: () => false });
      const host = {
        opts: { name: 'fixture' },
        child: { stdin },
        _drainPending: false,
      } as unknown as ClientStdioHost;
      const outcome = notifyStdio(host, 'notifications/test', {}).then(
        () => ({ ok: true, error: '' }),
        (error: Error) => ({ ok: false, error: error.message }),
      );
      try {
        expect(host._drainPending).toBe(true);
        if (mode === 'timeout') await vi.advanceTimersByTimeAsync(500);
        else if (mode === 'error') stdin.emit('error', new Error('fixture write failed'));
        else stdin.emit(mode);
        // The close callback runs before any fallback deadline is released.
        expect(host._drainPending).toBe(false);
        expect(stdin.listenerCount('drain')).toBe(0);
        expect(stdin.listenerCount('error')).toBe(0);
        expect(stdin.listenerCount('close')).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
        const result = await outcome;
        expect(result.ok).toBe(mode === 'drain');
        if (mode === 'close') expect(result.error).toContain('stdin closed');
        if (mode === 'error') expect(result.error).toContain('fixture write failed');
        if (mode === 'timeout') expect(result.error).toContain('drain timeout');
      } finally {
        await vi.runAllTimersAsync();
        await outcome;
      }
    },
  );
});
