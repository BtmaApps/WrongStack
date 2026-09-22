import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { handlers, client } = vi.hoisted(() => {
  const handlers = new Map<string, (message: unknown) => void>();
  const client = {
    on: vi.fn((type: string, handler: (message: unknown) => void) => {
      handlers.set(type, handler);
      return () => handlers.delete(type);
    }),
    send: vi.fn(),
    listMcpServers: vi.fn(),
    updateMcpServer: vi.fn(),
  };
  return { handlers, client };
});

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: () => ({ client }),
}));

import { MCPSection } from '../../src/components/SettingsPanel/MCPSection';

function emitServerList(servers: unknown[]): void {
  act(() => {
    handlers.get('mcp.list')?.({ type: 'mcp.list', payload: { servers } });
  });
}

beforeEach(() => {
  handlers.clear();
  client.on.mockClear();
  client.send.mockClear();
  client.listMcpServers.mockClear();
  client.updateMcpServer.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('MCPSection Edit dialog', () => {
  it('loads stdio config details from the selected server', () => {
    render(<MCPSection />);
    emitServerList([
      {
        name: 'github',
        transport: 'stdio',
        status: 'stopped',
        enabled: false,
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_TOKEN: 'configured-token' },
      },
    ]);

    fireEvent.click(screen.getByTitle('Edit'));

    expect(screen.getByDisplayValue('npx')).toBeDefined();
    expect(screen.getByDisplayValue('-y @modelcontextprotocol/server-github')).toBeDefined();
    expect(screen.getByDisplayValue('GITHUB_TOKEN=configured-token')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(client.updateMcpServer).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'github',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_TOKEN: 'configured-token' },
      }),
    );
  });

  it('loads the configured URL for HTTP transports', () => {
    render(<MCPSection />);
    emitServerList([
      {
        name: 'remote',
        transport: 'streamable-http',
        status: 'stopped',
        enabled: false,
        url: 'https://mcp.example.com/mcp',
      },
    ]);

    fireEvent.click(screen.getByTitle('Edit'));

    expect(screen.getByDisplayValue('https://mcp.example.com/mcp')).toBeDefined();
  });
});
