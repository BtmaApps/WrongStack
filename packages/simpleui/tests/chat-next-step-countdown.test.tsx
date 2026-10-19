// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatMessageList } from '../src/chat-message-list.js';
import type { ChatMessage } from '../src/types.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Array<ReturnType<typeof createRoot>> = [];

const message: ChatMessage = {
  id: 'a1',
  role: 'assistant',
  text: 'Done.\n<nextsteps>\n1. Run the focused tests\n2. Review the diff\n</nextsteps>',
  final: true,
  autoEligible: true,
  ts: '2026-07-31T12:00:00.000Z',
};

function render(nextStepAuto?: {
  countdown: { messageId: string; stepIndex: number; remaining: number } | null;
  cancel: () => void;
}) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => {
    root.render(
      <ChatMessageList
        transcript={{
          messages: [message],
          copiedMessageId: null,
          running: false,
          activity: '',
        }}
        display={{ theme: 'dark' }}
        emptyState={null}
        onCopyMessage={() => undefined}
        onSelectNextStep={() => undefined}
        consumedNextSteps={new Set<string>()}
        nextStepAuto={nextStepAuto}
      />,
    );
  });
  return host;
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});

describe('SimpleUI next-step auto-submit countdown', () => {
  it('shows no countdown strip without an armed countdown', () => {
    const host = render({ countdown: null, cancel: () => undefined });
    expect(host.querySelector('.next-step-countdown')).toBeNull();
    expect(host.querySelector('.next-step-queued')).toBeNull();
  });

  it('shows the countdown, highlights the queued step and cancels on click', () => {
    const cancel = vi.fn();
    const host = render({ countdown: { messageId: 'a1', stepIndex: 2, remaining: 7 }, cancel });

    const strip = host.querySelector('.next-step-countdown');
    expect(strip?.textContent).toContain('Auto-submitting step 2 in 7s');
    const queued = host.querySelectorAll('.next-step-queued');
    expect(queued).toHaveLength(1);
    expect(queued[0]?.textContent).toContain('Review the diff');

    act(() => strip?.querySelector('button')?.click());
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
