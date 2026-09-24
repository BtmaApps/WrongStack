// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentChatPane, agentConversationEntries } from '../src/agent-chat-pane.js';
import { canComposeForAgent } from '../src/lib/agent-model.js';
import type { AgentTranscriptEntry } from '../src/types.js';

const roots: Array<ReturnType<typeof createRoot>> = [];

function transcript(subagentId: string, content: string): AgentTranscriptEntry[] {
  return [
    {
      id: `${subagentId}-entry`,
      subagentId,
      agentName: subagentId.toUpperCase(),
      content,
      kind: 'status',
      iteration: 1,
      ts: '2026-07-15T12:00:00.000Z',
    },
  ];
}

function Harness() {
  const [selected, setSelected] = useState('leader');
  return (
    <div>
      <button type="button" onClick={() => setSelected('leader')}>
        Leader
      </button>
      <button type="button" onClick={() => setSelected('worker-a')}>
        Worker A
      </button>
      <button type="button" onClick={() => setSelected('worker-b')}>
        Worker B
      </button>
      <section id="agent-panel-leader" hidden={selected !== 'leader'}>
        Leader history
      </section>
      <AgentChatPane
        agent={{ id: 'worker-a', name: 'WORKER A' }}
        entries={transcript('worker-a', 'Worker A history')}
        running
        hidden={selected !== 'worker-a'}
        theme="dark"
      />
      <AgentChatPane
        agent={{ id: 'worker-b', name: 'WORKER B' }}
        entries={transcript('worker-b', 'Worker B history')}
        running={false}
        hidden={selected !== 'worker-b'}
        theme="dark"
      />
      {canComposeForAgent(selected) && <textarea aria-label="Leader message input" />}
    </div>
  );
}

function click(button: HTMLButtonElement): void {
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.replaceChildren();
});

describe('SimpleUI mounted agent chat panes', () => {
  it('keeps assistant/thinking history in the timeline and excludes tool events', () => {
    const entries: AgentTranscriptEntry[] = [
      ...transcript('worker-a', 'Assistant response'),
      {
        ...transcript('worker-a', 'Thinking aloud')[0]!,
        id: 'thinking',
        kind: 'thinking',
      },
      {
        ...transcript('worker-a', 'read({"path":"a.ts"})')[0]!,
        id: 'tool',
        kind: 'tool_use',
        toolName: 'read',
      },
    ];
    expect(agentConversationEntries(entries).map((entry) => entry.kind)).toEqual([
      'status',
      'thinking',
    ]);
  });

  it('switches histories in place and keeps the original pane content nodes mounted', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => root.render(<Harness />));

    const workerA = container.querySelector<HTMLElement>('#agent-panel-worker-a');
    const workerB = container.querySelector<HTMLElement>('#agent-panel-worker-b');
    const workerAEntry = workerA?.querySelector('.agent-transcript-entry');
    const workerBEntry = workerB?.querySelector('.agent-transcript-entry');
    expect(workerA?.hidden).toBe(true);
    expect(workerB?.hidden).toBe(true);

    const buttons = container.querySelectorAll<HTMLButtonElement>('button');
    act(() => click(buttons[1] as HTMLButtonElement));
    expect(workerA?.hidden).toBe(false);
    expect(workerB?.hidden).toBe(true);
    expect(container.querySelector('#agent-panel-worker-a')).toBe(workerA);
    expect(workerA?.querySelector('.agent-transcript-entry')).toBe(workerAEntry);

    act(() => click(buttons[2] as HTMLButtonElement));
    expect(workerA?.hidden).toBe(true);
    expect(workerB?.hidden).toBe(false);
    expect(container.querySelector('#agent-panel-worker-b')).toBe(workerB);
    expect(workerB?.querySelector('.agent-transcript-entry')).toBe(workerBEntry);
  });

  it('exposes the input only while the leader history is selected', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => root.render(<Harness />));

    const buttons = container.querySelectorAll<HTMLButtonElement>('button');
    expect(container.querySelector('[aria-label="Leader message input"]')).not.toBeNull();

    act(() => click(buttons[1] as HTMLButtonElement));
    expect(container.querySelector('[aria-label="Leader message input"]')).toBeNull();

    act(() => click(buttons[0] as HTMLButtonElement));
    expect(container.querySelector('[aria-label="Leader message input"]')).not.toBeNull();
  });
});
