// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePanelState } from '../src/hooks/use-panel-state.js';
import type { FileEditMeta } from '../src/types.js';

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.useRealTimers();
});

/**
 * Mounts a Probe that re-captures the hook result on every render. Tests
 * must read through `holder.current` AFTER each act — the hook returns a
 * fresh object per render, so an early `const api = ...` would freeze the
 * first render's values.
 */
function mountPanelState(overrides: Partial<Parameters<typeof usePanelState>[0]> = {}) {
  const options = {
    setSettingsOpen: vi.fn(),
    setMailboxOpen: vi.fn(),
    ...overrides,
  };
  const holder: { current: ReturnType<typeof usePanelState> | null } = { current: null };
  function Probe(): null {
    holder.current = usePanelState(options as Parameters<typeof usePanelState>[0]);
    return null;
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(<Probe />));
  return holder;
}

describe('usePanelState — exclusive surface rule', () => {
  it('closes foreign panels when an unrelated panel activates', () => {
    const setSettingsOpen = vi.fn();
    const setMailboxOpen = vi.fn();
    const holder = mountPanelState({ setSettingsOpen, setMailboxOpen });

    act(() => holder.current!.setContextBreakdownOpen(true));
    expect(holder.current!.contextBreakdownOpen).toBe(true);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('simpleui:panel-activated', { detail: 'open-settings' }),
      );
    });

    expect(holder.current!.contextBreakdownOpen).toBe(false); // closed — settings won
    expect(setSettingsOpen).not.toHaveBeenCalled(); // the winner itself stays
    expect(setMailboxOpen).toHaveBeenCalledWith(false); // foreign drawer closed
  });

  it('keeps the activated panel open when it is the context breakdown', () => {
    const holder = mountPanelState();
    act(() => holder.current!.setContextBreakdownOpen(true));

    act(() => {
      window.dispatchEvent(
        new CustomEvent('simpleui:panel-activated', { detail: 'open-context-breakdown' }),
      );
    });

    expect(holder.current!.contextBreakdownOpen).toBe(true);
  });
});

describe('usePanelState — panel-owned state', () => {
  it('mirrors diffFiles into the ref for the global Escape chain', () => {
    const holder = mountPanelState();
    expect(holder.current!.diffFiles).toBeNull();

    const meta = [{ path: 'src/a.ts', added: 1, removed: 0 }] as unknown as FileEditMeta[];
    act(() => holder.current!.setDiffFiles(meta));
    expect(holder.current!.diffFiles).toBe(meta);
    expect(holder.current!.diffFilesRef.current).toBe(meta);
  });

  it('clears the copy badge after its timeout', () => {
    vi.useFakeTimers();
    const holder = mountPanelState();

    act(() => holder.current!.setCopiedMessageId('msg-1'));
    expect(holder.current!.copiedMessageId).toBe('msg-1');

    act(() => {
      vi.advanceTimersByTime(1_800);
    });
    expect(holder.current!.copiedMessageId).toBeNull();
  });
});
