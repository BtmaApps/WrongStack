import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SddHub } from '../../src/components/SddHub';

vi.mock('@/i18n', () => ({
  useAppTranslation: () => ({
    t: (key: string) =>
      ({
        'activity:sddhub.tabRequirements': 'Requirements',
        'activity:sddhub.tabProject': 'Project',
        'activity:sddhub.tabBoard': 'Board',
        'activity:sddhub.tabSpecs': 'Specs',
      })[key] ?? key,
  }),
}));

vi.mock('../../src/components/RequirementIntakeView', () => ({
  RequirementIntakeView: () => <div>Requirements content</div>,
}));

vi.mock('../../src/components/SddWizard', () => ({
  SddWizard: ({ onRunStarted }: { onRunStarted?: () => void }) => (
    <div>
      Project content
      <button type="button" onClick={onRunStarted}>
        Simulate run started
      </button>
    </div>
  ),
}));

vi.mock('../../src/components/SddBoardView', () => ({
  SddBoardView: () => <div>Board content</div>,
}));

vi.mock('../../src/components/SpecsView', () => ({
  SpecsView: () => <div>Specs content</div>,
}));

afterEach(cleanup);

describe('SddHub navigation', () => {
  it('selects the Board tab after the wizard starts a run without unmounting panels', () => {
    render(<SddHub />);

    const projectTab = screen.getByRole('tab', { name: 'Project' });
    const boardTab = screen.getByRole('tab', { name: 'Board' });
    expect(projectTab.getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Simulate run started' }));

    expect(boardTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Requirements content')).toBeTruthy();
    expect(screen.getByText('Project content')).toBeTruthy();
    expect(screen.getByText('Board content')).toBeTruthy();
    expect(screen.getByText('Specs content')).toBeTruthy();
    expect(document.getElementById('sdd-hub-panel-requirements')?.hidden).toBe(true);
    expect(document.getElementById('sdd-hub-panel-project')?.hidden).toBe(true);
    expect(document.getElementById('sdd-hub-panel-board')?.hidden).toBe(false);
  });

  it('supports roving focus with Arrow, Home, and End keys', () => {
    render(<SddHub />);

    const requirementsTab = screen.getByRole('tab', { name: 'Requirements' });
    const projectTab = screen.getByRole('tab', { name: 'Project' });
    const boardTab = screen.getByRole('tab', { name: 'Board' });
    const specsTab = screen.getByRole('tab', { name: 'Specs' });

    fireEvent.keyDown(requirementsTab, { key: 'ArrowRight' });
    expect(projectTab.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(projectTab);

    fireEvent.keyDown(projectTab, { key: 'ArrowRight' });
    expect(boardTab.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(boardTab);

    fireEvent.keyDown(boardTab, { key: 'End' });
    expect(specsTab.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(specsTab);

    fireEvent.keyDown(specsTab, { key: 'Home' });
    expect(requirementsTab.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(requirementsTab);
  });
});
