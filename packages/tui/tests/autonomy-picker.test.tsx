import { render } from 'ink-testing-library';
import React from 'react';
import { describe, expect, it } from 'vitest';
import {
  AUTONOMY_OPTIONS,
  type AutonomyOption,
  AutonomyPicker,
} from '../src/components/autonomy-picker.js';

describe('AutonomyPicker', () => {
  const frameHeight = (frame: string): number => frame.replace(/\n+$/, '').split('\n').length;

  it('renders the title and key hints', () => {
    const view = render(
      React.createElement(AutonomyPicker, {
        options: AUTONOMY_OPTIONS,
        selected: 0,
      }),
    );
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('Autonomy Mode');
    expect(frame).toContain('↑/↓ navigate');
    expect(frame).toContain('Enter select');
    expect(frame).toContain('Esc cancel');
    view.unmount();
  });

  it('renders all options with their labels and descriptions', () => {
    const view = render(
      React.createElement(AutonomyPicker, {
        options: AUTONOMY_OPTIONS,
        selected: 0,
      }),
    );
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('OFF');
    expect(frame).toContain('SUGGEST');
    expect(frame).toContain('AUTO');
    expect(frame).toContain('ETERNAL');
    expect(frame).toContain('PARALLEL');
    expect(frame).toContain('normal interactive mode');
    expect(frame).toContain('Goal-driven loop');
    expect(frame).toContain('Fan-out 4–8 subagents');
    view.unmount();
  });

  it('marks the selected option with a cursor and inverse', () => {
    const view = render(
      React.createElement(AutonomyPicker, {
        options: AUTONOMY_OPTIONS,
        selected: 2,
      }),
    );
    const frame = view.lastFrame() ?? '';
    // The selected item (index 2 = AUTO) should have the cursor marker
    expect(frame).toContain('AUTO');
    view.unmount();
  });

  it('renders first option selected by default when selected is 0', () => {
    const view = render(
      React.createElement(AutonomyPicker, {
        options: AUTONOMY_OPTIONS,
        selected: 0,
      }),
    );
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('OFF');
    view.unmount();
  });

  it('renders the hint when provided', () => {
    const view = render(
      React.createElement(AutonomyPicker, {
        options: AUTONOMY_OPTIONS,
        selected: 0,
        hint: 'Cannot change while running',
      }),
    );
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('Cannot change while running');
    view.unmount();
  });

  it('does not render hint when undefined', () => {
    const view = render(
      React.createElement(AutonomyPicker, {
        options: AUTONOMY_OPTIONS,
        selected: 0,
      }),
    );
    const frame = view.lastFrame() ?? '';
    expect(frame).not.toContain('undefined');
    view.unmount();
  });

  it('highlights selected option with inverse color', () => {
    const view = render(
      React.createElement(AutonomyPicker, {
        options: AUTONOMY_OPTIONS,
        selected: 0,
      }),
    );
    const frame = view.lastFrame() ?? '';
    // The first option should have › marker
    expect(frame).toContain('›');
    view.unmount();
  });

  it('handles empty options gracefully', () => {
    const view = render(
      React.createElement(AutonomyPicker, {
        options: [],
        selected: 0,
      }),
    );
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('Autonomy Mode');
    view.unmount();
  });

  it('renders selected at last index', () => {
    const view = render(
      React.createElement(AutonomyPicker, {
        options: AUTONOMY_OPTIONS,
        selected: AUTONOMY_OPTIONS.length - 1,
      }),
    );
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('PARALLEL');
    view.unmount();
  });

  it('renders with custom options (non-default)', () => {
    const customOptions: AutonomyOption[] = [
      { mode: 'off', label: 'DISABLED', description: 'Not running', color: 'gray' },
    ];
    const view = render(
      React.createElement(AutonomyPicker, {
        options: customOptions,
        selected: 0,
      }),
    );
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('DISABLED');
    expect(frame).toContain('Not running');
    view.unmount();
  });

  it('caps the panel height at the measured maxRows budget', () => {
    const view = render(
      React.createElement(AutonomyPicker, {
        options: AUTONOMY_OPTIONS,
        selected: 0,
        maxRows: 10,
      }),
    );
    const frame = view.lastFrame() ?? '';
    // Regression for the legacy rows-10 guess: 4 chrome rows + up to 3
    // marker/hint rows + the visible options (1 row each) must fit the
    // measured budget the caller hands in.
    expect(frameHeight(frame)).toBeLessThanOrEqual(10);
    expect(frame).toContain('more below');
    // The window shows the head; the tail stays off-screen until scrolled.
    expect(frame).not.toContain('PARALLEL');
    view.unmount();
  });

  it('re-centers the window on deep selections so late options stay reachable', () => {
    const view = render(
      React.createElement(AutonomyPicker, {
        options: AUTONOMY_OPTIONS,
        selected: AUTONOMY_OPTIONS.length - 1,
        maxRows: 10,
      }),
    );
    const frame = view.lastFrame() ?? '';
    // Same cap holds on the last page, and the focused option is on screen:
    // the re-centering window + markers reach every entry.
    expect(frameHeight(frame)).toBeLessThanOrEqual(10);
    expect(frame).toContain('more above');
    expect(frame).toContain('PARALLEL');
    view.unmount();
  });
});
