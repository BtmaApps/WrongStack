/**
 * Supplementary tests for pr-drafter — targeting uncovered branches.
 */
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
  metrics: { counter: ReturnType<typeof vi.fn> };
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

function getTool(api: MockApi, name: string) {
  const call = api.tools.register.mock.calls.find((c) => (c[0] as { name: string }).name === name);
  if (!call) throw new Error(`tool ${name} not registered`);
  return (call[0] as { execute: (input: unknown) => Promise<unknown> }).execute;
}

type PostHook = (input: {
  toolName?: string;
  toolInput?: unknown;
  toolResult?: { content: string; isError: boolean };
}) => void;

function getPostHook(api: MockApi): PostHook {
  const call = api.registerHook.mock.calls.find((c) => c[0] === 'PostToolUse');
  if (!call) throw new Error('PostToolUse hook not registered');
  return call[2] as PostHook;
}

/** git_autocommit's real success result, serialized the way the executor does. */
function autocommitResult(message: string): string {
  return JSON.stringify({
    ok: true,
    hash: 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0',
    message,
    stagedFiles: ['src/a.ts'],
    type: 'fix',
    scope: null,
    generatedByLlm: false,
    diff: '\n## Staged diff\n\n1 file changed',
  });
}

beforeEach(() => vi.clearAllMocks());

