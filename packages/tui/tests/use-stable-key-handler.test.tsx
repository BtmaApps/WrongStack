import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_KEY, type KeyEvent } from '../src/components/input.js';
import { useStableKeyHandler } from '../src/hooks/use-stable-key-handler.js';
import { Text } from '../src/ink.js';

type Handler = (input: string, key: KeyEvent) => Promise<void>;

function mount(handleKey: Handler, onError?: (err: unknown) => void) {
  let stable!: Handler;
  function Probe({ h }: { h: Handler }) {
    stable = useStableKeyHandler(h, onError);
    return <Text>probe</Text>;
  }
  const view = render(<Probe h={handleKey} />);
  return {
    get stable() {
      return stable;
    },
    rerender: (h: Handler) => view.rerender(<Probe h={h} />),
    unmount: view.unmount,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('useStableKeyHandler', () => {
  it('reports a rejected key handler instead of swallowing it', async () => {
    const onError = vi.fn();
    const probe = mount(() => Promise.reject(new Error('boom')), onError);
    await probe.stable('x', EMPTY_KEY);
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
    probe.unmount();
  });

  it('reports a synchronously throwing key handler', async () => {
    const onError = vi.fn();
    const probe = mount(() => {
      throw new Error('sync');
    }, onError);
    await expect(probe.stable('x', EMPTY_KEY)).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    probe.unmount();
  });

  it('contains a failing reporter', async () => {
    const probe = mount(
      () => Promise.reject(new Error('boom')),
      () => {
        throw new Error('reporter');
      },
    );
    await probe.stable('x', EMPTY_KEY);
    await flush();
    probe.unmount();
  });

  it('keeps its identity and calls the latest handler', async () => {
    const first = vi.fn(() => Promise.resolve());
    const second = vi.fn(() => Promise.resolve());
    const probe = mount(first);
    const before = probe.stable;
    probe.rerender(second);
    expect(probe.stable).toBe(before);
    await probe.stable('y', EMPTY_KEY);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('y', EMPTY_KEY);
    probe.unmount();
  });
});
