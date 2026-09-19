import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('@wrongstack/sage', () => ({
  createSageTools: () => [
    {
      name: 'memory_probe',
      description: 'Probe cancellation',
      permission: 'auto',
      riskTier: 'safe',
      inputSchema: { type: 'object', properties: {} },
      execute: mocks.execute,
    },
  ],
  getSageService: () => ({}),
  isSqliteAvailable: () => true,
}));

import { createSageMcpToolHost } from '../src/adapter.js';

describe('SAGE MCP request cancellation', () => {
  it('forwards the request-scoped signal to the SAGE tool', async () => {
    mocks.execute.mockResolvedValueOnce({ ok: true });
    const host = createSageMcpToolHost({} as never);
    const controller = new AbortController();

    await host.callTool('memory_probe', {}, { signal: controller.signal });

    expect(mocks.execute).toHaveBeenCalledWith({}, expect.anything(), {
      signal: controller.signal,
    });
  });

  it('does not execute a SAGE tool for a pre-cancelled request', async () => {
    mocks.execute.mockClear();
    const host = createSageMcpToolHost({} as never);
    const controller = new AbortController();
    controller.abort(new Error('already cancelled'));

    await expect(host.callTool('memory_probe', {}, { signal: controller.signal })).resolves.toEqual(
      { content: 'already cancelled', isError: true },
    );
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