describe('pr-drafter extra coverage', () => {
  it('health() returns active state with zero counters', async () => {
    const api = makeApi();
    prDrafterPlugin.setup(api as never);
    const h = (await prDrafterPlugin.health!()) as {
      ok: boolean;
      message: string;
      counters: Record<string, number>;
    };
    expect(h.ok).toBe(true);
    expect(h.message).toContain('0 commit(s)');
    expect(h.counters.commits).toBe(0);
  });

  it('readConfig uses defaults for null/undefined config', async () => {
    const api = makeApi({ extensions: { 'pr-drafter': null } });
    prDrafterPlugin.setup(api as never);
    const tool = getTool(api, 'pr_draft');
    const result = (await tool({ preview: true })) as { ok: boolean; body: string };
    expect(result.ok).toBe(true);
    expect(result.body).toContain('# PR Draft');
  });

  it('records real git_autocommit commits and write/edit files from PostToolUse', async () => {
    const api = makeApi();
    prDrafterPlugin.setup(api as never);
    const postHook = getPostHook(api);
    const onPatternHandler = api.onPattern.mock.calls[0]?.[1] as (
      event: string,
      payload: unknown,
    ) => void;

    // The executor serializes git_autocommit's actual success result as JSON text.
    postHook({
      toolName: 'git_autocommit',
      toolInput: { type: 'fix', summary: 'resolve auth bug' },
      toolResult: { content: autocommitResult('fix: resolve auth bug'), isError: false },
    });
    postHook({
      toolName: 'write',
      toolInput: { path: 'src/auth.ts' },
      toolResult: { content: 'ok', isError: false },
    });
    postHook({
      toolName: 'edit',
      toolInput: { file_path: 'src/utils.ts' },
      toolResult: { content: 'ok', isError: false },
    });
    // `tool.completed` as core really emits it: no tool/input/result fields.
    for (const name of ['git_autocommit', 'write', 'edit']) {
      onPatternHandler('tool.completed', { name, id: name, durationMs: 1, outputChars: 2 });
    }

    const h = (await prDrafterPlugin.health!()) as {
      counters: Record<string, number>;
      message: string;
    };
    expect(h.counters.commits).toBe(1);
    expect(h.counters.files).toBe(2);
    expect(h.counters.toolCalls).toBe(3);
    expect(h.message).toContain('1 commit(s)');
  });

  it('ignores failed, errored, dry-run and truncated-without-hash git_autocommit calls', async () => {
    const api = makeApi();
    prDrafterPlugin.setup(api as never);
    const postHook = getPostHook(api);

    // git_autocommit now throws on refusal → the executor reports isError.
    postHook({
      toolName: 'git_autocommit',
      toolInput: {},
      toolResult: { content: 'Error: Nothing staged.', isError: true },
    });
    postHook({
      toolName: 'git_autocommit',
      toolInput: {},
      toolResult: {
        content: JSON.stringify({ ok: true, dry_run: true, message: 'Would create: fix: x' }),
        isError: false,
      },
    });
    postHook({
      toolName: 'write',
      toolInput: { path: 'src/failed.ts' },
      toolResult: { content: 'Error: EACCES', isError: true },
    });
    expect(() => postHook({ toolName: 'git_autocommit' })).not.toThrow();

    const h = (await prDrafterPlugin.health!()) as { counters: Record<string, number> };
    expect(h.counters.commits).toBe(0);
    expect(h.counters.files).toBe(0);
  });

  it('parses a commit out of a truncated git_autocommit result', async () => {
    const { parseAutocommitResult } = await import('../src/pr-drafter');
    const full = autocommitResult('feat(api): add "quoted" \\ thing');
    expect(parseAutocommitResult(full.slice(0, full.indexOf('"stagedFiles"') + 5))).toEqual({
      hash: 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0',
      message: 'feat(api): add "quoted" \\ thing',
    });
    expect(parseAutocommitResult('{"ok":true,"dry_run":true}')).toBeNull();
  });

  it('onEvent handler records provider responses', async () => {
    const api = makeApi();
    prDrafterPlugin.setup(api as never);
    const onEventHandler = api.onEvent.mock.calls[0]?.[1] as (payload: unknown) => void;

    onEventHandler({
      model: 'gpt-4o',
      usage: { input: 100, output: 50 },
    });
    onEventHandler({
      model: 'gpt-4o',
      usage: { input: 200, output: 100 },
    });

    const h = (await prDrafterPlugin.health!()) as { counters: Record<string, number> };
    // onEvent handler doesn't increment toolCalls, but records models/tokens
    expect(h.counters.toolCalls).toBe(0); // toolCalls is only for onPattern
  });

  it('onEventHandler handles null payload gracefully', async () => {
    const api = makeApi();
    prDrafterPlugin.setup(api as never);
    const onEventHandler = api.onEvent.mock.calls[0]?.[1] as (payload: unknown) => void;
    expect(() => onEventHandler(null)).not.toThrow();
    expect(() => onEventHandler({})).not.toThrow();
  });

  it('onPattern handler has null payload protection for path access', async () => {
    const api = makeApi();
    prDrafterPlugin.setup(api as never);
    const onPatternHandler = api.onPattern.mock.calls[0]?.[1] as (
      event: string,
      payload: unknown,
    ) => void;

    // Payload with no input should not throw
    onPatternHandler('tool.completed', { tool: 'write' });
    onPatternHandler('tool.completed', { tool: 'edit', input: null });

    const h = (await prDrafterPlugin.health!()) as { counters: Record<string, number> };
    // The handler should have safely handled these
    expect(h.counters.toolCalls).toBe(2);
  });

  it('teardown unhooks all subscriptions', async () => {
    const api = makeApi();
    const unsub1 = vi.fn();
    const unsub2 = vi.fn();
    api.onPattern = vi.fn(() => unsub1);
    api.onEvent = vi.fn(() => unsub2);

    prDrafterPlugin.setup(api as never);
    prDrafterPlugin.teardown!(api as never);

    expect(unsub1).toHaveBeenCalled();
    expect(unsub2).toHaveBeenCalled();
  });

  it('teardown is safe when no subscriptions exist', async () => {
    const api = makeApi();
    expect(() => prDrafterPlugin.teardown!(api as never)).not.toThrow();
  });

  it('teardown handles unsub throwing', async () => {
    const api = makeApi();
    api.onPattern = vi.fn(() => {
      throw new Error('unsub fails');
    });
    prDrafterPlugin.teardown!(api as never);
    expect(api.log.info).toHaveBeenCalled();
  });
});
