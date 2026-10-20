import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CopyCommand } from '../src/components/site/primitives';

let root: Root;
let container: HTMLDivElement;
const writeText = vi.fn<(value: string) => Promise<void>>();

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<CopyCommand command="wstack --provider example" />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(navigator, 'clipboard');
  writeText.mockReset();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('announces clipboard denial and keeps the complete command selectable', async () => {
  writeText.mockRejectedValue(new Error('Permission denied'));
  await act(async () => container.querySelector('button')!.click());
  expect(container.querySelector('[role="status"]')!.textContent).toContain(
    'Select and copy the text manually.',
  );
  expect(container.querySelector('code')!.textContent).toBe('wstack --provider example');
});

it('copies the command and clears success feedback after the bounded interval', async () => {
  writeText.mockResolvedValue(undefined);
  await act(async () => container.querySelector('button')!.click());
  expect(writeText).toHaveBeenCalledWith('wstack --provider example');
  expect(container.querySelector('[role="status"]')!.textContent).toBe('Copied to clipboard.');
  await act(async () => vi.advanceTimersByTime(2400));
  expect(container.querySelector('[role="status"]')!.textContent).toBe('');
  expect(vi.getTimerCount()).toBe(0);
});

it('removes feedback timers when navigating away', async () => {
  writeText.mockResolvedValue(undefined);
  await act(async () => container.querySelector('button')!.click());
  expect(vi.getTimerCount()).toBe(1);
  await act(async () => root.render(null));
  expect(vi.getTimerCount()).toBe(0);
});
