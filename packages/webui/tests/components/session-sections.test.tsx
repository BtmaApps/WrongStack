import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type SessionSection,
  SessionSections,
} from '../../src/components/SidePanel/SessionSections';
import { i18n } from '../../src/i18n';
import {
  normalizeSessionPanelOrder,
  useSessionPanelLayout,
} from '../../src/stores/session-panel-layout';

const sections: SessionSection[] = [
  {
    id: 'actions',
    label: 'Actions',
    icon: null,
    content: <button type="button">New session</button>,
  },
  { id: 'workspace', label: 'Workspace', icon: null, content: 'Live workspace' },
  { id: 'stats', label: 'Stats', icon: null, content: 'Live stats' },
  { id: 'plan', label: 'Plan', icon: null, content: 'Live plan', visible: false },
];
const order = () =>
  [...document.querySelectorAll('[data-session-section]')].map((node) =>
    node.getAttribute('data-session-section'),
  );

beforeEach(async () => {
  await i18n.changeLanguage('en');
  useSessionPanelLayout.setState({ order: [], collapsed: {} });
});
afterEach(cleanup);

describe('session sidebar sections', () => {
  it('hides folded content without unmounting its live subscriptions and saves the choice', async () => {
    const unmount = vi.fn();
    function Live() {
      useEffect(() => unmount, []);
      return <button type="button">Live action</button>;
    }
    const view = render(<SessionSections sections={[{ ...sections[1]!, content: <Live /> }]} />);
    const toggle = screen.getByRole('button', { name: 'Workspace', exact: true });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Live action' })).toBeNull();
    expect(unmount).not.toHaveBeenCalled();
    const saved = localStorage.getItem('wrongstack-session-panel-layout')!;
    view.unmount();
    expect(unmount).toHaveBeenCalledOnce();
    // Rehydrate the saved browser layout, as on F5.
    useSessionPanelLayout.setState({ collapsed: {} });
    localStorage.setItem('wrongstack-session-panel-layout', saved);
    await useSessionPanelLayout.persist.rehydrate();
    render(<SessionSections sections={[{ ...sections[1]!, content: <Live /> }]} />);
    expect(screen.queryByRole('button', { name: 'Live action' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Workspace', exact: true }));
    expect(screen.getByRole('button', { name: 'Live action' })).toBeTruthy();
  });

  it('supports dragging both directions and does not reorder on a cancelled drag', () => {
    render(<SessionSections sections={sections} />);
    const transfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
    fireEvent.dragStart(screen.getByRole('button', { name: 'Drag Actions' }), {
      dataTransfer: transfer,
    });
    fireEvent.dragOver(document.querySelector('[data-session-section="stats"]')!, {
      dataTransfer: transfer,
    });
    fireEvent.drop(document.querySelector('[data-session-section="stats"]')!, {
      dataTransfer: transfer,
    });
    expect(order()).toEqual(['workspace', 'stats', 'actions']);
    fireEvent.dragStart(screen.getByRole('button', { name: 'Drag Actions' }), {
      dataTransfer: transfer,
    });
    fireEvent.drop(document.querySelector('[data-session-section="workspace"]')!, {
      dataTransfer: transfer,
    });
    expect(order()).toEqual(['actions', 'workspace', 'stats']);
    fireEvent.dragStart(screen.getByRole('button', { name: 'Drag Actions' }), {
      dataTransfer: transfer,
    });
    fireEvent.dragEnd(screen.getByRole('button', { name: 'Drag Actions' }));
    fireEvent.drop(document.querySelector('[data-session-section="stats"]')!, {
      dataTransfer: transfer,
    });
    expect(order()).toEqual(['actions', 'workspace', 'stats']);
  });

  it('supports keyboard/touch controls, preserves absent sections, and retains layout on remount', () => {
    const view = render(<SessionSections sections={sections} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Drag Stats' }), { key: 'ArrowUp' });
    expect(order()).toEqual(['actions', 'stats', 'workspace']);
    fireEvent.click(screen.getByRole('button', { name: 'Move Workspace up' }));
    expect(order()).toEqual(['actions', 'workspace', 'stats']);
    fireEvent.click(screen.getByRole('button', { name: 'Move Actions down' }));
    expect(order()).toEqual(['workspace', 'actions', 'stats']);
    view.rerender(
      <SessionSections sections={sections.map((section) => ({ ...section, visible: true }))} />,
    );
    expect(order()).toEqual(['workspace', 'actions', 'stats', 'plan']);
    view.unmount();
    render(<SessionSections sections={sections} />);
    expect(order()).toEqual(['workspace', 'actions', 'stats']);
    expect(screen.getByRole('button', { name: 'Move Workspace up' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('sanitizes old or malformed persisted layouts and appends missing sections', async () => {
    expect(normalizeSessionPanelOrder(['story', 'quota', 'quota', null, 'stats'])).toEqual([
      'quota',
      'stats',
    ]);
    localStorage.setItem(
      'wrongstack-session-panel-layout',
      JSON.stringify({
        state: { order: ['stats', 'stats', 'story'], collapsed: { stats: true, actions: 'yes' } },
        version: 0,
      }),
    );
    await act(async () => useSessionPanelLayout.persist.rehydrate());
    render(<SessionSections sections={sections} />);
    expect(order()).toEqual(['stats', 'actions', 'workspace']);
    expect(
      screen.getByRole('button', { name: 'Stats', exact: true }).getAttribute('aria-expanded'),
    ).toBe('false');
    expect(
      screen.getByRole('button', { name: 'Actions', exact: true }).getAttribute('aria-expanded'),
    ).toBe('true');
  });
});
