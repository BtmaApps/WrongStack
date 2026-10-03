import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { summarizeSystemHealth } from '../../src/components/SystemHealthChip';
import { WorkbenchTopbar } from '../../src/components/WorkbenchTopbar';
import {
  type SubagentView,
  useConfigStore,
  useFleetStore,
  useSessionStore,
  useUIStore,
} from '../../src/stores';
import { useLocalPrefs } from '../../src/stores/local-prefs';

vi.mock('../../src/i18n', () => ({
  useAppTranslation: () => ({
    // Mirror real i18next: a string second arg is the defaultValue; an options
    // object falls back to its defaultValue, else the key.
    t: (k: string, d?: string | { defaultValue?: string }) =>
      typeof d === 'string' ? d : (d?.defaultValue ?? k),
  }),
}));

vi.mock('../../src/components/ThemeProvider', () => ({
  useTheme: () => ({
    theme: 'dark',
    setTheme: vi.fn(),
    palette: 'signal',
    setPalette: vi.fn(),
  }),
}));

/** Minimal fleet stub — session-less so it matches the no-active-session
 * filter in `agentBelongsToSession` without binding a chat lane. */
function fleetAgent(id: string, status: SubagentView['status'] = 'running'): SubagentView {
  return {
    id,
    name: id,
    status,
    iteration: 0,
    toolCalls: 0,
    costUsd: 0,
    ctxPct: 0,
    ctxTokens: 0,
    maxContext: 0,
    extensions: 0,
    startedAt: 1752750000000,
    toolLog: [],
    sparklineBins: [],
  };
}

function renderTopbar(currentView = 'chat') {
  return render(
    <WorkbenchTopbar
      currentView={currentView}
      projectName="TestProject"
      sessionLabel="Session Alpha"
      isLoading={false}
      iteration={null}
      onPalette={vi.fn()}
      onSettings={vi.fn()}
    />,
  );
}

describe('WorkbenchTopbar responsive component', () => {
  beforeEach(() => {
    useUIStore.setState({ sidebarOpen: false, activeActivity: 'chat', currentView: 'chat' });
    useFleetStore.setState({ agents: new Map() });
    // The separate WrongProxy / HQ / WS indicators these tests exercise are
    // the `full` chrome; calm chrome is covered in its own describe below.
    useLocalPrefs.setState({ chromeLevel: 'full' });
  });

  it('renders project name and view badge in both mobile and desktop viewports', () => {
    render(
      <WorkbenchTopbar
        currentView="chat"
        projectName="TestProject"
        sessionLabel="Session Alpha"
        isLoading={false}
        iteration={null}
        onPalette={vi.fn()}
        onSettings={vi.fn()}
      />,
    );

    const projectLabels = screen.getAllByText('TestProject');
    expect(projectLabels.length).toBeGreaterThanOrEqual(1);

    const viewBadges = screen.getAllByText('Chat');
    expect(viewBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('triggers sidebar toggle from the mobile menu button', () => {
    renderTopbar();

    const menuBtn = screen.getByLabelText('Toggle navigation menu');
    expect(useUIStore.getState().sidebarOpen).toBe(false);

    fireEvent.click(menuBtn);
    expect(useUIStore.getState().sidebarOpen).toBe(true);
  });

  it('renders the AGENTS trigger on every main view (compact + full headers)', () => {
    for (const view of ['chat', 'kanban', 'roster', 'sddhub', 'settings']) {
      const { unmount } = renderTopbar(view);
      // jsdom applies no CSS: both the <md compact header and the >=md full
      // header mount, so the shared top bar exposes the trigger twice.
      const triggers = screen.getAllByTestId('inspector-trigger');
      expect(triggers.length).toBe(2);
      unmount();
    }
  });

  it('title-area trigger keeps the agent count visible even with zero agents', () => {
    renderTopbar();

    const counts = screen.getAllByTestId('inspector-trigger').map((el) => el.textContent ?? '');
    // The desktop title-row placement passes showCountWhenZero, so one of the
    // two triggers renders a muted 0 badge instead of hiding the count.
    expect(counts.some((text) => text.includes('0'))).toBe(true);
  });

  it('shows the running-subagent count for the active session', () => {
    useFleetStore.setState({
      agents: new Map<string, SubagentView>([
        ['w1', fleetAgent('w1', 'running')],
        ['w2', fleetAgent('w2', 'completed')],
      ]),
    });
    renderTopbar();

    const counts = screen.getAllByTestId('inspector-trigger').map((el) => el.textContent ?? '');
    expect(counts.every((text) => text.includes('1'))).toBe(true);
  });

  it('opens the Agents side panel from the top bar while on another view', () => {
    renderTopbar('kanban');

    fireEvent.click(screen.getAllByTestId('inspector-trigger')[0]!);

    const ui = useUIStore.getState();
    expect(ui.sidebarOpen).toBe(true);
    expect(ui.activeActivity).toBe('agents');
    // The Agents panel pairs with the chat surface, so the view steers home.
    expect(ui.currentView).toBe('chat');
  });

  it('renders WrongProxy, HQ and WS indicators and triggers onSettings on click', () => {
    const onSettings = vi.fn();
    render(
      <WorkbenchTopbar
        currentView="chat"
        projectName="TestProject"
        sessionLabel="Session Alpha"
        isLoading={false}
        iteration={null}
        onPalette={vi.fn()}
        onSettings={onSettings}
      />,
    );

    const wrongProxyBtn = screen.getByTestId('wrongproxy-status-button');
    expect(wrongProxyBtn).toBeDefined();
    expect(wrongProxyBtn.getAttribute('title')).toContain('WrongProxy');

    const hqBtn = screen.getByTestId('hq-status-button');
    expect(hqBtn).toBeDefined();
    expect(hqBtn.getAttribute('title')).toContain('HQ');

    const wsIndicator = screen.getByTestId('ws-status-indicator');
    expect(wsIndicator).toBeDefined();

    fireEvent.click(wrongProxyBtn);
    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(useUIStore.getState().settingsActiveTab).toBe('integrations');

    useUIStore.getState().setSettingsActiveTab('general');
    fireEvent.click(hqBtn);
    expect(onSettings).toHaveBeenCalledTimes(2);
    expect(useUIStore.getState().settingsActiveTab).toBe('integrations');
  });

  it.each([
    [true, 'http://localhost:3499', true, 'text-success', 'Connected'],
    [true, 'http://localhost:3499', false, 'text-destructive', 'Unreachable'],
    [false, 'http://localhost:3499', true, 'text-muted-foreground/40', 'Disabled'],
    [true, '   ', true, 'text-muted-foreground/40', 'Disabled'],
  ])(
    'renders enabled=%s url=%s connected=%s correctly',
    async (enabled, url, connected, color, label) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ connected, latencyMs: 4 }),
      } as Response);
      useLocalPrefs.setState({
        hqEnabled: enabled,
        hqUrl: url,
        wrongProxyEnabled: enabled,
        wrongProxyUrl: url,
      });
      const { unmount } = renderTopbar();
      try {
        await waitFor(() => {
          for (const id of ['wrongproxy-status-button', 'hq-status-button']) {
            expect(screen.getByTestId(id).classList.contains(color)).toBe(true);
            expect(screen.getByTestId(id).getAttribute('title')).toContain(label);
          }
        });
      } finally {
        unmount();
        fetchSpy.mockRestore();
        useLocalPrefs.setState({ hqEnabled: false, wrongProxyEnabled: false });
      }
    },
  );
});

