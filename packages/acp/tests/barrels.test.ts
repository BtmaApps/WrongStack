import { describe, expect, it } from 'vitest';
import { assertNeverSessionUpdate } from '../src/types/acp-v1.js';

// Smoke-test the public barrel entry points so they are loaded and their
// re-exports stay wired.
describe('assertNeverSessionUpdate', () => {
  it('throws for any value (runtime exhaustiveness guard)', () => {
    // The function is typed (x: never) => never but at runtime it
    // throws an Error. Call it by casting away the never parameter.
    expect(() => (assertNeverSessionUpdate as (x: string) => never)('unexpected_value')).toThrow(
      'Unhandled sessionUpdate',
    );
    expect(() => (assertNeverSessionUpdate as (x: string) => never)('_unstable_foo')).toThrow(
      '_unstable_foo',
    );
  });
});

describe('acp barrels', () => {
  it('root index re-exports the public surface', async () => {
    const mod = await import('../src/index.js');
    expect(mod.StdioTransport).toBeDefined();
    expect(mod.ClientTransport).toBeDefined();
    expect(mod.ACPToolsRegistry).toBeDefined();
    expect(mod.ACPProtocolHandler).toBeDefined();
    expect(mod.WrongStackACPServer).toBeDefined();
    expect(mod.ToolTranslator).toBeDefined();
    expect(mod.makeACPSubagentRunner).toBeDefined();
    expect(mod.makeACPSubagentRunnerWithStop).toBeDefined();
    expect(mod.ACP_AGENT_COMMANDS).toBeDefined();
    expect(mod.resolveAcpAgentCommand).toBeDefined();
    expect(mod.runOneAcpTask).toBeDefined();
    expect(mod.probeAcpAgent).toBeDefined();
    expect(mod.probeAcpAgents).toBeDefined();
    expect(mod.fetchAcpRegistry).toBeDefined();
    expect(mod.runAcpBench).toBeDefined();
    expect(mod.renderAcpBenchText).toBeDefined();
    expect(mod.ACP_PROTOCOL_VERSION).toBe(1);
  });

  it('agent barrel re-exports server-side classes', async () => {
    const mod = await import('../src/agent/index.js');
    expect(mod.StdioTransport).toBeDefined();
    expect(mod.ACPToolsRegistry).toBeDefined();
    expect(mod.ACPProtocolHandler).toBeDefined();
    expect(mod.WrongStackACPServer).toBeDefined();
  });

  it('client barrel re-exports client-side classes', async () => {
    const mod = await import('../src/client/index.js');
    expect(mod.ClientTransport).toBeDefined();
    expect(mod.ToolTranslator).toBeDefined();
    expect(mod.makeACPSubagentRunner).toBeDefined();
  });

  it('separates stable v1, official SDK, and legacy entry points', async () => {
    const v1 = await import('../src/v1.js');
    expect(v1.ACP_PROTOCOL_VERSION).toBe(1);

    const sdk = await import('../src/sdk.js');
    expect(sdk.PROTOCOL_VERSION).toBeDefined();
    expect(sdk.AcpServer).toBeDefined();
    expect(sdk.createHttpStream).toBeDefined();
    expect(sdk.createWebSocketStream).toBeDefined();

    const unstable = await import('../src/sdk-unstable.js');
    expect(unstable.PROTOCOL_VERSION).toBe(1);
    expect(unstable.client).toBeTypeOf('function');
    expect(unstable.AcpServer).toBe(sdk.AcpServer);

    const legacy = await import('../src/legacy.js');
    expect(legacy.LEGACY_ACP_CONTRACT_VERSION).toBe('pre-v1-draft');
  });
});
