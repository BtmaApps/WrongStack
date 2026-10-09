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
    click('Subscription');
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

  it('adds a catalog provider with a suggested alias and lands on the saved list', async () => {
    const { container, send, emit, click } = mount();
    emit('providers.saved', { providers: [{ id: 'openai', type: 'openai', apiKeys: [] }] });
    emit('provider.catalog', {
      providers: [
        { id: 'openai', name: 'OpenAI', family: 'openai', apiBase: 'https://api.openai.com/v1' },
        { id: 'deepseek', name: 'DeepSeek', family: 'deepseek' },
      ],
    });
    click('Add provider');
    const search = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        search,
        'open',
      );
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.textContent).not.toContain('DeepSeek');
    act(() =>
      Array.from(container.querySelectorAll('.auth-catalog-list button'))
        .find((b) => b.textContent?.includes('OpenAI'))
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    const inputs = container.querySelectorAll<HTMLInputElement>('.auth-form input');
    expect(inputs[0]?.value).toBe('openai-2');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        inputs[1]!,
        'sk-new',
      );
      inputs[1]!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() =>
      container
        .querySelector<HTMLFormElement>('form.auth-form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    const add = send.mock.calls.find(([type]) => type === 'provider.add')?.[1];
    expect(add).toMatchObject({
      id: 'openai-2',
      type: 'openai',
      family: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-new',
    });
    await act(async () =>
      emit('key.operation_result', {
        success: true,
        message: 'Provider "openai-2" added',
        requestId: add.requestId,
      }),
    );
    expect(container.querySelector('[role="status"]')?.className).toContain('ok');
    expect(container.querySelector('[aria-label="Saved providers"]')).not.toBeNull();
  });

  it('replaces a key inline on its own row', async () => {
    const { container, send, emit, click } = mount();
    emit('providers.saved', {
      providers: [
        { id: 'openai', apiKeys: [{ label: 'work', maskedKey: 'sk-a…1234', isActive: true }] },
      ],
    });
    click('Replace');
    const row = container.querySelector('.auth-key-row')!;
    const input = row.querySelector<HTMLInputElement>('input[type="password"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'sk-b',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() =>
      row
        .querySelector('form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    expect(send).toHaveBeenCalledWith(
      'key.update',
      expect.objectContaining({ providerId: 'openai', label: 'work', apiKey: 'sk-b' }),
    );
    const requestId = send.mock.calls.find(([type]) => type === 'key.update')?.[1].requestId;
    await act(async () =>
      emit('key.operation_result', { success: true, message: 'Key saved', requestId }),
    );
    expect(row.querySelector('form')).toBeNull();
  });

  it('shows sign-in progress and returns to the saved list on success', () => {
    const { container, emit, click } = mount();
    emit('auth.oauth.providers', {
      providers: [{ id: 'chatgpt', providerId: 'openai-codex', label: 'ChatGPT' }],
    });
    click('Subscription');
    click('Sign in with ChatGPT');
    emit('auth.oauth.status', {
      kind: 'chatgpt',
      phase: 'awaiting_browser',
      authorizeUrl: 'https://example.test/login',
      bound: false,
    });
    expect(container.querySelector('.auth-login details')?.hasAttribute('open')).toBe(true);
    emit('auth.oauth.status', {
      kind: 'chatgpt',
      phase: 'success',
      message: 'Signed in — saved as openai-codex (3 models).',
    });
    expect(container.querySelector('.auth-login')).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Signed in');
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain(
      'Saved',
    );
  });

  it('edits base URL and models, and clears the allowlist when the field is emptied', async () => {
    const { container, send, emit, click } = mount();
    emit('providers.saved', {
      providers: [
        {
          id: 'local',
          baseUrl: 'http://127.0.0.1:11434/v1',
          models: ['llama3'],
          apiKeys: [],
        },
      ],
    });
    const setInput = (input: HTMLInputElement, value: string) =>
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          value,
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    const submit = () =>
      act(() =>
        container
          .querySelector('form.auth-inline')
          ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
      );
    const answer = async (type: string) => {
      const requestId = send.mock.calls.filter(([t]) => t === type).at(-1)?.[1].requestId;
      await act(async () =>
        emit('key.operation_result', { success: true, message: 'ok', requestId }),
      );
    };

    click(' Edit');
    let [url, models] = Array.from(
      container.querySelectorAll<HTMLInputElement>('form.auth-inline input'),
    );
    expect(url?.value).toBe('http://127.0.0.1:11434/v1');
    expect(models?.value).toBe('llama3');
    setInput(url!, 'http://10.0.0.5:8000/v1');
    setInput(models!, 'qwen3, llama3');
    submit();
    expect(send).toHaveBeenCalledWith(
      'provider.update',
      expect.objectContaining({
        id: 'local',
        baseUrl: 'http://10.0.0.5:8000/v1',
        models: ['qwen3', 'llama3'],
      }),
    );
    await answer('provider.update');
    expect(container.querySelector('form.auth-inline')).toBeNull();

    click(' Edit');
    [url, models] = Array.from(
      container.querySelectorAll<HTMLInputElement>('form.auth-inline input'),
    );
    setInput(models!, '');
    submit();
    expect(send).toHaveBeenCalledWith(
      'provider.clear_models',
      expect.objectContaining({ providerId: 'local' }),
    );
    expect(send.mock.calls.filter(([t]) => t === 'provider.update')).toHaveLength(1);
  });
});
