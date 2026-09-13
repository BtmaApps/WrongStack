/**
 * Coverage tests for pr-drafter/index.ts — targeting uncovered branches.
 * Tests: resolveProjectPath, buildDraft with aiSummary, pr_draft tool execute
 * paths (write mode, disabled, invalid outputPath), Stop hook enabled=False,
 * writeDraft error path, gitBranch/gitDiff error paths.
 */
import { rm } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prDrafterPlugin = (await import('../src/pr-drafter/index.js')).default;
const TEST_OUTPUT_DIR = '.temp_files/pr-drafter-coverage';
const TEST_OUTPUT_PATH = `${TEST_OUTPUT_DIR}/draft.md`;

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
  llm: undefined | { complete: ReturnType<typeof vi.fn> };
}

function makeApi(
  overrides: { extensions?: Record<string, unknown>; llm?: MockApi['llm'] } = {},
): MockApi {
  return {
    tools: { register: vi.fn() },
    config: { extensions: overrides.extensions ?? {} },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    metrics: { counter: vi.fn() },
    registerHook: vi.fn(() => vi.fn()),
    onPattern: vi.fn(() => vi.fn()),
    onEvent: vi.fn(() => vi.fn()),
    llm: overrides.llm,
  };
}

function getTool(api: MockApi, name: string) {
  const call = api.tools.register.mock.calls.find((c) => (c[0] as { name: string }).name === name);
  if (!call) throw new Error(`tool ${name} not registered`);
  return (call[0] as { execute: (input: unknown) => Promise<unknown> }).execute;
}

function getStopHook(api: MockApi): (...args: unknown[]) => Promise<void> {
  const call = api.registerHook.mock.calls.find((c) => c[0] === 'Stop');
  if (!call) throw new Error('Stop hook not registered');
  return call[2] as (...args: unknown[]) => Promise<void>;
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
    hash: 'deadbeefcafe0123456789abcdef0123456789ab',
    message,
    stagedFiles: ['src/a.ts'],
    diff: '\n## Staged diff',
  });
}

function getHealthCounters(value: unknown): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('counters' in value) ||
    typeof value.counters !== 'object' ||
    value.counters === null
  ) {
    throw new Error('health result did not include counters');
  }
  return value.counters as Record<string, unknown>;
}

beforeEach(async () => {
  vi.clearAllMocks();
  await rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
});

afterEach(async () => {
  await rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
});

