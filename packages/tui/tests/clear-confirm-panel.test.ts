import { render } from 'ink-testing-library';
import React from 'react';
import { describe, expect, it } from 'vitest';
import {
  ClearConfirmPanel,
  clearConfirmationKeyResult,
  isClearConfirmation,
} from '../src/components/clear-confirm-panel.js';

describe('clear confirmation token', () => {
  it('accepts only the exact uppercase YES token', () => {
    expect(isClearConfirmation('YES')).toBe(true);
    expect(isClearConfirmation('yes')).toBe(false);
    expect(isClearConfirmation('Y')).toBe(false);
    expect(isClearConfirmation('YES ')).toBe(false);
    expect(isClearConfirmation('')).toBe(false);
  });

  it('renders active leader/sub-agent details and explicit YES instructions', () => {
    const view = render(
      React.createElement(ClearConfirmPanel, {
        leaderActive: true,
        subagentCount: 2,
        value: 'YE',
      }),
    );

    expect(view.lastFrame() ?? '').toContain('CLEAR BLOCKED — ACTIVE WORK');
    expect(view.lastFrame() ?? '').toContain('leader run + 2 sub-agents');
    expect(view.lastFrame() ?? '').toContain('Type YES');

    expect(view.lastFrame() ?? '').toContain('Confirmation: YE');

    view.unmount();
  });

  it('keeps an invalid Enter pending and preserves the visible input', () => {
    let result = clearConfirmationKeyResult('', 'yes', {});
    expect(result).toEqual({ decision: null, value: 'yes' });

    result = clearConfirmationKeyResult(result.value, '', { return: true });
    expect(result).toEqual({ decision: null, value: 'yes' });
  });

  it('supports correction and confirms only after the exact YES token', () => {
    let result = clearConfirmationKeyResult('YEX', '', { backspace: true });
    expect(result.value).toBe('YE');

    result = clearConfirmationKeyResult(result.value, 'S', {});
    expect(result.value).toBe('YES');

    result = clearConfirmationKeyResult(result.value, '', { return: true });
    expect(result).toEqual({ decision: true, value: 'YES' });
  });

  it('cancels on Esc without changing the typed input', () => {
    expect(clearConfirmationKeyResult('YE', '', { escape: true })).toEqual({
      decision: false,
      value: 'YE',
    });
  });

  it('ignores a leaked SGR mouse report instead of typing it into the token', () => {
    // With mouse tracking on, Ink hands the ESC-stripped report to useInput as
    // TEXT, and the App input router forwards that text here. Appending it
    // pushed the token past the exact `YES` match, so a stray click made the
    // confirmation unfinishable. Both the stripped and the raw form are listed
    // because only the caller knows which one its channel produced.
    for (const leak of ['[<0;12;4M', '\x1b[<0;12;4M', '[<65;20;6M']) {
      expect(clearConfirmationKeyResult('', leak, {})).toEqual({ decision: null, value: '' });
    }

    // The panel keeps working with real keys afterwards.
    expect(clearConfirmationKeyResult('', 'Y', {}).value).toBe('Y');
  });

  it('renders no leaked mouse text into the mounted confirmation', () => {
    let value = '';
    for (const leak of ['[<0;12;4M', '[<65;20;6M']) {
      value = clearConfirmationKeyResult(value, leak, {}).value;
    }
    value = clearConfirmationKeyResult(value, 'YES', {}).value;

    const view = render(
      React.createElement(ClearConfirmPanel, {
        leaderActive: false,
        subagentCount: 1,
        value,
      }),
    );
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('Confirmation: YES');
    expect(frame).not.toContain('[<0');
    view.unmount();
  });
});
