// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UtilityDock } from '../src/utility-dock.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

function mount(props: React.ComponentProps<typeof UtilityDock> = {}): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<UtilityDock {...props} />));
  return container;
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});

describe('SimpleUI utility dock', () => {
  it('keeps workspace and advanced panels out of the chat edge until requested', () => {
    const container = mount();
    const toggle = container.querySelector<HTMLButtonElement>('.utility-dock-toggle');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.utility-dock-actions')).toBeNull();

    act(() => toggle?.click());
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Workspace');
    expect(container.textContent).toContain('Tools');
    expect(container.textContent).toContain('Plan');
    expect(container.textContent).toContain('Utilities');
    expect(container.textContent).toContain('Project memory');
    expect(container.textContent).toContain('Session health');
  });

  it('opens a chosen panel through the established typed event channel', () => {
    const onMemory = vi.fn();
    window.addEventListener('simpleui:open-memory-drawer', onMemory);
    const container = mount();
    act(() => (container.querySelector('.utility-dock-toggle') as HTMLButtonElement).click());
    act(() =>
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Project memory')
        ?.click(),
    );
    expect(onMemory).toHaveBeenCalledOnce();
    expect(container.querySelector('.utility-dock-actions')).toBeNull();
    window.removeEventListener('simpleui:open-memory-drawer', onMemory);
  });

  it('opens workspace drawers through their existing event channel', () => {
    const onTools = vi.fn();
    window.addEventListener('simpleui:open-workspace-panel', onTools);
    const container = mount();
    act(() => (container.querySelector('.utility-dock-toggle') as HTMLButtonElement).click());
    act(() =>
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Tools')
        ?.click(),
    );
    expect(onTools).toHaveBeenCalledOnce();
    expect(container.querySelector('.utility-dock-actions')).toBeNull();
    window.removeEventListener('simpleui:open-workspace-panel', onTools);
  });

  it('places file changes in the same menu instead of creating a competing fixed button', () => {
    const onOpenFileChanges = vi.fn();
    const container = mount({ fileChangeCount: 3, onOpenFileChanges });
    act(() => (container.querySelector('.utility-dock-toggle') as HTMLButtonElement).click());

    const changes = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Changes3',
    );
    expect(changes?.getAttribute('title')).toBe('3 changed files');
    act(() => changes?.click());
    expect(onOpenFileChanges).toHaveBeenCalledOnce();
    expect(container.querySelector('.utility-dock-actions')).toBeNull();
  });
});