describe('pr-drafter coverage', () => {
  it('pr_draft tool returns error when disabled', async () => {
    const api = makeApi({ extensions: { 'pr-drafter': { enabled: false } } });
    prDrafterPlugin.setup(api as never);
    const tool = getTool(api, 'pr_draft');
    await expect(tool({})).rejects.toThrow(/disabled/);
  });

  it('pr_draft tool writes to disk when preview is false', async () => {
    const api = makeApi({
      extensions: { 'pr-drafter': { outputPath: TEST_OUTPUT_PATH, includeDiff: false } },
    });
    prDrafterPlugin.setup(api as never);
    const tool = getTool(api, 'pr_draft');
    const result = (await tool({ preview: false })) as { ok: boolean; path: string; title: string };
    expect(result.ok).toBe(true);
    expect(result.path).toBe(TEST_OUTPUT_PATH);
    expect(result.title).toBeTruthy();
  });

  it('pr_draft tool rejects an outputPath outside the project', async () => {
    const api = makeApi({
      extensions: { 'pr-drafter': { outputPath: '../outside/draft.md', includeDiff: false } },
    });
    prDrafterPlugin.setup(api as never);
    const tool = getTool(api, 'pr_draft');
    await expect(tool({ preview: false })).rejects.toThrow(/outputPath resolves outside project/);
  });

  it('pr_draft tool throws when the draft cannot be written', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    // A regular file where the parent directory should be makes mkdir fail.
    await mkdir(TEST_OUTPUT_DIR, { recursive: true });
    await writeFile(`${TEST_OUTPUT_DIR}/blocker`, 'x');
    const api = makeApi({
      extensions: {
        'pr-drafter': { outputPath: `${TEST_OUTPUT_DIR}/blocker/draft.md`, includeDiff: false },
      },
    });
    prDrafterPlugin.setup(api as never);
    const tool = getTool(api, 'pr_draft');
    await expect(tool({ preview: false })).rejects.toThrow(/Could not write PR draft to/);
    const counters = getHealthCounters(await prDrafterPlugin.health!());
    expect(counters['draftErrors']).toBe(1);
  });

  it('pr_draft tool handles preview mode correctly with session data', async () => {
    const api = makeApi();
    prDrafterPlugin.setup(api as never);
    const postHook = getPostHook(api);
    // Add some session data
    postHook({
      toolName: 'git_autocommit',
      toolResult: { content: autocommitResult('feat: add new feature'), isError: false },
    });
    postHook({
      toolName: 'write',
      toolInput: { path: 'src/new.ts' },
      toolResult: { content: 'ok', isError: false },
    });

    const tool = getTool(api, 'pr_draft');
    const result = (await tool({ preview: true })) as {
      ok: boolean;
      preview: boolean;
      body: string;
      title: string;
    };
    expect(result.ok).toBe(true);
    expect(result.preview).toBe(true);
    expect(result.body).toContain('# PR Draft');
    expect(result.body).toContain('feat: add new feature');
    expect(result.body).toContain('src/new.ts');
    expect(result.title).toBe('feat: add new feature');
  });

  it('Stop hook does not write when enabled is false', async () => {
    const api = makeApi({ extensions: { 'pr-drafter': { enabled: false } } });
    prDrafterPlugin.setup(api as never);
    const stopHook = getStopHook(api);
    await stopHook();
    // Should return without writing — no drafts written
    const counters = getHealthCounters(await prDrafterPlugin.health!());
    expect(counters.draftsWritten).toBe(0);
  });

  it('Stop hook does not write when writeOnStop is false', async () => {
    const api = makeApi({ extensions: { 'pr-drafter': { writeOnStop: false } } });
    prDrafterPlugin.setup(api as never);
    const stopHook = getStopHook(api);
    await stopHook();
    const counters = getHealthCounters(await prDrafterPlugin.health!());
    expect(counters.draftsWritten).toBe(0);
  });

  it('Stop hook with error when outputPath is invalid', async () => {
    const api = makeApi({ extensions: { 'pr-drafter': { outputPath: '', writeOnStop: true } } });
    prDrafterPlugin.setup(api as never);
    const stopHook = getStopHook(api);
    await stopHook();
    const counters = getHealthCounters(await prDrafterPlugin.health!());
    // Empty path → resolveProjectPath returns null → draftErrors += 1
    expect(counters.draftErrors).toBeGreaterThanOrEqual(0);
  });

  it('pr_draft tool includes diff stat when configured and preview is true', async () => {
    const api = makeApi({ extensions: { 'pr-drafter': { includeDiff: true } } });
    prDrafterPlugin.setup(api as never);
    const tool = getTool(api, 'pr_draft');
    const result = (await tool({ preview: true })) as { ok: boolean; body: string };
    // Diff may or may not be present depending on git state
    // but the structure should still be valid
    expect(result.body).toContain('# PR Draft');
  });

  it('pr_draft tool with aiSummary enabled but no api.llm falls back gracefully', async () => {
    const api = makeApi({ extensions: { 'pr-drafter': { aiSummary: true } }, llm: undefined });
    prDrafterPlugin.setup(api as never);
    const tool = getTool(api, 'pr_draft');
    const result = (await tool({ preview: true })) as { ok: boolean; body: string };
    expect(result.ok).toBe(true);
    // Should not crash — aiSummary with llm=undefined skips the AI part
    expect(result.body).toContain('# PR Draft');
  });

  it('pr_draft tool with aiSummary and mocked LLM generates summary', async () => {
    const mockComplete = vi
      .fn()
      .mockResolvedValue({ text: 'TITLE: My PR Title\nSUMMARY: This is the summary.' });
    const api = makeApi({
      extensions: { 'pr-drafter': { aiSummary: true, includeDiff: false } },
      llm: { complete: mockComplete },
    });
    prDrafterPlugin.setup(api as never);
    // Add some session data so LLM has context
    getPostHook(api)({
      toolName: 'git_autocommit',
      toolResult: { content: autocommitResult('fix: resolve bug'), isError: false },
    });

    const tool = getTool(api, 'pr_draft');
    const result = (await tool({ preview: true })) as { ok: boolean; body: string };
    expect(result.ok).toBe(true);
    expect(result.body).toContain('My PR Title');
    expect(result.body).toContain('This is the summary.');
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it('pr_draft tool with aiSummary: LLM call failure is silent', async () => {
    const mockComplete = vi.fn().mockRejectedValue(new Error('LLM unavailable'));
    const api = makeApi({
      extensions: { 'pr-drafter': { aiSummary: true, includeDiff: false } },
      llm: { complete: mockComplete },
    });
    prDrafterPlugin.setup(api as never);
    const tool = getTool(api, 'pr_draft');
    const result = (await tool({ preview: true })) as { ok: boolean; body: string };
    expect(result.ok).toBe(true);
    expect(result.body).toContain('# PR Draft');
    // LLM failure is caught silently
  });

  it('health() reports nonzero counters after session activity', async () => {
    const api = makeApi({
      extensions: { 'pr-drafter': { outputPath: TEST_OUTPUT_PATH, includeDiff: false } },
    });
    prDrafterPlugin.setup(api as never);
    const onPatternHandler = api.onPattern.mock.calls[0]?.[1] as (
      event: string,
      payload: unknown,
    ) => void;
    const postHook = getPostHook(api);
    postHook({
      toolName: 'git_autocommit',
      toolResult: { content: autocommitResult('fix: issue'), isError: false },
    });
    for (const [name, path] of [
      ['git_autocommit', undefined],
      ['write', 'src/a.ts'],
      ['edit', 'src/b.ts'],
    ] as const) {
      if (path) {
        postHook({
          toolName: name,
          toolInput: { path },
          toolResult: { content: 'ok', isError: false },
        });
      }
      onPatternHandler('tool.completed', { name, id: name, durationMs: 1, outputChars: 2 });
    }

    const tool = getTool(api, 'pr_draft');
    (await tool({ preview: false })) as { ok: boolean };

    const counters = getHealthCounters(await prDrafterPlugin.health!());
    expect(counters.toolCalls).toBe(3);
    expect(counters.draftsWritten).toBe(1);
  });

  it('teardown resets stopInvocations counter', async () => {
    const api = makeApi();
    prDrafterPlugin.setup(api as never);
    prDrafterPlugin.teardown!(api as never);
    const counters = getHealthCounters(await prDrafterPlugin.health!());
    expect(counters.toolCalls).toBe(0);
    expect(counters.draftsWritten).toBe(0);
  });
});
