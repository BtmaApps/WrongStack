/**
 * A tool call made from inside another tool (`ctx.nestedToolCall`, what
 * `tool_script` uses) goes through the same gate as one the model made:
 * permission, confirmation, the `tool.executed` event and the journal.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Agent, createDefaultPipelines } from '../../src/core/agent.js';
import { Context } from '../../src/core/context.js';
import { DefaultErrorHandler } from '../../src/execution/error-handler.js';
import { DefaultRetryPolicy } from '../../src/execution/retry-policy.js';
import { ToolExecutor } from '../../src/execution/tool-executor.js';
import { DefaultLogger } from '../../src/infrastructure/logger.js';
import { DefaultTokenCounter } from '../../src/infrastructure/token-counter.js';
import { Container } from '../../src/kernel/container.js';
import { EventBus } from '../../src/kernel/events.js';
import { TOKENS } from '../../src/kernel/tokens.js';
import { ProviderRegistry } from '../../src/registry/provider-registry.js';
import { ToolRegistry } from '../../src/registry/tool-registry.js';
import { DefaultPermissionPolicy } from '../../src/security/permission-policy.js';
import { DefaultSecretScrubber } from '../../src/security/secret-scrubber.js';
import { DefaultSessionStore } from '../../src/storage/session-store.js';
import type { NestedToolCallResult } from '../../src/types/context.js';
import type { Tool } from '../../src/types/tool.js';
import { MockProvider } from '../helpers/mock-provider.js';

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await fs.rm(dir, { recursive: true, force: true });
});

const ran: string[] = [];

function tool(name: string, permission: Tool['permission']): Tool {
  return {
    name,
    description: '',
    inputSchema: { type: 'object' },
    permission,
    mutating: false,
    async execute() {
      ran.push(name);
      return `${name} ran`;
    },
  };
}

/** Calls `risky` then `echo` through the nested gate and reports both. */
const composer: Tool = {
  name: 'composer',
  description: '',
  inputSchema: { type: 'object' },
  permission: 'auto',
  mutating: false,
  async execute(_input, ctx, opts) {
    const call = ctx.nestedToolCall;
    if (!call) throw new Error('no gate');
    const results: NestedToolCallResult[] = [];
    let index = 0;
    for (const name of ['risky', 'echo']) {
      index += 1;
      results.push(await call({ name, input: {}, parentToolUseId: opts.toolUseId ?? 'x', index }));
    }
    return JSON.stringify(results);
  },
};

async function buildAgent(provider: MockProvider) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-nested-'));
  dirs.push(tmp);
  const container = new Container();
  container.bind(TOKENS.Logger, () => new DefaultLogger({ level: 'error' }));
  container.bind(TOKENS.RetryPolicy, () => new DefaultRetryPolicy());
  container.bind(TOKENS.ErrorHandler, () => new DefaultErrorHandler());
  container.bind(TOKENS.SecretScrubber, () => new DefaultSecretScrubber());
  container.bind(TOKENS.TokenCounter, () => new DefaultTokenCounter());
  container.bind(
    TOKENS.PermissionPolicy,
    () => new DefaultPermissionPolicy({ trustFile: path.join(tmp, 'trust.json'), yolo: false }),
  );
  const registry = new ToolRegistry();
  for (const t of [tool('echo', 'auto'), tool('risky', 'confirm'), composer]) registry.register(t);
  const events = new EventBus();
  const sessionStore = new DefaultSessionStore({ dir: path.join(tmp, 'sessions') });
  const session = await sessionStore.create({ id: '', model: 'test', provider: 'mock' });
  const append = vi.spyOn(session, 'append');
  const appendBatch = vi.spyOn(session, 'appendBatch');
  const ctx = new Context({
    systemPrompt: [{ type: 'text', text: 'test' }],
    provider,
    session,
    signal: new AbortController().signal,
    tokenCounter: container.resolve(TOKENS.TokenCounter),
    cwd: tmp,
    projectRoot: tmp,
    model: 'test-model',
  });
  const agent = new Agent({
    container,
    tools: registry,
    providers: new ProviderRegistry(),
    events,
    pipelines: createDefaultPipelines(),
    context: ctx,
    maxIterations: 10,
    toolExecutor: new ToolExecutor(registry, {
      permissionPolicy: container.resolve(TOKENS.PermissionPolicy),
      secretScrubber: container.resolve(TOKENS.SecretScrubber),
      events,
      confirmAwaiter: undefined,
      iterationTimeoutMs: 300_000,
      perIterationOutputCapBytes: 100_000,
      tracer: undefined,
    }),
  });
  const journal = () =>
    [...append.mock.calls.map(([e]) => e), ...appendBatch.mock.calls.flatMap(([batch]) => batch)]
      .filter((e) => e.type === 'tool_use' || e.type === 'tool_result')
      .map((e) => ({
        type: e.type,
        id: (e as { id: string }).id,
        ...(e.type === 'tool_result'
          ? { settlement: (e as { settlement?: string }).settlement }
          : {}),
      }));
  return { agent, events, ctx, journal };
}

