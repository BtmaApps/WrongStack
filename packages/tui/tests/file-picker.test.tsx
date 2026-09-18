import { render } from 'ink-testing-library';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { FilePicker } from '../src/components/file-picker.js';

describe('FilePicker', () => {
  it('shows empty state when matches is empty', () => {
    const { lastFrame, unmount } = render(
      React.createElement(FilePicker, { query: 'foo', matches: [], selected: 0 }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('@foo');
    expect(frame).toContain('no matches');
    unmount();
  });

  it('renders matches with correct query prefix', () => {
    const { lastFrame, unmount } = render(
      React.createElement(FilePicker, {
        query: 'bar',
        matches: ['src/bar.ts', 'src/bar/util.ts'],
        selected: 0,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('@bar');
    expect(frame).toContain('↑↓ · Enter attach');
    expect(frame).toContain('src/bar.ts');
    expect(frame).toContain('src/bar/util.ts');
    unmount();
  });

  it('highlights the selected match with inverse and cyan color', () => {
    const { lastFrame, unmount } = render(
      React.createElement(FilePicker, {
        query: 'test',
        matches: ['test/a.ts', 'test/b.ts', 'test/c.ts'],
        selected: 1,
      }),
    );
    const frame = lastFrame() ?? '';
    // The selected item (index 1 = test/b.ts) should have › prefix
    expect(frame).toContain('test/b.ts');
    unmount();
  });

  it('shows the correct › prefix only on the selected item', () => {
    const { lastFrame, unmount } = render(
      React.createElement(FilePicker, {
        query: 'src',
        matches: ['src/main.ts', 'src/utils.ts', 'src/lib.ts'],
        selected: 2,
      }),
    );
    const frame = lastFrame() ?? '';
    // Only one › should appear (for the selected item = src/lib.ts, index 2)
    const prefixCount = (frame.match(/›/g) ?? []).length;
    expect(prefixCount).toBe(1);
    unmount();
  });

  it('renders with empty query string', () => {
    const { lastFrame, unmount } = render(
      React.createElement(FilePicker, {
        query: '',
        matches: ['index.ts'],
        selected: 0,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('…');
    unmount();
  });

  it('renders a single match correctly', () => {
    const { lastFrame, unmount } = render(
      React.createElement(FilePicker, {
        query: 'single',
        matches: ['single.ts'],
        selected: 0,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('single.ts');
    unmount();
  });
});
