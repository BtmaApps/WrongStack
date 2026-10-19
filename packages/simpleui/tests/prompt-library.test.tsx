// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import prompt from '../../core/data/prompts/prompts/design/fluidflow-design-d2-glassmorphism-style.json';
import type { SimpleSocket } from '../src/lib/ws.js';
import { PromptLibrary } from '../src/prompt-library.js';

let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = '';
  localStorage.clear();
});

function socketFixture(reply = true) {
  const listeners = new Set<(message: unknown) => void>();
  const send = vi.fn((type: string, payload: Record<string, unknown>) => {
    queueMicrotask(() => {
      const data =
        type === 'prompts.list'
          ? { enabled: reply, prompts: [prompt] }
          : { ...prompt, found: true };
      for (const listener of listeners)
        listener({ type, payload: { ...data, requestId: payload.requestId } });
    });
  });
  return {
    socket: {
      send,
      onMessage(listener: (message: unknown) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    } as unknown as SimpleSocket,
    send,
  };
}
async function mount(socket: SimpleSocket, recall: (text: string) => void) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(<PromptLibrary socketRef={{ current: socket }} onRecall={recall} />),
  );
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-label="Open prompt library"]')!.click(),
  );
}
async function click(text: string) {
  const button = [...document.querySelectorAll('button')].find((button) =>
    button.textContent?.includes(text),
  );
  expect(button, text).toBeDefined();
  await act(async () => button!.click());
}
async function setField(selector: string, value: string) {
  const field = document.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    selector,
  )!;
  const proto =
    field.tagName === 'SELECT'
      ? HTMLSelectElement.prototype
      : field.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(field, value);
    field.dispatchEvent(
      new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }),
    );
  });
}

describe('shared SimpleUI prompt library', () => {
  it('loads design styles from the shared backend and recalls the selected level', async () => {
    const { socket, send } = socketFixture();
    const recall = vi.fn();
    await mount(socket, recall);
    await click('Glassmorphism Style');
    await setField('[aria-label="Prompt detail level"]', 'simple');
    expect(document.querySelector('.prompt-library-preview')?.textContent).toBe(
      prompt.variants.simple,
    );
    await click('Use prompt in draft');
    expect(recall).toHaveBeenCalledWith(prompt.variants.simple);
    expect(send).toHaveBeenCalledWith('prompts.used', { slug: prompt.slug });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps personal saved prompts usable when the shared library is disabled', async () => {
    const { socket } = socketFixture(false);
    const recall = vi.fn();
    await mount(socket, recall);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('unavailable');
    await setField('[placeholder="Label"]', 'My prompt');
    await setField('[placeholder="Prompt text…"]', 'Keep this prompt');
    await click('Save');
    await click('My prompt');
    expect(recall).toHaveBeenCalledWith('Keep this prompt');
  });
});
