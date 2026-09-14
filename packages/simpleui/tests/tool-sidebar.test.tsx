// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { dispatchOpenWorkspacePanel } from '../src/lib/panel-events.js';
import { createWorklistStore } from '../src/lib/worklist-store.js';
import { ToolSidebar } from '../src/tool-sidebar.js';
import type { ToolCallInfo } from '../src/types.js';

const roots: Array<ReturnType<typeof createRoot>> = [];
const calls: ToolCallInfo[] = [
  {
    id: 'read-1',
    name: 'read',
    input: { path: 'src/app.tsx' },
    status: 'done',
    output: 'file content',
    ok: true,
    durationMs: 12,
  },
];

function click(element: Element): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});

describe('SimpleUI workspace drawer', () => {
  it('has no independent launcher: the shared workspace menu owns entry points', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => root.render(<ToolSidebar agentId="leader" agentName="LEADER" calls={[]} />));

    expect(container.querySelector('.tool-sidebar-launcher')).toBeNull();
  });

  it('does not render the panel until requested, then closes with Escape', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => root.render(<ToolSidebar agentId="worker-1" agentName="WORKER" calls={calls} />));

    expect(container.querySelector('#tool-sidebar')).toBeNull();

    act(() => dispatchOpenWorkspacePanel('tools'));
    const panel = container.querySelector<HTMLElement>('#tool-sidebar');
    expect(panel?.dataset['agentId']).toBe('worker-1');
    expect(panel?.textContent).toContain('read');

    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(container.querySelector('#tool-sidebar')).toBeNull();
  });

  it('requests a worklist only on first open and renders its badge updates', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    const store = createWorklistStore();
    store.reset('session-1');
    const requested: string[] = [];
    act(() =>
      root.render(
        <ToolSidebar
          agentId="leader"
          agentName="LEADER"
          calls={calls}
          worklists={store}
          requestWorklist={(view) => requested.push(view)}
        />,
      ),
    );

    await act(async () => {
      dispatchOpenWorkspacePanel('todos');
      await import('../src/worklist-sidebar.js');
    });
    expect(requested).toEqual(['todos']);

    await act(async () => {
      store.applyMessage({
        type: 'todos.updated',
        payload: {
          sessionId: 'session-1',
          todos: [{ id: 'todo-1', content: 'Add SimpleUI todos', status: 'pending' }],
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.textContent).toContain('Add SimpleUI todos');

    act(() => dispatchOpenWorkspacePanel('todos'));
    act(() => dispatchOpenWorkspacePanel('todos'));
    expect(requested).toEqual(['todos']);
  });

  it('shows tool input/output only after expanding a call', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => root.render(<ToolSidebar agentId="leader" agentName="LEADER" calls={calls} />));

    act(() => dispatchOpenWorkspacePanel('tools'));
    expect(container.textContent).not.toContain('src/app.tsx');

    const callTrigger = container.querySelector('.tool-sidebar-call-trigger');
    act(() => click(callTrigger as Element));
    expect(container.textContent).toContain('src/app.tsx');
    expect(container.textContent).toContain('file content');
  });
});
