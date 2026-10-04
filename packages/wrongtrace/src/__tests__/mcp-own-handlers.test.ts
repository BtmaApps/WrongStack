import { describe, expect, it, vi } from 'vitest';
import { createMcpTransport } from '../adapters/mcp.js';

describe('MCP tool bag ownership', () => {
  it('does not invoke inherited handlers excluded from the available tool list', async () => {
    const inherited = vi.fn(async () => ({ ok: true }));
    const transport = createMcpTransport(Object.create({ lock_file: inherited }));
    expect(transport.isWired).toBe(false);
    expect(transport.availableTools).toEqual([]);
    expect(await transport.invoke('lock_file', {})).toBeNull();
    expect(inherited).not.toHaveBeenCalled();
    const own = createMcpTransport({ lock_file: inherited });
    expect(await own.invoke('lock_file', {})).toEqual({ ok: true });
    expect(inherited).toHaveBeenCalledOnce();
    expect(await createMcpTransport(Object.create(null)).invoke('lock_file', {})).toBeNull();
  });
});
