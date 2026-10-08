import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { KanbanTask } from '@wrongstack/kanban';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KanbanTaskInspector } from '../../src/components/KanbanTaskInspector';

vi.mock('@/hooks/useKanbanMeta', () => ({
  useKanbanMeta: () => ({
    tools: [],
    skills: [],
    fallbackProfiles: {},
    sessionProvider: '',
    sessionModel: '',
  }),
}));
vi.mock('@/hooks/useProviderModels', () => ({ useProviderModels: () => [] }));

const task = {
  id: 'task-1',
  title: 'Example task',
  boundary: 'Scope: example',
  status: 'ready',
  priority: 'medium',
  columnId: 'col-1',
} as unknown as KanbanTask;

const baseProps = {
  boards: [] as Array<{ id: string; title: string }>,
  board: null,
  task,
  runLink: null,
  onSelectTask: vi.fn(),
  sendKanban: vi.fn(),
  sendRaw: vi.fn(),
  activityEvents: [],
  activityLoading: false,
  activityError: null,
  refreshActivity: vi.fn(),
};

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('KanbanTaskInspector keyboard semantics', () => {
  it('uses roving tabindex on the tab bar and moves focus with Arrow keys', async () => {
    render(<KanbanTaskInspector {...baseProps} onClose={vi.fn()} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBeGreaterThan(1);
    expect(tabs[0].getAttribute('tabindex')).toBe('0');
    for (const tab of tabs.slice(1)) expect(tab.getAttribute('tabindex')).toBe('-1');

    act(() => tabs[0].focus());
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    await waitFor(() => {
      expect(tabs[1].getAttribute('aria-selected')).toBe('true');
      expect(document.activeElement).toBe(tabs[1]);
      expect(tabs[1].getAttribute('tabindex')).toBe('0');
      expect(tabs[0].getAttribute('tabindex')).toBe('-1');
    });

    fireEvent.keyDown(tabs[1], { key: 'ArrowLeft' });
    await waitFor(() => {
      expect(tabs[0].getAttribute('aria-selected')).toBe('true');
      expect(document.activeElement).toBe(tabs[0]);
    });

    fireEvent.keyDown(tabs[0], { key: 'End' });
    await waitFor(() => {
      expect(tabs[tabs.length - 1].getAttribute('aria-selected')).toBe('true');
      expect(document.activeElement).toBe(tabs[tabs.length - 1]);
    });
  });

  it('closes on Escape and returns focus to the element that opened it', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'opener';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const onClose = vi.fn();
    render(<KanbanTaskInspector {...baseProps} onClose={onClose} />);
    const aside = screen.getByRole('complementary', { hidden: true });
    await waitFor(() => expect(document.activeElement).toBe(aside));

    fireEvent.keyDown(aside, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    cleanup();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('ignores Escape pressed inside a form field', () => {
    const onClose = vi.fn();
    render(<KanbanTaskInspector {...baseProps} onClose={onClose} />);
    const textarea = document.querySelector('textarea');
    expect(textarea).toBeTruthy();
    fireEvent.keyDown(textarea as Element, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
