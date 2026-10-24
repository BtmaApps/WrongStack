// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StopAllDialog } from '../src/components/stop-all-dialog';
import { stopAllPrompt } from '../src/lib/stop-all-prompt';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
});

function mount(open: boolean, leaderRunning: boolean, agentNames: string[]) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() =>
    root.render(
      createElement(StopAllDialog, { open, leaderRunning, agentNames, onCancel, onConfirm }),
    ),
  );
  return { onCancel, onConfirm };
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const action = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('.dialog-actions button')].find(
    (item) => item.textContent === label,
  )!;

describe('stop-all confirmation dialog', () => {
  it('renders nothing while closed', () => {
    mount(false, true, ['scout']);
    expect(dialog()).toBe(null);
  });

  it('shows the shared prompt and focuses the destructive action', () => {
    const prompt = stopAllPrompt(true, ['scout', 'builder']);
    mount(true, true, ['scout', 'builder']);
    const node = dialog()!;
    expect(node.textContent).toContain(prompt.title);
    expect(node.textContent).toContain(prompt.body);
    expect(document.activeElement).toBe(action('Stop all'));
  });

  it('routes the buttons to confirm and cancel', () => {
    const { onCancel, onConfirm } = mount(true, false, ['scout']);
    act(() => action('Stop all').click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    act(() => action('Keep working').click());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('treats dismissing with Escape as cancel', () => {
    const { onCancel, onConfirm } = mount(true, true, []);
    act(() => {
      dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
