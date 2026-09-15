// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimpleSocket } from '../src/lib/ws.js';
import { UserInputModal } from '../src/user-input-modal.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots.length = 0;
  document.body.innerHTML = '';
});

describe('SimpleUI structured user input', () => {
  it('preselects the recommendation, edits another tab, and submits one result', () => {
    const send = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    act(() =>
      root.render(
        <UserInputModal
          send={send}
          queuedCount={1}
          pending={{
            sessionId: 's1',
            request: {
              id: 'r1',
              title: 'Decisions',
              tabs: [
                {
                  id: 'data',
                  label: 'Data',
                  questions: [
                    {
                      id: 'db',
                      prompt: 'Database?',
                      kind: 'single_select',
                      required: true,
                      options: [
                        { id: 'pg', label: 'PostgreSQL' },
                        { id: 'sqlite', label: 'SQLite' },
                      ],
                      recommendedOptionIds: ['pg'],
                      recommendationReason: 'Best concurrency.',
                      allowCustomResponse: true,
                    },
                  ],
                },
                {
                  id: 'brand',
                  label: 'Brand',
                  questions: [
                    {
                      id: 'name',
                      prompt: 'Tenant name?',
                      kind: 'text',
                      required: true,
                      recommendedText: 'Example Inc.',
                    },
                  ],
                },
              ],
            },
          }}
        />,
      ),
    );

    expect(
      (host.querySelector('input[value="pg"]') as HTMLInputElement | null)?.checked ??
        (host.querySelector('input[type="radio"]') as HTMLInputElement).checked,
    ).toBe(true);
    const custom = host.querySelector('input[aria-label="Custom answer"]') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        custom,
        'CockroachDB',
      );
      custom.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(
      (host.querySelector('input[aria-label="Select custom answer"]') as HTMLInputElement).checked,
    ).toBe(true);
    expect((host.querySelector('input[type="radio"]') as HTMLInputElement).checked).toBe(false);
    act(() => (host.querySelector('input[type="radio"]') as HTMLInputElement).click());
    const brand = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.startsWith('Brand'),
    )!;
    act(() => brand.click());
    const textarea = host.querySelector('textarea')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
        textarea,
        'Acme',
      );
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const submit = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Submit answers',
    )!;
    act(() => submit.click());
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toBe('user.input_submit');
    expect(send.mock.calls[0]?.[1].response.answers).toEqual([
      expect.objectContaining({
        questionId: 'db',
        selectedOptionIds: ['pg'],
        usedRecommendation: true,
      }),
      expect.objectContaining({ questionId: 'name', text: 'Acme', usedRecommendation: false }),
    ]);
  });

  it('submits an explicit per-question model delegation', () => {
    const send = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    act(() =>
      root.render(
        <UserInputModal
          send={send}
          queuedCount={1}
          pending={{
            request: {
              id: 'delegated',
              title: 'Decision',
              tabs: [
                {
                  id: 'main',
                  label: 'Main',
                  questions: [{ id: 'name', prompt: 'Tenant name?', kind: 'text', required: true }],
                },
              ],
            },
          }}
        />,
      ),
    );

    const delegate = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.startsWith('You decide'),
    )!;
    act(() => delegate.click());
    const submit = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Submit answers',
    )!;
    act(() => submit.click());

    expect(send.mock.calls[0]?.[1].response.answers[0]).toEqual({
      questionId: 'name',
      selectedOptionIds: [],
      delegated: true,
      usedRecommendation: false,
    });
  });
});