describe('WorkbenchTopbar calm chrome', () => {
  beforeEach(() => {
    useUIStore.setState({ sidebarOpen: false, activeActivity: 'chat', currentView: 'chat' });
    useFleetStore.setState({ agents: new Map() });
    useLocalPrefs.setState({ chromeLevel: 'calm', hqEnabled: false, wrongProxyEnabled: false });
    useConfigStore.setState({ wsConnected: true });
  });

  it('folds WrongProxy, HQ and WS into one health chip', () => {
    renderTopbar();

    expect(screen.queryByTestId('wrongproxy-status-button')).toBeNull();
    expect(screen.queryByTestId('hq-status-button')).toBeNull();
    expect(screen.queryByTestId('ws-status-indicator')).toBeNull();
    const chip = screen.getByTestId('system-health-chip');
    expect(chip.getAttribute('data-tone')).toBe('ok');
  });

  it('turns the health chip to a warning when the backend WS drops', () => {
    useConfigStore.setState({ wsConnected: false });
    renderTopbar();

    const chip = screen.getByTestId('system-health-chip');
    expect(chip.getAttribute('data-tone')).toBe('warning');
    expect(chip.textContent).toContain('1');
  });

  it('hides the idle "Ready" chip but shows the running status', () => {
    const { unmount } = renderTopbar();
    expect(screen.queryByTestId('topbar-run-status')).toBeNull();
    unmount();

    render(
      <WorkbenchTopbar
        currentView="chat"
        projectName="TestProject"
        sessionLabel="Session Alpha"
        isLoading
        iteration={{ index: 3, max: 10 }}
        onPalette={vi.fn()}
        onSettings={vi.fn()}
      />,
    );
    const status = screen.getByTestId('topbar-run-status');
    // The iteration count lives in the chat header under calm chrome.
    expect(status.textContent).not.toContain('3/10');
  });

  it('keeps the idle "Ready" chip and iteration under full chrome', () => {
    useLocalPrefs.setState({ chromeLevel: 'full' });
    render(
      <WorkbenchTopbar
        currentView="chat"
        projectName="TestProject"
        sessionLabel="Session Alpha"
        isLoading
        iteration={{ index: 3, max: 10 }}
        onPalette={vi.fn()}
        onSettings={vi.fn()}
      />,
    );
    expect(screen.getByTestId('topbar-run-status').textContent).toContain('3/10');
    expect(screen.queryByTestId('system-health-chip')).toBeNull();
  });
});

