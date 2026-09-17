// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthPanel } from '../src/auth-panel.js';
import { dispatchSimplePanel } from '../src/lib/panel-events.js';
import type { SimpleSocket } from '../src/lib/ws.js';
import type { ServerMessage } from '../src/types.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
function mount() {
  const listeners = new Set<(message: ServerMessage) => void>();
  const send = vi.fn();
  const socket = {
    send,
    onMessage: (fn: (message: ServerMessage) => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  } as unknown as SimpleSocket;
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<AuthPanel socketRef={{ current: socket }} />));
  act(() => dispatchSimplePanel('open-auth'));
  const emit = (type: ServerMessage['type'], payload: Record<string, unknown>) =>
    act(() => {
      for (const listener of [...listeners]) listener({ type, payload });
    });
  const click = (text: string) =>
    act(() =>
      Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent === text)
        ?.click(),
    );
  return { container, send, emit, click, listeners };
}
afterEach(() => {
  act(() => root?.unmount());
  document.body.replaceChildren();
});
describe('SimpleUI auth panel', () => {
  it('loads shared auth data and requires confirmation before key deletion', async () => {
    const { container, send, emit, click } = mount();
    expect(send).toHaveBeenCalledWith('providers.saved');
    expect(send).toHaveBeenCalledWith('auth.oauth.list');
    emit('providers.saved', {
      providers: [
        { id: 'openai', apiKeys: [{ label: 'work', maskedKey: 'sk-a…1234', isActive: true }] },
      ],
    });
    click('Delete');
    expect(send).not.toHaveBeenCalledWith('key.delete', expect.anything());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('work');
    click('Confirm deletion');
    expect(send).toHaveBeenCalledWith(
      'key.delete',
      expect.objectContaining({ providerId: 'openai', label: 'work' }),
    );
    await act(async () =>
      emit('key.operation_result', {
        success: true,
        message: 'Unrelated preference saved',
        requestId: 'another-operation',
      }),
    );
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Saving…');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    const requestId = send.mock.calls.find(([type]) => type === 'key.delete')?.[1].requestId;
    await act(async () =>
      emit('key.operation_result', { success: false, message: 'Disk full', requestId }),
    );
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Disk full');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('cancels a pending sign-in and unsubscribes when a peer panel opens', () => {
    const { container, send, emit, click, listeners } = mount();
    emit('auth.oauth.providers', {
      providers: [{ id: 'chatgpt', providerId: 'openai-codex', label: 'ChatGPT' }],
    });
    click('Sign in with ChatGPT');
    expect(send).toHaveBeenCalledWith('auth.oauth.start', {
      kind: 'chatgpt',
      providerId: 'openai-codex',
    });
    emit('auth.oauth.status', {
      kind: 'chatgpt',
      phase: 'awaiting_browser',
      authorizeUrl: 'https://example.test/login',
    });
    expect(container.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
    act(() => dispatchSimplePanel('open-settings'));
    expect(send).toHaveBeenCalledWith('auth.oauth.cancel', { kind: 'chatgpt' });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(listeners.size).toBe(0);
  });
});
