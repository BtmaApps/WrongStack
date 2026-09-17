import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  collectConnectionsHealth: vi.fn(),
  executeConnectionAction: vi.fn(),
  isRestartableService: vi.fn((id: string) => id !== 'governance'),
}));

vi.mock('../src/connections-health.js', () => ({
  collectConnectionsHealth: mocks.collectConnectionsHealth,
}));

vi.mock('../src/connection-actions.js', () => ({
  executeConnectionAction: mocks.executeConnectionAction,
  isRestartableService: mocks.isRestartableService,
}));

import { ConnectionsPanel } from '../src/components/connections-panel.js';

const mockReport = {
  checkedAt: 1700000000000,
  overall: 'healthy' as const,
  services: [
    {
      id: 'session-catalog' as const,
      label: 'Session Catalog',
      status: 'healthy' as const,
      required: true,
      mode: 'project-daemon',
      detail: '5 catalog session(s)',
      ownerPid: 1234,
      latencyMs: 2,
    },
    {
      id: 'chronicle' as const,
      label: 'Chronicle telemetry',
      status: 'healthy' as const,
      required: true,
      mode: 'server',
      detail: 'Serving telemetry',
      ownerPid: 2345,
      latencyMs: 1,
    },
    {
      id: 'governance' as const,
      label: 'Governance control plane',
      status: 'offline' as const,
      required: false,
      mode: 'compatibility-default-off',
      detail: 'Not active for this project.',
    },
  ],
};

describe('ConnectionsPanel component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.collectConnectionsHealth.mockResolvedValue(mockReport);
    mocks.executeConnectionAction.mockResolvedValue({
      serviceId: 'session-catalog',
      action: 'restart',
      success: true,
      message: 'Session Catalog IPC daemon restarted successfully',
    });
  });

  it('renders all services with navigation cursor', async () => {
    const onClose = vi.fn();
    const { lastFrame } = render(
      <ConnectionsPanel projectRoot="C:/repo" onClose={onClose} />,
    );

    // Wait for async fetch to complete and component to re-render
    await vi.waitFor(() => {
      expect(lastFrame()).toContain('Service Connections');
      expect(lastFrame()).toContain('Session Catalog');
    });

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Chronicle telemetry');
    expect(frame).toContain('Governance control plane');
    expect(frame).toContain('› '); // Cursor on first item
    expect(frame).toContain('[Enter: restart]');
    expect(frame).toContain('↑/↓ select · Enter restart');
  });

  it('navigates selection with arrow down and shows read-only for governance', async () => {
    const onClose = vi.fn();
    const { lastFrame, stdin } = render(
      <ConnectionsPanel projectRoot="C:/repo" onClose={onClose} />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain('Session Catalog');
    });

    // Move down twice to reach Governance
    stdin.write('\u001B[B'); // down arrow
    stdin.write('\u001B[B'); // down arrow

    await vi.waitFor(() => {
      const frame = lastFrame() ?? '';
      expect(frame).toContain('[read-only]');
    });
  });

  it('enters confirmation prompt on Enter and executes restart on confirm', async () => {
    const onClose = vi.fn();
    const { lastFrame, stdin } = render(
      <ConnectionsPanel projectRoot="C:/repo" onClose={onClose} />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain('Session Catalog');
    });

    // Press Enter to initiate restart confirmation
    stdin.write('\r');

    await vi.waitFor(() => {
      expect(lastFrame()).toContain('Restart Session Catalog?');
      expect(lastFrame()).toContain('[y/Enter] Restart');
    });

    // Confirm with 'y'
    stdin.write('y');

    await vi.waitFor(() => {
      expect(mocks.executeConnectionAction).toHaveBeenCalledWith(
        'session-catalog',
        'restart',
        'C:/repo',
      );
      expect(lastFrame()).toContain('restarted successfully');
    });
  });

  it('cancels confirmation on Esc / n', async () => {
    const onClose = vi.fn();
    const { lastFrame, stdin } = render(
      <ConnectionsPanel projectRoot="C:/repo" onClose={onClose} />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain('Session Catalog');
    });

    // Enter confirmation
    stdin.write('\r');
    await vi.waitFor(() => {
      expect(lastFrame()).toContain('Restart Session Catalog?');
    });

    // Cancel with 'n'
    stdin.write('n');
    await vi.waitFor(() => {
      expect(lastFrame()).not.toContain('Restart Session Catalog?');
    });
    expect(mocks.executeConnectionAction).not.toHaveBeenCalled();
  });

  it('shows read-only notice when attempting to restart non-restartable service', async () => {
    const onClose = vi.fn();
    const { lastFrame, stdin } = render(
      <ConnectionsPanel projectRoot="C:/repo" onClose={onClose} />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain('Session Catalog');
    });

    // Move down twice to governance
    stdin.write('\u001B[B');
    stdin.write('\u001B[B');

    // Press Enter
    stdin.write('\r');

    await vi.waitFor(() => {
      expect(lastFrame()).toContain('read-only');
    });
    expect(mocks.executeConnectionAction).not.toHaveBeenCalled();
  });

  it('calls onClose on q', async () => {
    const onClose = vi.fn();
    const { lastFrame, stdin } = render(
      <ConnectionsPanel projectRoot="C:/repo" onClose={onClose} />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain('Session Catalog');
    });

    stdin.write('q');
    expect(onClose).toHaveBeenCalled();
  });

  it('scrolls and displays indicators when height is constrained by maxRows', async () => {
    const fullReport = {
      ...mockReport,
      services: [
        ...mockReport.services,
        {
          id: 'kanban' as const,
          label: 'Kanban IPC',
          status: 'healthy' as const,
          required: true,
          mode: 'project-server',
          detail: 'Single shared project-server',
        },
        {
          id: 'sage' as const,
          label: 'SAGE memory',
          status: 'healthy' as const,
          required: false,
          mode: 'project-server',
          detail: 'Persistent memory',
        },
      ],
    };
    mocks.collectConnectionsHealth.mockResolvedValue(fullReport);

    const onClose = vi.fn();
    // Constrain height with maxRows so only a subset fits
    const { lastFrame, stdin } = render(
      <ConnectionsPanel projectRoot="C:/repo" onClose={onClose} maxRows={12} />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain('Session Catalog');
    });

    const frame = lastFrame() ?? '';
    expect(frame).toContain('more below');
    expect(frame).toContain('1/5');

    // Scroll down multiple times
    stdin.write('\u001B[B');
    stdin.write('\u001B[B');
    stdin.write('\u001B[B');

    await vi.waitFor(() => {
      const scrolled = lastFrame() ?? '';
      expect(scrolled).toContain('more above');
    });
  });
});

