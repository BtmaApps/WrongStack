// @vitest-environment jsdom

// @-mention Enter contract for the SimpleUI composer, mirroring the WebUI
// gate (use-chat-keydown.ts + chat-input-at-mention-enter.test.tsx):
// while a file mention is active, Enter belongs to the picker. With
// matches loaded it selects; with zero matches (still searching or none)
// it must be a pure no-op — never a submit of the half-typed `@query`
// draft, and never a newline (preventDefault).

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Composer } from '../src/composer.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});

function composerProps(overrides: {
  draft?: string;
  fileMention?: { start: number; query: string } | null;
  fileMatches?: string[];
}) {
  const composer = {
    draft: overrides.draft ?? '',
    setDraft: vi.fn(),
    fileRefs: [] as string[],
    setFileRefs: vi.fn(),
    fileMention: overrides.fileMention ?? null,
    setFileMention: vi.fn(),
    fileMatches: overrides.fileMatches ?? [],
    filePickerIndex: 0,
    setFilePickerIndex: vi.fn(),
    fileSearching: false,
    pendingConfirm: null,
    textareaRef: { current: null as HTMLTextAreaElement | null },
    queue: [],
    refineState: null,
    submitWith: vi.fn(),
    abort: vi.fn(),
    decideConfirm: vi.fn(),
    selectFile: vi.fn(),
    refineDecision: vi.fn(),
    refineRetry: vi.fn(),
    refineRetryFallback: vi.fn(),
    refineStartNow: vi.fn(),
    refineSendEdited: vi.fn(),
    refineEditInComposer: vi.fn(),
    attachedImages: [] as { id: string; data: string; mime: string; name: string }[],
    attachImages: vi.fn(),
    removeImage: vi.fn(),
    visionSupported: false,
  };
  return {
    composer: composer as never,
    submitWith: composer.submitWith,
    selectFile: composer.selectFile,
    skillSocket: undefined,
    running: false,
    connection: 'open' as const,
    session: null,
    notice: null,
    preRefineSeconds: 3,
  };
}

function mountComposer(props: ReturnType<typeof composerProps>) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<Composer {...props} />));
  roots.push(root);
  const textarea = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]');
  if (!textarea) throw new Error('composer textarea not found');
  return { textarea };
}

function pressEnter(textarea: HTMLTextAreaElement) {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    textarea.dispatchEvent(event);
  });
  return event;
}

describe('Composer @-mention Enter contract', () => {
  it('Enter with a file mention active and ZERO matches is a no-op: no submit, no newline', () => {
    const props = composerProps({
      draft: 'look at @zzz',
      fileMention: { start: 8, query: 'zzz' },
      fileMatches: [],
    });
    const { textarea } = mountComposer(props);

    const event = pressEnter(textarea);

    expect(props.submitWith).not.toHaveBeenCalled();
    // preventDefault pins the "no newline" half of the no-op contract.
    expect(event.defaultPrevented).toBe(true);
  });

  it('Enter with matches loaded selects the highlighted file and does not submit', () => {
    const props = composerProps({
      draft: 'look at @in',
      fileMention: { start: 8, query: 'in' },
      fileMatches: ['src/index.ts', 'src/app.tsx'],
    });
    const { textarea } = mountComposer(props);

    pressEnter(textarea);

    expect(props.selectFile).toHaveBeenCalledExactlyOnceWith('src/index.ts');
    expect(props.submitWith).not.toHaveBeenCalled();
  });

  it('plain Enter with no mention still submits the draft', () => {
    const props = composerProps({ draft: 'plain message' });
    const { textarea } = mountComposer(props);

    pressEnter(textarea);

    expect(props.submitWith).toHaveBeenCalledExactlyOnceWith('btw');
  });
});
