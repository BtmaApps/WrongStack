import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Header } from '../src/components/layout/Header';
import { RouterProvider } from '../src/lib/router';

let root: Root;
let container: HTMLDivElement;

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
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
  await activate(button('More'));
  expect(container.querySelector('a[href="/architecture"]')).not.toBeNull();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function button(label: string) {
  const result = [...container.querySelectorAll('button')].find((entry) =>
    entry.textContent?.startsWith(label),
  );
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}

async function activate(element: HTMLElement, detail = 0) {
  element.focus();
  // Native button activation with Enter/Space dispatches a click with detail 0.
  await act(async () =>
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail })),
  );
}

it('switches categories on pointer hover', async () => {
  await act(async () =>
    button('Work & automate').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })),
  );
  expect(container.querySelector('a[href="/sdd"]')).not.toBeNull();
  expect(container.querySelector('a[href="/architecture"]')).toBeNull();
});

it('switches categories on keyboard activation without requiring pointer hover', async () => {
  await activate(button('Work & automate'));
  expect(container.querySelector('a[href="/sdd"]')).not.toBeNull();
  expect(container.querySelector('a[href="/architecture"]')).toBeNull();
});

it('switches on pointer click and can return to the initial category', async () => {
  await activate(button('Work & automate'), 1);
  expect(container.querySelector('a[href="/sdd"]')).not.toBeNull();
  await activate(button('Learn the system'), 1);
  expect(container.querySelector('a[href="/architecture"]')).not.toBeNull();
  expect(container.querySelector('a[href="/sdd"]')).toBeNull();
});

it('navigates from a keyboard-selected category and closes the More menu', async () => {
  await activate(button('Work & automate'));
  const destination = container.querySelector<HTMLAnchorElement>('a[href="/sdd"]');
  expect(destination).not.toBeNull();
  await activate(destination!);
  expect(window.location.pathname).toBe('/sdd');
  expect(button('More').getAttribute('aria-expanded')).toBe('false');
});
