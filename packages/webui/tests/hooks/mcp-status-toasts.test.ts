import { beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn() }));
vi.mock('@/components/Toaster', () => ({ toast }));

import { WS_HANDLERS } from '@/hooks/ws-handlers';
import {
  _resetMcpStatusHandlersForTests,
  handleMcpServerDisconnected,
  handleMcpServerUp,
} from '@/hooks/ws-handlers/mcp-status-handlers';
import type { WSServerMessage } from '@/types';

const msg = (type: string, payload: unknown) => ({ type, payload }) as unknown as WSServerMessage;

beforeEach(() => {
  _resetMcpStatusHandlersForTests();
  toast.warn.mockClear();
  toast.info.mockClear();
});

describe('MCP status toasts', () => {
  it('are installed page-wide, not only while the MCP settings section is open', () => {
    expect(WS_HANDLERS['mcp.server.disconnected']).toBe(handleMcpServerDisconnected);
    expect(WS_HANDLERS['mcp.server.connected']).toBe(handleMcpServerUp);
    expect(WS_HANDLERS['mcp.server.reconnected']).toBe(handleMcpServerUp);
  });

  it('stay quiet about routine drops', () => {
    handleMcpServerDisconnected(
      msg('mcp.server.disconnected', { name: 'lazy', reason: 'idle-sleep' }),
    );
    handleMcpServerDisconnected(msg('mcp.server.disconnected', { name: 'x', reason: 'exit:1' }));
    handleMcpServerUp(msg('mcp.server.connected', { name: 'lazy' }));
    expect(toast.warn).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('warn once about a terminal failure and say when the server is back', () => {
    const down = msg('mcp.server.disconnected', {
      name: 'flaky',
      reason: 'reconnect-exhausted:5\nstack',
      terminal: true,
    });
    handleMcpServerDisconnected(down);
    handleMcpServerDisconnected(down);
    expect(toast.warn).toHaveBeenCalledTimes(1);
    expect(toast.warn.mock.calls[0]?.[0]).toBe(
      'MCP server "flaky" is not connected (reconnect-exhausted:5); its tools are unavailable. Retry with /mcp restart flaky.',
    );
    handleMcpServerUp(msg('mcp.server.reconnected', { name: 'flaky', toolCount: 2 }));
    expect(toast.info).toHaveBeenCalledWith('MCP server "flaky" is connected again.');
  });
});
