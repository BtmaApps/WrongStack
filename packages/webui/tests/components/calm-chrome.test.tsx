import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The pickers and chips in the header row talk to stores/WS on their own;
// these tests are about which header controls calm vs full chrome renders.
vi.mock('../../src/components/ModePicker', () => ({ ModePicker: () => null }));
vi.mock('../../src/components/ContextModePicker', () => ({ ContextModePicker: () => null }));
vi.mock('../../src/components/AutonomyPicker', () => ({ AutonomyPicker: () => null }));
vi.mock('../../src/components/CostChip', () => ({ CostChip: () => null }));
vi.mock('../../src/components/QuotaChip', () => ({ QuotaChip: () => null }));

import { ChatDisplayToggles } from '../../src/components/ChatView/ChatDisplayToggles';
import { ChatHeader } from '../../src/components/ChatView/ChatHeader';
import { useLocalPrefs } from '../../src/stores/local-prefs';
import { DEFAULTS } from '../../src/stores/local-prefs-defaults';

function renderHeader() {
  const noop = vi.fn();
  return render(
    <ChatHeader
      sidebarOpen
      toggleSidebar={noop}
      agentState="idle"
      stateTone=""
      sessionId="sess-a"
      renamingTitle={false}
      setRenamingTitle={noop}
      titleDraft=""
      setTitleDraft={noop}
      setSessionNickname={noop}
      historyEntries={[]}
      switcherRef={{ current: null }}
      switcherOpen={false}
      setSwitcherOpen={noop}
      handleHistorySelect={noop}
      iteration={null}
      autonomy="off"
      handleAutonomyChange={noop}
      memoryPanelOpen={false}
      setMemoryPanelOpen={noop}
      activeMemoryCount={0}
      processOpen={false}
      setProcessOpen={noop}
      checkpointOpen={false}
      setCheckpointOpen={noop}
      toolStatsOpen={false}
      setToolStatsOpen={noop}
      hasStatusContent
      lastInputTokens={0}
      ctxPct={0}
      maxContext={0}
      setBreakdownOpen={noop}
      contextLimitWarning={null}
      setEditorOpen={noop}
      totalTokens={{ input: 1200, output: 300, cacheRead: 0, cacheWrite: 0 }}
      startTime={null}
      formatDuration={() => ''}
    />,
  );
}

function renderToggles() {
  return render(
    <ChatDisplayToggles
      hasStatusContent
      totalTokens={{ input: 1200, output: 300 }}
      rowsCount={4}
      iteration={{ index: 2, max: 0 }}
      startTime={null}
      formatDuration={() => ''}
      onToggleAutoCollapse={vi.fn()}
    />,
  );
}

describe('chrome level', () => {
  afterEach(() => {
    cleanup();
    useLocalPrefs.setState({ chromeLevel: 'calm' });
  });

  it('defaults to calm chrome', () => {
    expect(DEFAULTS.chromeLevel).toBe('calm');
  });

  describe('ChatHeader', () => {
    beforeEach(() => useLocalPrefs.setState({ chromeLevel: 'calm' }));

    it('calm: tool stats, processes and checkpoints sit behind one menu', () => {
      renderHeader();
      expect(screen.getByTestId('chat-header-session-tools')).toBeTruthy();
      expect(screen.queryByTitle('Tool call stats')).toBeNull();
      expect(screen.queryByTitle('Running processes')).toBeNull();
      // Memory keeps its own button — it carries the injected-memory badge.
      expect(screen.getByTitle(/^Memory context/)).toBeTruthy();
    });

    it('full: the three header buttons are back and the menu is gone', () => {
      useLocalPrefs.setState({ chromeLevel: 'full' });
      renderHeader();
      expect(screen.queryByTestId('chat-header-session-tools')).toBeNull();
      expect(screen.getByTitle('Tool call stats')).toBeTruthy();
      expect(screen.getByTitle('Running processes')).toBeTruthy();
      expect(screen.getByTitle(/^Session checkpoints/)).toBeTruthy();
    });
  });

  describe('ChatDisplayToggles', () => {
    it('calm: keeps the switches, drops the duplicated counters', () => {
      useLocalPrefs.setState({ chromeLevel: 'calm' });
      renderToggles();
      expect(screen.queryByTitle(/tokens in$/)).toBeNull();
      expect(screen.queryByText('msgs')).toBeNull();
    });

    it('full: shows the counters as before', () => {
      useLocalPrefs.setState({ chromeLevel: 'full' });
      renderToggles();
      expect(screen.getByTitle(/tokens in$/)).toBeTruthy();
      expect(screen.getByText('msgs')).toBeTruthy();
    });
  });
});
