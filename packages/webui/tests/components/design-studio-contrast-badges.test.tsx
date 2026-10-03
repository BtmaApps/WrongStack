/**
 * ContrastBadges wiring — the WCAG AA gate result (kitContrastIssues, run
 * server-side on the override-applied tokens) must be VISIBLE wherever it can
 * arrive: design.use and design.materialize replies, in BOTH the gallery view
 * and the Design Studio side panel. Chips show theme + pair + ratio; a clean
 * reply (empty contrastIssues) clears the warning.
 *
 * The WS client is mocked (see design-gallery-view.test.tsx): send is
 * captured, registered on(type, …) handlers are invoked manually.
 */

import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sends: { type: string; payload?: unknown }[] = [];
const handlers: Record<string, (m: unknown) => void> = {};
const mockClient = {
  send: (m: { type: string; payload?: unknown }) => {
    sends.push(m);
  },
  withSession: <T extends Record<string, unknown>>(p: T) => ({ ...p, sessionId: 'tab-1' }),
  on: (type: string, h: (m: unknown) => void) => {
    handlers[type] = h;
  },
  off: (type: string) => {
    delete handlers[type];
  },
};

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: () => ({ client: mockClient }),
}));

import { DesignGalleryView } from '../../src/components/DesignGalleryView.js';
import { DesignStudioPanel } from '../../src/components/SidePanel/DesignStudioPanel.js';
import {
  ensureSessionLane,
  SESSION_DEFAULT_LANE_ID,
  setActiveSessionLane,
  useSessionLanes,
} from '../../src/stores/session-lanes';

function emit(type: string, payload: unknown): void {
  act(() => handlers[type]?.({ type, payload }));
}

const KIT = {
  id: 'kit-one',
  name: 'Kit One',
  aesthetic: 'Test aesthetic',
  bestFor: 'Testing',
  stacks: ['web'],
  tags: ['test'],
  light: { bg: '#ffffff', fg: '#111111', primary: '#2244ff' },
  dark: { bg: '#000000', fg: '#eeeeee', primary: '#88aaff' },
};

const ISSUES = [
  { theme: 'light', pair: 'primary/bg', ratio: 1.18 },
  { theme: 'dark', pair: 'fg/bg', ratio: 3.2 },
];

beforeEach(() => {
  sends.length = 0;
  for (const key of Object.keys(handlers)) delete handlers[key];
  useSessionLanes.setState({ lanes: {}, activeSessionId: SESSION_DEFAULT_LANE_ID });
  ensureSessionLane('tab-1');
  setActiveSessionLane('tab-1');
});

describe('contrast gate badges — DesignGalleryView', () => {
  it('shows theme/pair/ratio chips from a design.use reply', () => {
    render(<DesignGalleryView />);
    emit('design.list', { kits: [KIT], activeKit: null, overrides: {}, sessionId: 'tab-1' });
    emit('design.use', {
      ok: true,
      kit: 'kit-one',
      overrides: {},
      contrastIssues: ISSUES,
      sessionId: 'tab-1',
    });

    expect(screen.getByText(/AA contrast below/)).toBeTruthy();
    expect(screen.getByText('light primary/bg 1.18:1')).toBeTruthy();
    expect(screen.getByText('dark fg/bg 3.20:1')).toBeTruthy();
  });

  it('updates from a design.materialize reply and clears when it comes back clean', () => {
    render(<DesignGalleryView />);
    emit('design.list', { kits: [KIT], activeKit: 'kit-one', overrides: {}, sessionId: 'tab-1' });
    emit('design.use', {
      ok: true,
      kit: 'kit-one',
      overrides: {},
      contrastIssues: ISSUES,
      sessionId: 'tab-1',
    });
    expect(screen.getByText('light primary/bg 1.18:1')).toBeTruthy();

    // Materialize re-runs the gate on the persisted overrides — clean now.
    emit('design.materialize', {
      ok: true,
      path: 'src/styles/design-tokens.css',
      contrastIssues: [],
      sessionId: 'tab-1',
    });
    expect(screen.queryByText(/AA contrast below/)).toBeNull();
    expect(screen.queryByText('light primary/bg 1.18:1')).toBeNull();
  });
});

describe('contrast gate badges — DesignStudioPanel', () => {
  it('shows the warning on the active kit and clears on a clean use', () => {
    render(<DesignStudioPanel />);
    emit('design.list', { kits: [KIT], activeKit: 'kit-one', sessionId: 'tab-1' });
    emit('design.use', { ok: true, kit: 'kit-one', contrastIssues: ISSUES, sessionId: 'tab-1' });

    expect(screen.getByText(/AA contrast below/)).toBeTruthy();
    expect(screen.getByText('light primary/bg 1.18:1')).toBeTruthy();

    emit('design.use', { ok: true, kit: 'kit-one', contrastIssues: [], sessionId: 'tab-1' });
    expect(screen.queryByText('light primary/bg 1.18:1')).toBeNull();
  });

  it('renders no warning before any kit is used', () => {
    render(<DesignStudioPanel />);
    emit('design.list', { kits: [KIT], activeKit: 'kit-one', sessionId: 'tab-1' });
    expect(screen.queryByText(/AA contrast below/)).toBeNull();
  });
});
