// FileDiffPanel exclusive-surface rule — regression coverage.
//
// Commit c54dfd13b declared the invariant: "Settings, context, mailbox, file
// diff, and the independently mounted utility panels share one exclusive
// surface rule. A newly activated panel must not leave a prior drawer alive
// underneath its overlay." Every modal surface self-closes on foreign panel
// activation (Settings/Context/Mailbox via the exclusive-close effect in
// simple-ui-session, MemoryDrawer/PromptLibrary/VectorMemoryPanel/ToolSidebar/
// FileExplorer via their own onPanelActivation subscriptions). FileDiffPanel
// was the one surface missing this: a foreign activation left the diff overlay
// stacked underneath the newly activated panel — two aria-modal dialogs with
// dueling focus traps. Fixed in file-diff-panel.tsx by subscribing to
// onPanelActivation in the existing [onClose] keydown effect.

// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileDiffPanel } from '../src/file-diff-panel.js';
import { dispatchSimplePanel } from '../src/lib/panel-events.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

function mount(props: React.ComponentProps<typeof FileDiffPanel>): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<FileDiffPanel {...props} />));
  return container;
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});

const FILES = [{ path: 'src/a.ts', diff: '@@ -1,1 +1,2 @@\n-old\n+new', replacements: 1 }];

describe('FileDiffPanel exclusive-surface rule', () => {
  it('requests close when a different panel activates (no stacked modal surfaces)', () => {
    const onClose = vi.fn();
    const container = mount({ files: FILES, onClose });
    expect(container.querySelector('.diff-panel')).not.toBeNull();

    act(() => dispatchSimplePanel('open-settings'));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('ignores its own open-file-diff activation', () => {
    const onClose = vi.fn();
    const container = mount({ files: FILES, onClose });

    act(() => dispatchSimplePanel('open-file-diff'));

    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector('.diff-panel')).not.toBeNull();
  });
});
