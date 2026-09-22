import { beforeEach, describe, expect, it, vi } from 'vitest';

const prDrafterPlugin = (await import('../src/pr-drafter')).default;

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
  };
  registerHook: ReturnType<typeof vi.fn>;
  onPattern: ReturnType<typeof vi.fn>;
  onEvent: ReturnType<typeof vi.fn>;
  llm: undefined;
}

function makeApi(overrides: { extensions?: Record<string, unknown> } = {}): MockApi {
  return {
    tools: { register: vi.fn() },
    config: { extensions: overrides.extensions ?? {} },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    metrics: { counter: vi.fn() },
    registerHook: vi.fn(() => vi.fn()),
    onPattern: vi.fn(() => vi.fn()),
    onEvent: vi.fn(() => vi.fn()),
    llm: undefined,
  };
}

function getTool(api: MockApi, name: string): (input: unknown) => Promise<unknown> {
  const call = api.tools.register.mock.calls.find((c) => (c[0] as { name: string }).name === name);
  if (!call) throw new Error(`tool ${name} not registered`);
  return (call[0] as { execute: (input: unknown) => Promise<unknown> }).execute;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pr-drafter plugin', () => {
  it('registers pr_draft tool and a Stop hook', async () => {
    const api = makeApi();
    prDrafterPlugin.setup(api as never);
    expect(api.tools.register).toHaveBeenCalledTimes(1);
    const [event] = api.registerHook.mock.calls[0]!;
    expect(event).toBe('Stop');
  });

  it('clears the collected session work when a session ends', async () => {
    // The draft describes "this session's work", but the plugin is set up once
    // per PROCESS and the host outlives any one session, so an unwritten
    // session's commits, files and token totals were carried into the next
    // session's draft.
    const api = makeApi();
    prDrafterPlugin.setup(api as never);
    const postCall = api.registerHook.mock.calls.find(([e]: unknown[]) => e === 'PostToolUse');
    expect(postCall).toBeDefined();
    await (postCall![2] as (input: unknown) => Promise<void>)({
      toolName: 'write',
      toolInput: { path: 'src/a.ts' },
      toolResult: { content: 'ok', isError: false },
    });
    const before = (await prDrafterPlugin.health!()) as { counters: Record<string, number> };
    expect(before.counters['files']).toBe(1);

    const sessionEnded = api.onEvent.mock.calls.find(([e]: unknown[]) => e === 'session.ended');
    expect(sessionEnded).toBeDefined();
    (sessionEnded![1] as () => void)();

    const after = (await prDrafterPlugin.health!()) as { counters: Record<string, number> };
    expect(after.counters['files']).toBe(0);
  });

  it('pr_draft tool returns a preview when preview:true', async () => {
    const api = makeApi();
    prDrafterPlugin.setup(api as never);
    const tool = getTool(api, 'pr_draft');
    const result = (await tool({ preview: true })) as {
      ok: boolean;
      preview: boolean;
      title: string;
      body: string;
    };
    expect(result.ok).toBe(true);
    expect(result.preview).toBe(true);
    expect(result.body).toContain('# PR Draft');
  });

  it('enabled:false disables the Stop hook and tool reports disabled', async () => {
    const api = makeApi({ extensions: { 'pr-drafter': { enabled: false } } });
    prDrafterPlugin.setup(api as never);
    const tool = getTool(api, 'pr_draft');
    await expect(tool({})).rejects.toThrow(/disabled/);
  });

  it('teardown zeros state and logs', async () => {
    const api = makeApi();
    prDrafterPlugin.setup(api as never);
    prDrafterPlugin.teardown!(api as never);
    const health = (await prDrafterPlugin.health!()) as { counters: Record<string, number> };
    expect(health.counters['draftsWritten']).toBe(0);
    expect(api.log.info).toHaveBeenCalledWith('pr-drafter: teardown complete', expect.any(Object));
  });

  // Same class as the previously-fixed bugs in token-budget and
  // token-throttle: a non-finite provider usage value (JSON `1e999` parses
  // to Infinity; an upstream proxy may emit NaN) would otherwise poison the
  // cumulative state.totalInputTokens / state.totalOutputTokens and any
  // later arithmetic against them. The canonical invariant
  // `Number.isFinite(v) ? v : 0` is applied at the boundary before
  // accumulation.
  it('keeps cumulative token totals finite across non-finite provider responses', async () => {
    const api = makeApi();
    prDrafterPlugin.setup(api as never);
    const onEventCalls = api.onEvent.mock.calls.filter(
      ([event]: unknown[]) => event === 'provider.response',
    );
    expect(onEventCalls).toHaveLength(1);
    const handler = onEventCalls[0]![1] as (
      payload: { model?: string; usage?: Record<string, unknown> } | null,
    ) => void;

    // Control: a valid request contributes 100 input / 50 output.
    handler({ model: 'claude-3-5-sonnet', usage: { input: 100, output: 50 } });

    // Poisoned via the camelCase `input` / `output` alias.
    handler({
      model: 'claude-3-5-sonnet',
      usage: { input: Number.POSITIVE_INFINITY, output: Number.POSITIVE_INFINITY },
    });

    // Poisoned via the snake_case `prompt_tokens` / `completion_tokens` alias.
    handler({
      model: 'claude-3-5-sonnet',
      usage: {
        prompt_tokens: Number.POSITIVE_INFINITY,
        completion_tokens: Number.NaN,
      },
    });

    // Poisoned via the camelCase `promptTokens` / `completionTokens` alias.
    handler({
      model: 'claude-3-5-sonnet',
      usage: { promptTokens: Number.NaN, completionTokens: Number.NaN },
    });

    // Read cumulative totals BEFORE teardown zeroes them.
    const health = (await prDrafterPlugin.health!()) as {
      counters: Record<string, number>;
    };
    const inputTotal = health.counters['totalInputTokens'];
    const outputTotal = health.counters['totalOutputTokens'];

    prDrafterPlugin.teardown!(api as never);

    expect(Number.isFinite(inputTotal)).toBe(true);
    expect(Number.isFinite(outputTotal)).toBe(true);
    expect(inputTotal).toBe(100);
    expect(outputTotal).toBe(50);
  });

  // health().counters must surface the cumulative token totals for
  // diagnostics, mirroring the shape cost-tracker uses for lastCostUsd.
  it('health().counters reports totalInputTokens and totalOutputTokens', async () => {
    const api = makeApi();
    prDrafterPlugin.setup(api as never);
    const handler = api.onEvent.mock.calls.find(
      ([event]: unknown[]) => event === 'provider.response',
    )![1] as (payload: { model?: string; usage?: Record<string, unknown> }) => void;
    handler({ model: 'claude-3-5-sonnet', usage: { input: 250, output: 75 } });
    const health = (await prDrafterPlugin.health!()) as {
      counters: Record<string, number>;
    };
    expect(health.counters['totalInputTokens']).toBe(250);
    expect(health.counters['totalOutputTokens']).toBe(75);
    prDrafterPlugin.teardown!(api as never);
  });
});