const turn = {
  content: [{ type: 'tool_use' as const, id: 'u-comp', name: 'composer', input: {} }],
  stopReason: 'tool_use' as const,
};
const done = { content: [{ type: 'text' as const, text: 'ok' }], stopReason: 'end_turn' as const };

describe('a tool call made from inside a tool', () => {
  it('is confirmed, reported and journaled like a direct call', async () => {
    ran.length = 0;
    const provider = new MockProvider([turn, done]);
    const { agent, events, journal, ctx } = await buildAgent(provider);
    const asked: string[] = [];
    events.on('tool.confirm_needed', (e) => {
      asked.push(e.toolUseId);
      e.resolve('no');
    });
    const executed: Array<{ id?: string | undefined; settlement?: string | undefined }> = [];
    events.on('tool.executed', (e) => executed.push({ id: e.id, settlement: e.settlement }));

    await agent.run('go');

    // `risky` needed a confirmation and was refused; it never ran.
    expect(asked).toEqual(['u-comp~1']);
    expect(ran).toEqual(['echo']);
    expect(executed).toEqual(
      expect.arrayContaining([
        { id: 'u-comp~1', settlement: 'declined' },
        { id: 'u-comp~2', settlement: 'completed' },
        { id: 'u-comp', settlement: 'completed' },
      ]),
    );
    expect(journal()).toEqual(
      expect.arrayContaining([
        { type: 'tool_use', id: 'u-comp~1' },
        { type: 'tool_result', id: 'u-comp~1', settlement: 'declined' },
        { type: 'tool_use', id: 'u-comp~2' },
        { type: 'tool_result', id: 'u-comp~2', settlement: 'completed' },
      ]),
    );
    // The composer got the refusal as a failed result, not a silent success.
    const result = ctx.messages
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .find((b) => b.type === 'tool_result' && b.tool_use_id === 'u-comp');
    const reported = JSON.parse(String((result as { content: string }).content)) as Array<{
      isError: boolean;
      content: string;
    }>;
    expect(reported[0]).toMatchObject({
      isError: true,
      content: expect.stringContaining('denied'),
    });
    expect(reported[1]).toEqual({ isError: false, content: 'echo ran' });
    // Only the composer's own result reached the conversation.
    const ids = ctx.messages
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .filter((b) => b.type === 'tool_result')
      .map((b) => (b as { tool_use_id: string }).tool_use_id);
    expect(ids).toEqual(['u-comp']);
  });

  it('runs a confirmed call once it is approved', async () => {
    ran.length = 0;
    const { agent, events } = await buildAgent(new MockProvider([turn, done]));
    events.on('tool.confirm_needed', (e) => e.resolve('yes'));
    await agent.run('go');
    expect(ran).toEqual(['risky', 'echo']);
  });
});
