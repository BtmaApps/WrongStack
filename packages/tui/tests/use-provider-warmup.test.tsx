// @vitest-environment jsdom
/**
 * Typing a prompt warms the provider connection; commands, shell lines and a
 * running turn do not.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AppProps } from '../src/app-props.js';
import type { State } from '../src/app-state.js';
import { useProviderWarmup } from '../src/hooks/use-provider-warmup.js';

function agentWith(warm: ((model: string) => Promise<void>) | undefined) {
  return { ctx: { model: 'glm-5', provider: { id: 'p', warm } } } as unknown as AppProps['agent'];
}

function typed(agent: AppProps['agent'], steps: Array<[string, State['status']]>) {
  const first = steps[0] ?? ['', 'idle'];
  const view = renderHook(({ buffer, status }) => useProviderWarmup(agent, buffer, status), {
    initialProps: { buffer: first[0], status: first[1] },
  });
  for (const [buffer, status] of steps.slice(1)) view.rerender({ buffer, status });
}

describe('useProviderWarmup', () => {
  it('warms the current model on every keystroke of a prompt', () => {
    const warm = vi.fn(async () => undefined);
    typed(agentWith(warm), [
      ['', 'idle'],
      ['h', 'idle'],
      ['hi', 'idle'],
    ]);
    expect(warm).toHaveBeenCalledTimes(2);
    expect(warm).toHaveBeenCalledWith('glm-5');
  });

  it('stays quiet for commands, shell lines, blank input and a running turn', () => {
    const warm = vi.fn(async () => undefined);
    typed(agentWith(warm), [
      ['/help', 'idle'],
      ['  !ls', 'idle'],
      ['   ', 'idle'],
      ['next prompt', 'running'],
      ['next prompt!', 'streaming'],
    ]);
    expect(warm).not.toHaveBeenCalled();
  });

  it('is harmless for a provider without warm() or one whose warm-up fails', () => {
    expect(() => typed(agentWith(undefined), [['hi', 'idle']])).not.toThrow();
    const failing = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(() => typed(agentWith(failing), [['hi', 'idle']])).not.toThrow();
    expect(failing).toHaveBeenCalledOnce();
  });
});
