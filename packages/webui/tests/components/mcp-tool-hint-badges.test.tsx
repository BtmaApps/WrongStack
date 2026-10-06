import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
import { i18n } from '../../src/i18n';

function emitServerList(servers: unknown[]): void {
  act(() => {
    handlers.get('mcp.list')?.({ type: 'mcp.list', payload: { servers } });
  });
}

function emitDiscovered(payload: unknown): void {
  act(() => {
    handlers.get('mcp.server.discovered')?.({ type: 'mcp.server.discovered', payload });
  });
}

/** Expand a server card (click its header row) so the tools list renders. */
function expandServer(name: string): void {
  fireEvent.click(screen.getByText(name));
}

/**
 * The wrapper span around one tool name badge and its hint badges —
 * `MCPServerCards.ServerCard` renders one per tool.
 */
function toolRow(toolName: string): HTMLElement {
  const badge = screen.getByText(toolName);
  const wrapper = badge.parentElement;
  if (!wrapper) throw new Error(`no wrapper around tool ${toolName}`);
  return wrapper;
}

function serverWith(
  tools: string[],
  toolAnnotations?: Record<string, unknown>,
): Array<Record<string, unknown>> {
  return [
    {
      name: 'srv',
      transport: 'stdio',
      status: 'connected',
      enabled: true,
      tools,
      ...(toolAnnotations ? { toolAnnotations } : {}),
    },
  ];
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

describe('MCPSection server-claimed tool hint badges', () => {
  // Pin the language before rendering: badge labels come from t(), and an
  // unpinned translator can race initialization into raw keys.
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('readOnlyHint:true shows "Read-only" (and never "Destructive") with the unenforced-hint tooltip', () => {
    render(<MCPSection />);
    emitServerList(serverWith(['read_x', 'plain'], { read_x: { readOnlyHint: true } }));
    expandServer('srv');

    const readRow = toolRow('read_x');
    expect(within(readRow).getByText('Read-only')).toBeDefined();
    expect(within(readRow).queryByText('Destructive')).toBeNull();
    expect(within(readRow).queryByText('Open world')).toBeNull();
    // The badge must say what it is: a hint the SERVER claimed, unenforced.
    expect(within(readRow).getByText('Read-only').getAttribute('title')).toContain(
      'not enforced by WrongStack',
    );
  });

  it('readOnlyHint:false + destructiveHint:true shows "Destructive"', () => {
    render(<MCPSection />);
    emitServerList(
      serverWith(['write_x'], { write_x: { readOnlyHint: false, destructiveHint: true } }),
    );
    expandServer('srv');

    const writeRow = toolRow('write_x');
    expect(within(writeRow).getByText('Destructive')).toBeDefined();
    expect(within(writeRow).queryByText('Read-only')).toBeNull();
  });

  it('openWorldHint:true shows "Open world"', () => {
    render(<MCPSection />);
    emitServerList(serverWith(['fetch_x'], { fetch_x: { openWorldHint: true } }));
    expandServer('srv');

    expect(within(toolRow('fetch_x')).getByText('Open world')).toBeDefined();
  });

  it('renders no badge for a tool without hints (absence is not a claim)', () => {
    render(<MCPSection />);
    emitServerList(serverWith(['plain_a', 'plain_b'], { plain_a: { title: 'Just a title' } }));
    expandServer('srv');

    // plain_a carries only a title (no boolean hint) → no badges.
    const rowA = toolRow('plain_a');
    expect(within(rowA).queryByText('Read-only')).toBeNull();
    expect(within(rowA).queryByText('Destructive')).toBeNull();
    expect(within(rowA).queryByText('Open world')).toBeNull();
    // plain_b has no annotation entry at all → no badges.
    const rowB = toolRow('plain_b');
    expect(within(rowB).queryByText('Read-only')).toBeNull();
    expect(within(rowB).queryByText('Destructive')).toBeNull();
    expect(within(rowB).queryByText('Open world')).toBeNull();
  });

  it('a read-only tool never shows "Destructive" even when the server set both hints', () => {
    render(<MCPSection />);
    emitServerList(serverWith(['both'], { both: { readOnlyHint: true, destructiveHint: true } }));
    expandServer('srv');

    const row = toolRow('both');
    expect(within(row).getByText('Read-only')).toBeDefined();
    expect(within(row).queryByText('Destructive')).toBeNull();
  });

  it('shows no badges at all when the payload carries no toolAnnotations', () => {
    render(<MCPSection />);
    emitServerList(serverWith(['x', 'y']));
    expandServer('srv');

    expect(screen.queryByText('Read-only')).toBeNull();
    expect(screen.queryByText('Destructive')).toBeNull();
    expect(screen.queryByText('Open world')).toBeNull();
  });

  it('mcp.server.discovered replaces the tool list and its badges', () => {
    render(<MCPSection />);
    emitServerList(serverWith(['old']));
    expandServer('srv');
    expect(screen.queryByText('Read-only')).toBeNull();

    emitDiscovered({
      name: 'srv',
      tools: ['new_tool'],
      toolAnnotations: { new_tool: { readOnlyHint: true } },
    });

    expect(screen.getByText('new_tool')).toBeDefined();
    expect(within(toolRow('new_tool')).getByText('Read-only')).toBeDefined();
    expect(screen.queryByText('old')).toBeNull();
  });
});
