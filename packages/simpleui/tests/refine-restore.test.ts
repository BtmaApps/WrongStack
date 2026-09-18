// @vitest-environment jsdom
//
// The shared "hand the pending refine back to the composer" path. Two
// triggers run it — the global Escape shortcut and the countdown face's Edit
// button — so its contract is pinned here once instead of twice.

import { describe, expect, it, vi } from 'vitest';
import type { RefineState } from '../src/lib/refine-model.js';
import { restoreRefineToComposer } from '../src/lib/refine-restore.js';

function makeDeps(state: RefineState | null, draft = '') {
  const setDraft = vi.fn();
  const setRefineState = vi.fn();
  const setAttachedImages = vi.fn();
  const deps = {
    refineStateRef: { current: state },
    setRefineState,
    refineEpochRef: { current: 7 },
    refineStartFiredRef: { current: true },
    draftRef: { current: draft },
    setDraft,
    setAttachedImages,
    textareaRef: { current: null },
  };
  return { deps, setDraft, setRefineState, setAttachedImages };
}

function makeState(overrides: Partial<RefineState> = {}): RefineState {
  return {
    original: 'fix the bug',
    refined: 'Fix the null-pointer bug in the parser',
    english: 'Fix the NPE in the parser',
    status: 'countdown',
    ...overrides,
  };
}

describe('restoreRefineToComposer', () => {
  it('reports "not handled" when no refine round-trip is pending', () => {
    const { deps, setDraft, setRefineState } = makeDeps(null);
    expect(restoreRefineToComposer(deps)).toBe(false);
    expect(setRefineState).not.toHaveBeenCalled();
    expect(setDraft).not.toHaveBeenCalled();
    expect(deps.refineEpochRef.current).toBe(7);
  });

  it('puts the original text back and clears the panel', () => {
    const { deps, setDraft, setRefineState } = makeDeps(makeState());
    expect(restoreRefineToComposer(deps)).toBe(true);
    expect(setDraft).toHaveBeenCalledWith('fix the bug');
    expect(deps.draftRef.current).toBe('fix the bug');
    expect(setRefineState).toHaveBeenCalledWith(null);
    // Nulled synchronously so a same-tick flush cannot dispatch the message.
    expect(deps.refineStateRef.current).toBeNull();
  });

  it('bumps the epoch so a late refine result is recognised as stale', () => {
    const { deps } = makeDeps(makeState());
    restoreRefineToComposer(deps);
    expect(deps.refineEpochRef.current).toBe(8);
    expect(deps.refineStartFiredRef.current).toBe(false);
  });

  it('never clobbers text the user typed after the panel opened', () => {
    const { deps, setDraft } = makeDeps(makeState(), 'something new');
    expect(restoreRefineToComposer(deps)).toBe(true);
    expect(setDraft).not.toHaveBeenCalled();
    expect(deps.draftRef.current).toBe('something new');
  });

  it('restores the images the send consumed', () => {
    const images = [{ data: 'aGk=', mime: 'image/png' }];
    const { deps, setAttachedImages } = makeDeps(makeState({ images }));
    restoreRefineToComposer(deps);
    expect(setAttachedImages).toHaveBeenCalledTimes(1);
    const restored = setAttachedImages.mock.calls[0]?.[0] as Array<{
      data: string;
      mime: string;
      id: string;
      name: string;
    }>;
    expect(restored).toHaveLength(1);
    expect(restored[0]?.data).toBe('aGk=');
    expect(restored[0]?.mime).toBe('image/png');
  });

  it('leaves the image state alone when the send carried none', () => {
    const { deps, setAttachedImages } = makeDeps(makeState());
    restoreRefineToComposer(deps);
    expect(setAttachedImages).not.toHaveBeenCalled();
  });
});
