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
});
