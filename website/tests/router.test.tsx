import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Link, RouterProvider, useRouter } from '../src/lib/router';

let root: Root;
let container: HTMLDivElement;
let scroll = vi.fn<(options?: boolean | ScrollIntoViewOptions) => void>();

function CurrentPath() {
  return <output>{useRouter().path}</output>;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.history.replaceState({}, '', '/coding-plans');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  scroll = vi.fn();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function click(href: string) {
  await act(async () =>
    root.render(
      <RouterProvider>
        <Link href={href}>Go</Link>
        <section id="chatgpt-codex" />
        <CurrentPath />
      </RouterProvider>,
    ),
  );
  container.querySelector('section')!.scrollIntoView = scroll;
  await act(async () =>
    container
      .querySelector('a')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })),
  );
}

it('navigates to another page', async () => {
  await click('/tools');
  expect(window.location.pathname).toBe('/tools');
  expect(container.querySelector('output')!.textContent).toBe('/tools');
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
});

it('records a same-page section destination in URL and history', async () => {
  const length = window.history.length;
  await click('/coding-plans#chatgpt-codex');
  expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth' });
  expect(window.location.hash).toBe('#chatgpt-codex');
  expect(window.history.length).toBe(length + 1);
  expect(container.querySelector('output')!.textContent).toBe('/coding-plans');
  expect(window.scrollTo).not.toHaveBeenCalled();
});

it('preserves the query when navigating to a same-page section', async () => {
  await click('/coding-plans?source=home#chatgpt-codex');
  expect(window.location.search).toBe('?source=home');
  expect(window.location.hash).toBe('#chatgpt-codex');
  expect(scroll).toHaveBeenCalledOnce();
});

it('records a missing section without throwing or scrolling to the top', async () => {
  await click('/coding-plans#missing');
  expect(window.location.hash).toBe('#missing');
  expect(scroll).not.toHaveBeenCalled();
  expect(window.scrollTo).not.toHaveBeenCalled();
});

it('keeps navigation without a fragment on the ordinary scroll-to-top path', async () => {
  window.history.replaceState({}, '', '/coding-plans#chatgpt-codex');
  await click('/coding-plans');
  expect(window.location.hash).toBe('');
  expect(scroll).not.toHaveBeenCalled();
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
});
