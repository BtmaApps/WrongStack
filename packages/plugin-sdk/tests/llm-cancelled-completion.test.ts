import { expect, it, vi } from 'vitest';
import { runOptionalPluginCouncil, runOptionalPluginLlm } from '../src/runtime/llm.js';

it('fences gated late success, failure and invalid replies before parse or fallback', async () => {
  for (const kind of ['llm', 'council'])
    for (const mode of ['success', 'failure', 'invalid']) {
      const controller = new AbortController();
      let release!: (value: unknown) => void;
      let reject!: (error: Error) => void;
      const pending = new Promise<unknown>((r, j) => {
        release = r;
        reject = j;
      });
      const parse = vi.fn((text: string) => text);
      const complete = vi.fn(() => pending);
      const council = vi.fn(() => pending);
      const request = {
        requested: true,
        prompt: 'fixture',
        label: 'fixture',
        parse,
        options: { signal: controller.signal },
        api: { log: { warn: vi.fn() }, llm: { complete, council } },
      } as never;
      const result =
        kind === 'llm' ? runOptionalPluginLlm(request) : runOptionalPluginCouncil(request);
      controller.abort();
      if (mode === 'failure') reject(new Error('fixture'));
      else
        release(
          kind === 'llm'
            ? { text: mode === 'success' ? 'late' : '' }
            : { status: mode === 'success' ? 'decided' : 'failed', answer: 'late' },
        );
      expect(await result).toEqual({ used: false, value: null, fallbackReason: 'cancelled' });
      expect(parse).not.toHaveBeenCalled();
      if (kind === 'council') expect(complete).not.toHaveBeenCalled();
    }
  const cancelled = new AbortController();
  cancelled.abort();
  const complete = vi.fn();
  const base = {
    prompt: 'fixture',
    label: 'fixture',
    parse: (text: string) => text,
    api: { log: { warn: vi.fn() }, llm: { complete } },
  };
  expect((await runOptionalPluginLlm({ ...base, requested: false } as never)).fallbackReason).toBe(
    'not-requested',
  );
  expect(
    (
      await runOptionalPluginLlm({
        ...base,
        requested: true,
        options: { signal: cancelled.signal },
      } as never)
    ).fallbackReason,
  ).toBe('cancelled');
  expect(complete).not.toHaveBeenCalled();
  complete.mockResolvedValue({ text: 'fresh' });
  expect((await runOptionalPluginLlm({ ...base, requested: true } as never)).value).toBe('fresh');
});
