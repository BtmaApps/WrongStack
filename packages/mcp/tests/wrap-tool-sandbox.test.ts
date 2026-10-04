import {
  clearSandboxAgentOverrides,
  configureSandboxPolicy,
  createSandboxMcpGate,
  resetSandboxPolicy,
  SandboxDeniedError,
  setSandboxAgentOverride,
} from '@wrongstack/core/sandbox';
import { afterEach, describe, expect, it } from 'vitest';
import type { MCPClient } from '../src/client.js';
import type { MCPTool } from '../src/contracts.js';
import { wrapMCPTool } from '../src/wrap-tool.js';

const tool: MCPTool = { name: 'run', inputSchema: { type: 'object' } };
const client = () =>
  Promise.resolve({ callTool: async () => ({ content: [] }) } as unknown as MCPClient);

type Exec = Parameters<ReturnType<typeof wrapMCPTool>['execute']>;
const ctx = {} as Exec[1];
const opts = { signal: new AbortController().signal };

afterEach(() => {
  resetSandboxPolicy();
  clearSandboxAgentOverrides();
});

describe('wrapMCPTool sandbox gate — per-server trust mark (plan 28, mcpServers.*.sandboxTrust)', () => {
  it('mode enforced + untrusted: call is sandbox_denied before reaching the server', async () => {
    configureSandboxPolicy({ mode: 'enforced', tier: 'workspace-write', backend: 'policy-only' });
    const wrapped = wrapMCPTool('srv', tool, client);
    const err = await wrapped.execute({}, ctx, opts).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SandboxDeniedError);
    expect((err as SandboxDeniedError).kind).toBe('sandbox_denied');
  });

  it('mode enforced + sandboxTrust: call bypasses the gate and reaches the server', async () => {
    configureSandboxPolicy({ mode: 'enforced', tier: 'workspace-write', backend: 'policy-only' });
    const wrapped = wrapMCPTool('srv', tool, client, 'confirm', true);
    const result = await wrapped.execute({}, ctx, opts);
    expect(typeof result).toBe('string');
  });

  it('mode off: untrusted call passes through', async () => {
    const wrapped = wrapMCPTool('srv', tool, client);
    const result = await wrapped.execute({}, ctx, opts);
    expect(typeof result).toBe('string');
  });
});

describe('createSandboxMcpGate — per-agent override resolution (T7)', () => {
  it('agent override tightened to enforced denies even when global mode is off', async () => {
    setSandboxAgentOverride('contained-worker', { mode: 'enforced', tier: 'workspace-write' });
    const wrapped = wrapMCPTool('srv', tool, client);
    const agentCtx = { agentId: 'contained-worker' } as Exec[1];
    const err = await wrapped.execute({}, agentCtx, opts).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SandboxDeniedError);
  });

  it('leader ctx (no agentId) still passes through under global off', async () => {
    setSandboxAgentOverride('contained-worker', { mode: 'enforced', tier: 'workspace-write' });
    const wrapped = wrapMCPTool('srv', tool, client);
    const result = await wrapped.execute({}, ctx, opts);
    expect(typeof result).toBe('string');
  });
});

describe('createSandboxMcpGate — stream seam', () => {
  it('mode enforced: executeStream is denied before the first yield', async () => {
    configureSandboxPolicy({ mode: 'enforced', tier: 'workspace-write', backend: 'policy-only' });
    const streamTool = {
      name: 'streamy',
      execute: async () => 'unused',
      async *executeStream() {
        yield 'leaked';
      },
    };
    const wrapped = createSandboxMcpGate()(streamTool);
    expect(wrapped.executeStream).toBeDefined();
    if (!wrapped.executeStream) return;
    const chunks: string[] = [];
    let err: unknown;
    try {
      for await (const chunk of wrapped.executeStream({}, ctx, opts)) chunks.push(String(chunk));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SandboxDeniedError);
    expect(chunks).toEqual([]);
  });

  it('mode off: executeStream passes through', async () => {
    const streamTool = {
      name: 'streamy',
      execute: async () => 'unused',
      async *executeStream() {
        yield 'ok';
      },
    };
    const wrapped = createSandboxMcpGate()(streamTool);
    expect(wrapped.executeStream).toBeDefined();
    if (!wrapped.executeStream) return;
    const chunks: string[] = [];
    for await (const chunk of wrapped.executeStream({}, ctx, opts)) chunks.push(String(chunk));
    expect(chunks).toEqual(['ok']);
  });
});
