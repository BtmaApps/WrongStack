import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Header } from '../src/components/layout/Header';
import { RouterProvider } from '../src/lib/router';

let root: Root;
let container: HTMLDivElement;
let more: HTMLButtonElement;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  window.history.replaceState({}, '', '/');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <RouterProvider>
        <Header />
      </RouterProvider>,
    ),
  );
  more = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.startsWith('More'),
  )!;
  expect(more).toBeDefined();
  expect(more.getAttribute('aria-expanded')).toBe('false');
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function hover() {
  await act(async () => more.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
}

async function advance(ms: number) {
  await act(async () => vi.advanceTimersByTimeAsync(ms));
}

it('opens on uninterrupted hover only after the intent delay', async () => {
  await hover();
  await advance(119);
  expect(more.getAttribute('aria-expanded')).toBe('false');
  await advance(1);
  expect(more.getAttribute('aria-expanded')).toBe('true');
});

it('cancels pending hover-open when Escape dismisses the menu', async () => {
  await hover();
  await advance(60);
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  expect(more.getAttribute('aria-expanded')).toBe('false');
  await advance(60);
  expect(more.getAttribute('aria-expanded')).toBe('false');
});

it('cancels pending hover-open when an outside pointer press dismisses the menu', async () => {
  await hover();
  await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  await advance(120);
  expect(more.getAttribute('aria-expanded')).toBe('false');
});

it('cancels pending hover-open when browser history changes the page', async () => {
  await hover();
  await act(async () => {
    window.history.pushState({}, '', '/tools');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await advance(120);
  expect(more.getAttribute('aria-expanded')).toBe('false');
});

it('cancels pending hover-open when the menu button is toggled closed', async () => {
  await hover();
  await act(async () => more.click());
  expect(more.getAttribute('aria-expanded')).toBe('true');
  await act(async () => more.click());
  await advance(120);
  expect(more.getAttribute('aria-expanded')).toBe('false');
});

it('allows a fresh hover to open the menu after dismissal', async () => {
  await hover();
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  await act(async () =>
    more.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })),
  );
  await hover();
  await advance(120);
  expect(more.getAttribute('aria-expanded')).toBe('true');
});
