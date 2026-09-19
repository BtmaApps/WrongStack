// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrainPanel } from '../src/brain-panel.js';
import { dispatchSimplePanel } from '../src/lib/panel-events.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

/** A socket whose `onMessage` subscriber can be driven from the test. */
function socketHarness() {
  const listeners: Array<(msg: { type: string; payload?: unknown }) => void> = [];
  const sent: Array<{ type: string; payload?: Record<string, unknown> }> = [];
  return {
    sent,
    emit: (msg: { type: string; payload?: unknown }) => {
      for (const listener of [...listeners]) listener(msg);
    },
    socket: {
      send: (type: string, payload?: Record<string, unknown>) => void sent.push({ type, payload }),
      onMessage: (fn: (msg: { type: string; payload?: unknown }) => void) => {
        listeners.push(fn);
        return () => {
          const i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        };
      },
    },
  };
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function renderPanel() {
  const harness = socketHarness();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<BrainPanel socketRef={{ current: harness.socket as never }} />));
  // The panel opens on the shared panel-event bus.
  act(() => dispatchSimplePanel('open-brain-panel'));
  return { container, ...harness };
}

describe('BrainPanel — answers', () => {
  function ask(container: HTMLElement) {
    const input = container.querySelector('input')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'Ship it?',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() =>
      Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent === 'Ask')!
        .click(),
    );
  }

  it('keeps an in-flight answer when the panel was closed', () => {
    const { container, emit, sent } = renderPanel();
    ask(container);
    expect(sent.some((message) => message.type === 'brain.ask')).toBe(true);
    expect(container.textContent).toContain('Thinking…');
    act(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    act(() =>
      emit({
        type: 'brain.answer',
        payload: {
          question: 'Ship it?',
          decision: { type: 'answer', text: 'Ready to ship.' },
        },
      }),
    );
    act(() => dispatchSimplePanel('open-brain-panel'));
    expect(container.textContent).toContain('Ready to ship.');
    expect(container.textContent).not.toContain('Thinking…');
  });

  it('ignores another request reply even when its question matches', () => {
    const { container, sent, emit } = renderPanel();
    ask(container);
    const requestId = sent.find((message) => message.type === 'brain.ask')?.payload?.requestId;
    expect(requestId).toEqual(expect.any(String));
    act(() =>
      emit({
        type: 'brain.answer',
        payload: {
          requestId: 'old-request',
          question: 'Ship it?',
          decision: { type: 'answer', text: 'Stale answer' },
        },
      }),
    );
    expect(container.textContent).toContain('Thinking…');
    expect(container.textContent).not.toContain('Stale answer');
    act(() =>
      emit({
        type: 'key.operation_result',
        payload: {
          requestId: 'old-request',
          success: false,
          message: 'Brain consultation failed: old',
        },
      }),
    );
    expect(container.textContent).toContain('Thinking…');
    act(() =>
      emit({
        type: 'brain.answer',
        payload: {
          requestId,
          question: 'Ship it?',
          decision: { type: 'answer', text: 'Current answer' },
        },
      }),
    );
    expect(container.textContent).toContain('Current answer');
    expect(container.textContent).not.toContain('Thinking…');
    act(() =>
      emit({
        type: 'brain.answer',
        payload: {
          requestId: 'old-request',
          question: 'Ship it?',
          decision: { type: 'answer', text: 'Stale answer' },
        },
      }),
    );
    expect(container.textContent).toContain('Current answer');
  });

  it('clears pending state on a Brain failure but ignores unrelated operation failures', () => {
    const { container, emit } = renderPanel();
    ask(container);
    act(() =>
      emit({
        type: 'key.operation_result',
        payload: { success: false, message: 'File read failed' },
      }),
    );
    expect(container.textContent).toContain('Thinking…');
    act(() =>
      emit({
        type: 'key.operation_result',
        payload: { success: false, message: 'Brain consultation failed: offline' },
      }),
    );
    expect(container.textContent).not.toContain('Thinking…');
    expect(container.textContent).toContain('Brain consultation failed: offline');
  });

  it('shows the decision text, not the word "answer"', () => {
    const { container, emit } = renderPanel();

    act(() =>
      emit({
        type: 'brain.answer',
        payload: {
          question: 'Ship it?',
          decision: { type: 'answer', text: 'Ship behind a flag.', rationale: 'Reversible.' },
        },
      }),
    );

    // The panel read `decision.reason ?? decision.type`, and an `answer`
    // carries neither — so every successful reply rendered as "answer".
    expect(container.textContent).toContain('Ship behind a flag.');
    expect(container.textContent).toContain('Reversible.');
  });

  it('falls back to the chosen option id when the answer carries no text', () => {
    const { container, emit } = renderPanel();

    act(() =>
      emit({
        type: 'brain.answer',
        payload: { question: 'Merge?', decision: { type: 'answer', optionId: 'merge' } },
      }),
    );

    expect(container.textContent).toContain('merge');
  });

  it('shows the reason for a denial', () => {
    const { container, emit } = renderPanel();

    act(() =>
      emit({
        type: 'brain.answer',
        payload: {
          question: 'Force push?',
          decision: { type: 'deny', reason: 'Shared branch — not reversible.' },
        },
      }),
    );

    expect(container.textContent).toContain('Shared branch');
  });

  it('shows the prompt when the Brain escalates instead of deciding', () => {
    const { container, emit } = renderPanel();

    act(() =>
      emit({
        type: 'brain.answer',
        payload: {
          question: 'Deploy?',
          decision: { type: 'ask_human', prompt: 'Pick a deploy window.' },
        },
      }),
    );

    expect(container.textContent).toContain('Pick a deploy window.');
  });
});

describe('BrainPanel — tolerant payloads', () => {
  it('reads a decision that arrived without its type discriminator', () => {
    const { container, emit } = renderPanel();

    act(() =>
      emit({
        type: 'brain.answer',
        payload: { question: 'Proceed?', decision: { reason: 'Yes, guarded.' } },
      }),
    );

    expect(container.textContent).toContain('Yes, guarded.');
  });

  it('falls back to a placeholder rather than rendering nothing', () => {
    const { container, emit } = renderPanel();

    act(() => emit({ type: 'brain.answer', payload: { question: 'Proceed?', decision: {} } }));

    expect(container.textContent).toContain('Decided.');
  });
});
