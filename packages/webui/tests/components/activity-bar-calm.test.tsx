import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActivityBar } from '../../src/components/activity-bar';
import { useUIStore } from '../../src/stores';
import { useLocalPrefs } from '../../src/stores/local-prefs';
import { VIEWS } from '../../src/stores/ui-store-types';

// Views that are not standalone tools: side-panel pairs (reached from the
// panel icons), first-run setup, and drill-downs opened from another view.
const NOT_IN_LAUNCHER = new Set([
  'chat',
  'files',
  'changes',
  'mailbox',
  'skill',
  'design-gallery',
  'setup',
  'session-inspect',
  'refresh-debug',
]);

/** Mirrors the (module-private) calm bar size in activity-bar/index.tsx. */
const CALM_BAR_VIEW_COUNT = 4;

function openLauncher() {
  const trigger = screen.getByTestId('activity-bar-tools-launcher');
  act(() => {
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  });
}

describe('ToolsLauncher map', () => {
  afterEach(() => cleanup());

  it('lists every standalone view exactly once', () => {
    useLocalPrefs.setState({ chromeLevel: 'calm' });
    render(<ActivityBar />);
    openLauncher();
    const listed = screen
      .getAllByTestId(/^launcher-item-/)
      .map((el) => el.getAttribute('data-testid')!.replace('launcher-item-', ''));
    expect(new Set(listed).size).toBe(listed.length);
    const expected = VIEWS.filter((v) => !NOT_IN_LAUNCHER.has(v));
    expect([...listed].sort()).toEqual([...expected].sort());
  });
});

describe('ActivityBar under calm chrome', () => {
  beforeEach(() => {
    act(() => {
      useUIStore.setState({
        activityBarOrder: null,
        activeActivity: 'chat',
        currentView: 'chat',
        sidebarOpen: true,
      });
    });
  });

  afterEach(() => {
    cleanup();
    useLocalPrefs.setState({ chromeLevel: 'calm' });
  });

  const viewIcons = (container: HTMLElement) =>
    // Main-view icons are the reorderable (non-anchor) buttons after the
    // divider; panels carry data-locked too, so filter by label instead.
    ['Agent Roster', 'Goal', 'Kanban', 'Memory', 'SDD', 'Project Kit', 'CodeMap'].filter(
      (label) => container.querySelector(`button[aria-label="${label}"]`) !== null,
    );

  it(`keeps the first ${CALM_BAR_VIEW_COUNT} views on the bar and adds the launcher`, () => {
    useLocalPrefs.setState({ chromeLevel: 'calm' });
    const { container } = render(<ActivityBar />);
    expect(viewIcons(container)).toEqual(['Agent Roster', 'Goal', 'Kanban', 'Memory']);
    expect(screen.getByTestId('activity-bar-tools-launcher')).toBeTruthy();
  });

  it('shows every view again (and no launcher) while reordering', () => {
    useLocalPrefs.setState({ chromeLevel: 'calm' });
    const { container } = render(<ActivityBar />);
    act(() => {
      screen.getByTestId('activity-bar-reorder-edit').click();
    });
    expect(screen.queryByTestId('activity-bar-tools-launcher')).toBeNull();
    expect(viewIcons(container).length).toBeGreaterThan(CALM_BAR_VIEW_COUNT);
  });

  it('full chrome renders no launcher', () => {
    useLocalPrefs.setState({ chromeLevel: 'full' });
    const { container } = render(<ActivityBar />);
    expect(screen.queryByTestId('activity-bar-tools-launcher')).toBeNull();
    expect(viewIcons(container).length).toBeGreaterThan(CALM_BAR_VIEW_COUNT);
  });
});