describe('Office shortcut and visible runtime version', () => {
  beforeEach(() => {
    useUIStore.setState({
      sidebarOpen: true,
      activeActivity: 'chat',
      currentView: 'chat',
      agentRosterActiveTab: 'catalog',
    });
    useLocalPrefs.setState({ chromeLevel: 'calm', hqEnabled: false, wrongProxyEnabled: false });
    useConfigStore.setState({ wsConnected: false });
    useSessionStore.setState({
      appVersion: '1.0.31',
      latestVersion: '1.0.31',
      updateAvailable: false,
    });
  });

  it.each(['calm', 'full'] as const)(
    'keeps the building shortcut and version in both headers in %s chrome',
    (chromeLevel) => {
      useLocalPrefs.setState({ chromeLevel });
      renderTopbar();
      const buttons = screen.getAllByTestId('topbar-office-map');
      expect(buttons).toHaveLength(2);
      const versions = screen.getAllByTestId('topbar-version');
      expect(versions).toHaveLength(2);
      expect(versions.every((badge) => badge.textContent === 'v1.0.31')).toBe(true);
      fireEvent.click(buttons[1]!);
      expect(useUIStore.getState()).toMatchObject({
        currentView: 'roster',
        agentRosterActiveTab: 'officemap',
        sidebarOpen: false,
      });
    },
  );

  it('opens Office Map from another roster tab and keeps it open on repeated clicks', () => {
    useUIStore.setState({ currentView: 'roster' });
    const view = renderTopbar('roster');
    fireEvent.click(screen.getAllByTestId('topbar-office-map')[0]!);
    expect(useUIStore.getState()).toMatchObject({
      currentView: 'roster',
      agentRosterActiveTab: 'officemap',
    });
    view.rerender(
      <WorkbenchTopbar
        currentView="roster"
        isLoading={false}
        iteration={null}
        onPalette={vi.fn()}
        onSettings={vi.fn()}
      />,
    );
    const buttons = screen.getAllByTestId('topbar-office-map');
    expect(buttons.every((button) => button.getAttribute('aria-pressed') === 'true')).toBe(true);
    fireEvent.click(buttons[1]!);
    expect(useUIStore.getState().currentView).toBe('roster');
  });

  it('retains the update hint and does not invent a version before the backend reports it', () => {
    useSessionStore.setState({
      appVersion: '2.3.4',
      latestVersion: '2.3.5',
      updateAvailable: true,
    });
    const view = renderTopbar();
    expect(
      screen
        .getAllByTestId('topbar-version')
        .every((badge) => badge.getAttribute('title')?.includes('v2.3.4 → v2.3.5')),
    ).toBe(true);
    view.unmount();
    useSessionStore.setState({ appVersion: '', latestVersion: '', updateAvailable: false });
    renderTopbar();
    expect(screen.queryByTestId('topbar-version')).toBeNull();
  });
});

describe('summarizeSystemHealth', () => {
  const disabled = { status: 'disabled' as const, latencyMs: null, url: '' };

  it('flags heap pressure, a sick index and dropped tools', () => {
    const rows = summarizeSystemHealth({
      wsConnected: true,
      server: {
        pid: 42,
        memoryUsage: { rss: 500 * 1024 ** 2, heapUsed: 90, heapTotal: 100 },
        heapLimit: 100,
        codebaseIndexServer: { status: 'unresponsive', connected: false },
      },
      droppedTools: 2,
      wrongProxy: disabled,
      hq: { status: 'error', latencyMs: null, url: 'http://hq', error: 'ECONNREFUSED' },
    });
    const tone = Object.fromEntries(rows.map((r) => [r.id, r.tone]));
    expect(tone).toEqual({
      ws: 'ok',
      server: 'destructive',
      index: 'destructive',
      tools: 'warning',
      wrongproxy: 'muted',
      hq: 'destructive',
    });
  });

  it('omits server rows until metrics arrive and dropped tools when there are none', () => {
    const rows = summarizeSystemHealth({
      wsConnected: false,
      server: null,
      droppedTools: 0,
      wrongProxy: disabled,
      hq: disabled,
    });
    expect(rows.map((r) => r.id)).toEqual(['ws', 'wrongproxy', 'hq']);
    expect(rows[0]!.tone).toBe('warning');
  });
});
