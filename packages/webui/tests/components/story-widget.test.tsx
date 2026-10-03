import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StoryWidget } from '../../src/components/SidePanel/StoryWidget';
import { i18n } from '../../src/i18n';
import { chatLane, useChatLanes } from '../../src/stores/chat-lanes';
import { useFleetStore } from '../../src/stores/fleet-store';
import { setActiveSessionLane, useSessionLanes } from '../../src/stores/session-lanes';
import type { SubagentView } from '../../src/stores/types';
import { useUIStore } from '../../src/stores/ui-store';

const worker = (id: string, sessionId?: string): SubagentView => ({
  id,
  sessionId,
  name: id,
  status: 'running',
  iteration: 1,
  toolCalls: 5,
  costUsd: 0,
  ctxPct: 0,
  ctxTokens: 0,
  maxContext: 1000,
  extensions: 0,
  startedAt: Date.now(),
  toolLog: [],
  sparklineBins: [],
});
beforeEach(async () => {
  await i18n.changeLanguage('en');
  useSessionLanes.setState({ lanes: {}, activeSessionId: '__unbound__' });
  useChatLanes.setState({ lanes: {}, activeSessionId: '__unbound__' });
  useFleetStore.setState({ agents: new Map() });
  useUIStore.setState({ currentView: 'chat', sidebarOpen: true, activeActivity: 'files' });
});
afterEach(cleanup);
describe('Story sidebar snapshot', () => {
  it('can return from Story when the active session has gone away', () => {
    useUIStore.setState({ currentView: 'session-story' });
    render(<StoryWidget />);
    const back = screen.getByRole('button', { name: 'Back to session' });
    expect(back.hasAttribute('disabled')).toBe(false);
    fireEvent.click(back);
    expect(useUIStore.getState().currentView).toBe('chat');
  });
  it('follows the selected tab and excludes other-tab and untagged workers', () => {
    setActiveSessionLane('a');
    chatLane('a').addExecution({
      id: 't1',
      name: 'read',
      ok: true,
      startedAt: Date.now(),
    });
    chatLane('a').addExecution({
      id: 't2',
      name: 'edit',
      ok: true,
      startedAt: Date.now(),
    });
    chatLane('b').addExecution({
      id: 't3',
      name: 'read',
      ok: true,
      startedAt: Date.now(),
    });
    useFleetStore.setState({
      agents: new Map([
        ['own', worker('own', 'a')],
        ['other', worker('other', 'c')],
        ['untagged', worker('untagged')],
      ]),
    });
    render(<StoryWidget />);
    expect(screen.getByText('2 calls')).toBeTruthy();
    expect(screen.getByText('1 workers')).toBeTruthy();
    expect(screen.getByText('Working')).toBeTruthy();
    act(() => setActiveSessionLane('b'));
    expect(screen.getByText('1 calls')).toBeTruthy();
    expect(screen.getByText('0 workers')).toBeTruthy();
    expect(screen.queryByText('Working')).toBeNull();
    act(() => setActiveSessionLane(null));
    expect(
      screen.getByRole('button', { name: 'Open session Story' }).hasAttribute('disabled'),
    ).toBe(true);
  });
  it('opens Story while keeping the desktop menu, and closes the mobile overlay', () => {
    setActiveSessionLane('a');
    const view = render(<StoryWidget />);
    fireEvent.click(screen.getByRole('button', { name: 'Open session Story' }));
    expect(useUIStore.getState()).toMatchObject({
      currentView: 'session-story',
      sidebarOpen: true,
      activeActivity: 'files',
    });
    expect(screen.getByRole('button', { name: 'Back to session' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to session' }));
    expect(useUIStore.getState()).toMatchObject({
      currentView: 'chat',
      sidebarOpen: true,
      activeActivity: 'chat',
    });
    view.rerender(<StoryWidget collapseOnOpen />);
    fireEvent.click(screen.getByRole('button', { name: 'Open session Story' }));
    expect(useUIStore.getState().sidebarOpen).toBe(false);
    act(() => useUIStore.getState().setSidebarOpen(true));
    fireEvent.click(screen.getByRole('button', { name: 'Back to session' }));
    expect(useUIStore.getState()).toMatchObject({ currentView: 'chat', sidebarOpen: false });
  });
});