describe('UserInputModal offline submit (soft-lock reproduction)', () => {
  /**
   * Minimal WebSocket stand-in for SimpleSocket: starts CLOSED (the
   * "disconnected mid-form" state), records flushed frames, and lets the
   * test fire the `open` transition to drain SimpleSocket's offline queue.
   */
  class StubWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    readyState = StubWebSocket.CLOSED;
    sent: string[] = [];
    private listeners = new Map<string, Array<() => void>>();
    constructor(_url: string) {
      instances.push(this);
    }
    addEventListener(type: string, listener: () => void): void {
      const list = this.listeners.get(type) ?? [];
      list.push(listener);
      this.listeners.set(type, list);
    }
    send(data: string): void {
      this.sent.push(data);
    }
    close(): void {
      this.readyState = StubWebSocket.CLOSED;
    }
    fire(type: 'open' | 'close'): void {
      this.readyState = type === 'open' ? StubWebSocket.OPEN : StubWebSocket.CLOSED;
      for (const listener of this.listeners.get(type) ?? []) listener();
    }
  }
  const instances: StubWebSocket[] = [];

  afterEach(() => {
    instances.length = 0;
    vi.useRealTimers();
  });

  it('drops the submit from the disconnected queue on overflow; the submit timeout unlocks the form', async () => {
    vi.stubGlobal('WebSocket', StubWebSocket);
    const socket = new SimpleSocket({ onMessage: () => {}, onState: () => {} });
    try {
      await socket.connect(); // no token in jsdom → no /ws-auth fetch; stub never opens
      vi.useFakeTimers(); // arm BEFORE the submit so the timeout lands on the fake clock
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      roots.push(root);
      act(() =>
        root.render(
          <UserInputModal
            send={(type, payload) => socket.send(type, payload)}
            queuedCount={1}
            pending={{
              sessionId: 's1',
              request: {
                id: 'lock-r1',
                title: 'Decisions',
                tabs: [
                  {
                    id: 'main',
                    label: 'Main',
                    questions: [
                      {
                        id: 'db',
                        prompt: 'Database?',
                        kind: 'single_select',
                        required: true,
                        options: [
                          { id: 'pg', label: 'PostgreSQL' },
                          { id: 'sqlite', label: 'SQLite' },
                        ],
                        recommendedOptionIds: ['pg'],
                      },
                    ],
                  },
                ],
              },
            }}
          />,
        ),
      );

      // The recommendation is preselected → the form is valid immediately.
      const submit = [...host.querySelectorAll('button')].find(
        (button) => button.textContent === 'Submit answers',
      )!;
      act(() => (submit as HTMLButtonElement).click());
      expect((submit as HTMLButtonElement).textContent).toBe('Submitting…');
      expect((submit as HTMLButtonElement).disabled).toBe(true);

      // Overflow SimpleSocket's offline queue (limit 100): the oldest entry —
      // the user.input_submit frame — is silently dropped.
      for (let i = 0; i < 100; i += 1) socket.send('prefs.get', {});
      instances[0]!.fire('open'); // reconnect: the queue flushes to the wire
      const frames = instances[0]!.sent;
      expect(frames.length).toBe(100);
      expect(frames.some((frame) => frame.includes('user.input_submit'))).toBe(false);

      // The submit never reached the wire and nothing will resolve it
      // server-side — only the client-side submit timeout (10s) can unlock
      // the form now.
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect((submit as HTMLButtonElement).disabled).toBe(false);
      expect((submit as HTMLButtonElement).textContent).toBe('Submit answers');
      expect(host.querySelector('.fallback-modal-footer span')?.textContent ?? '').toContain(
        'No confirmation received',
      );
    } finally {
      socket.close();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('cancel reports status cancelled and unlocks a submitting form immediately', () => {
    const send = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    act(() =>
      root.render(
        <UserInputModal
          send={send}
          queuedCount={1}
          pending={{
            sessionId: 's1',
            request: {
              id: 'cancel-r1',
              title: 'Decisions',
              tabs: [
                {
                  id: 'main',
                  label: 'Main',
                  questions: [
                    {
                      id: 'db',
                      prompt: 'Database?',
                      kind: 'single_select',
                      required: true,
                      options: [
                        { id: 'pg', label: 'PostgreSQL' },
                        { id: 'sqlite', label: 'SQLite' },
                      ],
                      recommendedOptionIds: ['pg'],
                    },
                  ],
                },
              ],
            },
          }}
        />,
      ),
    );
    const submit = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Submit answers',
    )!;
    act(() => (submit as HTMLButtonElement).click());
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    const cancel = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Cancel',
    )!;
    act(() => (cancel as HTMLButtonElement).click());

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]?.[1].response).toMatchObject({ status: 'submitted' });
    expect(send.mock.calls[1]?.[0]).toBe('user.input_submit');
    expect(send.mock.calls[1]?.[1].response).toEqual({
      requestId: 'cancel-r1',
      status: 'cancelled',
      answers: [],
    });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    expect((submit as HTMLButtonElement).textContent).toBe('Submit answers');
    expect(host.querySelector('.fallback-modal-footer span')?.textContent ?? '').toContain(
      'Cancel requested',
    );
  });
});
