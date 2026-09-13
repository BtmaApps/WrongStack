/**
 * Tests for error-lens history trimming.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const errorLensPlugin = (await import('../src/error-lens')).default;

interface MockApi {
  tools: { register: ReturnType<typeof vi.fn> };
  config: { extensions: Record<string, unknown> };
  log: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  metrics: {
    counter: ReturnType<typeof vi.fn>;
    histogram: ReturnType<typeof vi.fn>;
    gauge: ReturnType<typeof vi.fn>;
  };
  registerHook: ReturnType<typeof vi.fn>;
  llm?: { complete: ReturnType<typeof vi.fn>; defaults: ReturnType<typeof vi.fn> } | undefined;
}

interface HistoryResult {
  failures: Array<{ errorLine: string | null; repeats: number }>;
  counters: { digestsInjected: number; repeatsDetected: number };
}

function makeApi(
  overrides: { extensions?: Record<string, unknown>; llm?: MockApi['llm'] } = {},
): MockApi {
  return {
    tools: { register: vi.fn() },
    config: { extensions: overrides.extensions ?? {} },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    metrics: { counter: vi.fn(), histogram: vi.fn(), gauge: vi.fn() },
    registerHook: vi.fn(() => vi.fn()),
    llm: overrides.llm,
  };
}

function getHook(api: MockApi): (input: unknown) => Promise<unknown> {
  const call = api.registerHook.mock.calls[0];
  if (!call) throw new Error('hook not registered');
  const fn = (call as unknown[])[2] as (input: unknown) => unknown | Promise<unknown>;
  return async (input: unknown) => fn(input);
}

async function readHistory(api: MockApi, limit = 50): Promise<HistoryResult> {
  const tool = api.tools.register.mock.calls
    .map(([t]) => t as { name: string; execute: (i: unknown) => Promise<HistoryResult> })
    .find((t) => t.name === 'error_lens_history');
  if (!tool) throw new Error('error_lens_history not registered');
  return tool.execute({ limit });
}

const failure = (i: number) => ({
  toolName: 'bash',
  toolInput: { command: `run ${i}` },
  toolResult: { isError: true, content: `Error: msg ${i}\n    at file${i}.ts:${i}:${i}` },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('error-lens history trimming', () => {
  it('keeps only the newest historySize failures', async () => {
    const api = makeApi({ extensions: { 'error-lens': { historySize: 3, minOutputChars: 10 } } });
    errorLensPlugin.setup(api as never);
    const hook = getHook(api);
    for (let i = 0; i < 5; i++) await hook(failure(i));

    const history = await readHistory(api);
    // Newest first; msg 0 and msg 1 were evicted from the front.
    expect(history.failures.map((f) => f.errorLine)).toEqual([
      expect.stringContaining('msg 4'),
      expect.stringContaining('msg 3'),
      expect.stringContaining('msg 2'),
    ]);
    expect(history.counters.digestsInjected).toBe(5);
  });

  it('treats an evicted failure as new again instead of flagging a repeat', async () => {
    const api = makeApi({ extensions: { 'error-lens': { historySize: 3, minOutputChars: 10 } } });
    errorLensPlugin.setup(api as never);
    const hook = getHook(api);
    for (let i = 0; i < 4; i++) await hook(failure(i));

    const out = (await hook(failure(0))) as { additionalContext: string };
    expect(out.additionalContext).not.toContain('SAME failure');
    expect((await readHistory(api)).counters.repeatsDetected).toBe(0);
  });

  it('does not trim when history is within limits', async () => {
    const api = makeApi({ extensions: { 'error-lens': { historySize: 10, minOutputChars: 10 } } });
    errorLensPlugin.setup(api as never);
    const hook = getHook(api);
    for (let i = 0; i < 3; i++) await hook(failure(i));

    const history = await readHistory(api);
    expect(history.failures).toHaveLength(3);
    expect(history.failures.at(-1)?.errorLine).toContain('msg 0');
  });
});
