// @vitest-environment jsdom

/**
 * "Jump to latest" must not throw where the matchMedia API is missing.
 *
 * The codebase already states the rule for this environment: `use-theme.ts`
 * documents that "matchMedia can be missing entirely (jsdom, locked-down
 * webviews)" and degrades to the boot-time answer "instead of throwing
 * mid-effect". The sticky-scroll hook called `matchMedia(...)` unguarded, so
 * on such a webview the button the operator pressed to get back to the newest
 * message raised a TypeError and the scroll never happened.
 *
 * The package's own suite never saw it: `use-sticky-scroll.test.tsx`
 * polyfills `globalThis.matchMedia` for the whole file, so the missing-API
 * path was never exercised.
 *
 * See: packages/simpleui/src/hooks/use-sticky-scroll.ts
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStickyScroll } from '../src/hooks/use-sticky-scroll.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function renderHook() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const resultRef: { current: ReturnType<typeof useStickyScroll> | null } = { current: null };

  function Probe() {
    resultRef.current = useStickyScroll({
      messages: [] as never,
      activity: '',
      pendingConfirm: null as never,
    });
    return null;
  }
  act(() => root.render(<Probe />));

  return {
    resultRef,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function scrollContainer() {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { value: 2000, configurable: true });
  const scrollTo = vi.fn();
  Object.defineProperty(el, 'scrollTo', { value: scrollTo, writable: true, configurable: true });
  return { el, scrollTo };
}

/** Swap the matchMedia API for the duration of `run`. */
function withMatchMedia<T>(value: unknown, run: () => T): T {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
  Object.defineProperty(globalThis, 'matchMedia', {
    value,
    configurable: true,
    writable: true,
  });
  try {
    return run();
  } finally {
    if (original) Object.defineProperty(globalThis, 'matchMedia', original);
    else delete (globalThis as { matchMedia?: unknown }).matchMedia;
  }
}

describe('useStickyScroll · jump to latest', () => {
  it('scrolls instead of throwing when the matchMedia API is missing', () => {
    const { resultRef, cleanup } = renderHook();
    const { el, scrollTo } = scrollContainer();
    resultRef.current!.scrollRef.current = el;

    const threw = withMatchMedia(undefined, () => {
      try {
        act(() => resultRef.current!.jumpToLatest());
        return false;
      } catch {
        return true;
      }
    });

    expect(threw).toBe(false);
    expect(scrollTo).toHaveBeenCalled();
    cleanup();
  });

  it('scrolls when the matchMedia API refuses', () => {
    const { resultRef, cleanup } = renderHook();
    const { el, scrollTo } = scrollContainer();
    resultRef.current!.scrollRef.current = el;

    const threw = withMatchMedia(
      () => {
        throw new Error('matchMedia is blocked');
      },
      () => {
        try {
          act(() => resultRef.current!.jumpToLatest());
          return false;
        } catch {
          return true;
        }
      },
    );

    expect(threw).toBe(false);
    expect(scrollTo).toHaveBeenCalled();
    cleanup();
  });

  it('still honours the reduced-motion preference', () => {
    const { resultRef, cleanup } = renderHook();
    const { el, scrollTo } = scrollContainer();
    resultRef.current!.scrollRef.current = el;

    withMatchMedia(
      () => ({ matches: true }),
      () => {
        act(() => resultRef.current!.jumpToLatest());
      },
    );

    const call = scrollTo.mock.calls[0]?.[0] as ScrollToOptions;
    expect(call?.behavior).toBe('auto');
    cleanup();
  });
});
