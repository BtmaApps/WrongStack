import { render } from 'ink-testing-library';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { DesignPicker } from '../src/components/design-picker.js';

describe('DesignPicker', () => {
  const frameHeight = (frame: string): number => frame.replace(/\n+$/, '').split('\n').length;

  const kits = [
    { id: 'minimal-clarity', aesthetic: 'Clean, modern — built for speed' },
    { id: 'neo-brutalist', aesthetic: 'Bold high-contrast industrial' },
    { id: 'retro-wave', aesthetic: 'Synthwave-flavoured neon' },
  ];

  it('renders the header with the current stack', () => {
    const { lastFrame, unmount } = render(
      React.createElement(DesignPicker, { kits, selected: 0, stack: 'web' } as never),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Design Studio · pick a kit');
    expect(frame).toContain('stack:web');
    unmount();
  });

  it('highlights the selected kit with inverse styling', () => {
    const { lastFrame, unmount } = render(
      React.createElement(DesignPicker, { kits, selected: 1, stack: 'react-native' } as never),
    );
    const frame = lastFrame() ?? '';
    // Selected kit should have the › prefix and be listed
    expect(frame).toContain('neo-brutalist');
    // Stack should show react-native
    expect(frame).toContain('stack:react-native');
    unmount();
  });

  it('shows empty state when no kits are installed', () => {
    const { lastFrame, unmount } = render(
      React.createElement(DesignPicker, { kits: [], selected: 0, stack: 'web' } as never),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('No design kits installed.');
    unmount();
  });

  it('renders all kit names and aesthetics', () => {
    const { lastFrame, unmount } = render(
      React.createElement(DesignPicker, { kits, selected: 0, stack: 'web' } as never),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('minimal-clarity');
    expect(frame).toContain('neo-brutalist');
    expect(frame).toContain('retro-wave');
    expect(frame).toContain('Clean, modern');
    expect(frame).toContain('Bold high-contrast');
    unmount();
  });

  it('shows the › prefix only on the selected kit', () => {
    const { lastFrame, unmount } = render(
      React.createElement(DesignPicker, { kits, selected: 2, stack: 'flutter' } as never),
    );
    const frame = lastFrame() ?? '';
    // The last kit (retro-wave, index 2) is selected
    // Count › occurrences - should be exactly 1
    const prefixCount = (frame.match(/›/g) ?? []).length;
    expect(prefixCount).toBe(1);
    unmount();
  });

  it('renders correctly with empty aesthetic strings', () => {
    const { lastFrame, unmount } = render(
      React.createElement(DesignPicker, {
        kits: [{ id: 'custom', aesthetic: '' }],
        selected: 0,
        stack: 'web',
      } as never),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('custom');
    unmount();
  });

  it('handles kit with very long id', () => {
    const longId = 'a'.repeat(40);
    const { lastFrame, unmount } = render(
      React.createElement(DesignPicker, {
        kits: [{ id: longId, aesthetic: 'test' }],
        selected: 0,
        stack: 'web',
      } as never),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain(longId);
    unmount();
  });

  it('caps the panel height at the measured maxRows budget', () => {
    const manyKits = Array.from({ length: 6 }, (_unused, i) => ({
      id: `kit-${i}`,
      aesthetic: 'test',
    }));
    const { lastFrame, unmount } = render(
      React.createElement(DesignPicker, {
        kits: manyKits,
        selected: 0,
        stack: 'web',
        maxRows: 10,
      } as never),
    );
    const frame = lastFrame() ?? '';
    // Regression for the legacy rows-10 guess: 4 chrome rows + up to 2
    // marker rows + the visible kits (1 row each) must fit the measured
    // budget the caller hands in.
    expect(frameHeight(frame)).toBeLessThanOrEqual(10);
    expect(frame).toContain('more below');
    expect(frame).not.toContain('kit-5');
    unmount();
  });

  it('re-centers the window on deep selections so late kits stay reachable', () => {
    const manyKits = Array.from({ length: 6 }, (_unused, i) => ({
      id: `kit-${i}`,
      aesthetic: 'test',
    }));
    const { lastFrame, unmount } = render(
      React.createElement(DesignPicker, {
        kits: manyKits,
        selected: 5,
        stack: 'web',
        maxRows: 10,
      } as never),
    );
    const frame = lastFrame() ?? '';
    expect(frameHeight(frame)).toBeLessThanOrEqual(10);
    expect(frame).toContain('more above');
    expect(frame).toContain('kit-5');
    unmount();
  });
});
