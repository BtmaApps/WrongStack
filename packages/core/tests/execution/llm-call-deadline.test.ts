import { describe, expect, it, vi } from 'vitest';
import { completeBrainLlmDetailed } from '../../src/execution/autonomy-brain-llm.js';
import { callWithDeadline } from '../../src/execution/llm-call-deadline.js';
import type { Provider } from '../../src/types/provider.js';

describe('Brain LLM deadlines', () => {
  it('releases a caller even if its provider ignores the abort signal', async () => {
    const provider = { complete: vi.fn(() => new Promise(() => {})) } as unknown as Provider;
    await expect(
      completeBrainLlmDetailed(
        { provider, model: 'test' },
        {
          system: 'Decide',
          user: 'Continue?',
          timeoutMs: 10,
        },
      ),
    ).rejects.toThrow('Brain call timeout exceeded.');
  }, 1_000);

  it('does not invoke a caller after cancellation', async () => {
    const controller = new AbortController();
    controller.abort(new Error('stopped'));
    const call = vi.fn(async () => 'late');
    await expect(callWithDeadline(call, controller.signal, 100, 'timeout')).rejects.toThrow(
      'stopped',
    );
    expect(call).not.toHaveBeenCalled();
  });

  it('cleans up cancellation listeners on successful and throwing callers', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    await expect(
      callWithDeadline(async () => 'ok', controller.signal, 100, 'timeout'),
    ).resolves.toBe('ok');
    await expect(
      callWithDeadline(
        () => {
          throw new Error('broken');
        },
        controller.signal,
        100,
        'timeout',
      ),
    ).rejects.toThrow('broken');
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
