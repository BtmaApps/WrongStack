// @vitest-environment jsdom

import { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSkillMentionPicker } from '../src/hooks/use-skill-mention-picker.js';

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('useSkillMentionPicker — popup rendering', () => {
  it('renders real skill names, not the literal ${skill.name} text', () => {
    const sentPayloads: Array<{ requestId?: string }> = [];
    let listener: ((message: unknown) => void) | null = null;
    const client = {
      send: (_type: string, payload: { requestId?: string }) => {
        sentPayloads.push(payload);
      },
      onMessage: (handler: (message: unknown) => void) => {
        listener = handler;
        return () => {
          listener = null;
        };
      },
    };

    let captured: ReturnType<typeof useSkillMentionPicker> | null = null;
    function Probe() {
      const [input, setInput] = useState('$sec');
      const textareaRef = useRef<HTMLTextAreaElement | null>(null);
      const picker = useSkillMentionPicker(
        input,
        setInput,
        textareaRef,
        client as never,
        'sess-1',
        'open',
      );
      captured = picker;
      return (
        <>
          <textarea ref={textareaRef} readOnly value={input} />
          {picker.popup}
        </>
      );
    }

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => root.render(<Probe />));

    // The hook's internal cursor starts at 0; move it past "$sec" so the
    // mention is detected at the caret and the skills.list fetch fires.
    act(() => captured?.setCursor(4));
    expect(sentPayloads.length).toBe(1);

    act(() => {
      listener?.({
        type: 'skills.list',
        payload: {
          requestId: sentPayloads[0]?.requestId,
          skills: [{ name: 'security-audit', description: 'Run a security audit' }],
        },
      });
    });

    // Regression: the row used to render the literal string "${skill.name}"
    // and, one fix later, the bare name — the pinned contract (see
    // panels-and-composer.test.tsx) is the mention form `$name`, matching
    // what Tab inserts into the composer.
    expect(host.textContent).toContain('$security-audit');
    expect(host.textContent).not.toContain('${skill.name}');
  });
});
