// Regression: the SidePanel resize handle must be a real, keyboard-operable
// separator.
//
// It used to be an `<hr>` carrying aria-valuemin/valuemax/valuenow with NO
// role. Those properties are only meaningful on a focusable separator, so AT
// had no widget to expose, and the handle was mouse-only: a keyboard user
// could not resize the panel at all.
//
// Asserts against the REAL constants in ui-store-types.ts, not literals.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// SidePanel renders useViewport, which calls window.matchMedia at module scope
// on mount. jsdom does not implement matchMedia, so stub the observer shape
// once for the whole file.
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
});

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    sendMessage: vi.fn(),
    sendAbort: vi.fn(),
    client: { send: vi.fn(() => true), withSession: (x: unknown) => x },
  }),
}));

vi.mock('@/i18n', () => ({
  useAppTranslation: () => ({ t: (k: string) => k }),
}));

import { SidePanel } from '../../src/components/SidePanel/index.js';
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useUIStore,
} from '../../src/stores/index.js';

describe('SidePanel resize handle', () => {
  beforeEach(() => {
    useUIStore.setState({
      activeActivity: 'chat',
      sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
      sidebarOpen: true,
    });
  });

  afterEach(() => cleanup());

  it('exposes a focusable role="separator" whose aria-valuenow tracks the stored width', () => {
    render(<SidePanel />);
    const handle = screen.getByRole('separator');

    // The core of the old bug: a focusable separator is what makes the
    // aria-value* properties legal.
    expect(handle.tagName).toBe('DIV');
    expect(handle).toHaveProperty('tabIndex', 0);
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.getAttribute('aria-valuemin')).toBe(String(SIDEBAR_MIN_WIDTH));
    expect(handle.getAttribute('aria-valuemax')).toBe(String(SIDEBAR_MAX_WIDTH));
    expect(handle.getAttribute('aria-valuenow')).toBe(String(useUIStore.getState().sidebarWidth));
    // It must be reachable by Tab — that is what the mouse-only handle lacked.
    expect((handle as HTMLElement).tabIndex).toBe(0);
  });

  it('resizes with ArrowRight / ArrowLeft and clamps at the bounds', () => {
    render(<SidePanel />);
    const handle = screen.getByRole('separator');

    // The drag handle alone left keyboard users no way to resize.
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(useUIStore.getState().sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH + 16);

    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(useUIStore.getState().sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH);

    // Shift takes the bigger step.
    fireEvent.keyDown(handle, { key: 'ArrowRight', shiftKey: true });
    expect(useUIStore.getState().sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH + 64);

    // Clamping at both ends — the handler clamps, it does not trust input.
    fireEvent.keyDown(handle, { key: 'Home' });
    expect(useUIStore.getState().sidebarWidth).toBe(SIDEBAR_MIN_WIDTH);
    fireEvent.keyDown(handle, { key: 'End' });
    expect(useUIStore.getState().sidebarWidth).toBe(SIDEBAR_MAX_WIDTH);

    // Past the edge stays clamped rather than overflowing the panel.
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(useUIStore.getState().sidebarWidth).toBe(SIDEBAR_MAX_WIDTH);
  });

  it('ignores unrelated keys so typing near the handle is not swallowed', () => {
    render(<SidePanel />);
    const handle = screen.getByRole('separator');
    fireEvent.keyDown(handle, { key: 'a' });
    expect(useUIStore.getState().sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH);
  });
});
