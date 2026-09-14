// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dispatchOpenWorkspacePanel,
  dispatchSimplePanel,
  onPanelActivation,
} from '../src/lib/panel-events.js';

describe('SimpleUI exclusive panel activation', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it('identifies every opened simple panel and workspace view as the active surface', () => {
    const activated = vi.fn();
    cleanups.push(onPanelActivation(activated));

    dispatchSimplePanel('open-memory-drawer');
    dispatchOpenWorkspacePanel('tools');

    expect(activated).toHaveBeenNthCalledWith(1, 'open-memory-drawer');
    expect(activated).toHaveBeenNthCalledWith(2, 'workspace:tools');
  });

  it('does not turn a close-only vector memory event into a new active surface', () => {
    const activated = vi.fn();
    cleanups.push(onPanelActivation(activated));

    dispatchSimplePanel('close-vector-memory-panel');

    expect(activated).not.toHaveBeenCalled();
  });
});
