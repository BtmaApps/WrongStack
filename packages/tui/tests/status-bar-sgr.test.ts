import { stripVTControlCharacters } from 'node:util';
import { render } from 'ink-testing-library';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { AssistantBody } from '../src/components/history/assistant.js';
import { CodeBlock } from '../src/components/history/code-block.js';
import { PowerlineRail } from '../src/components/powerline-rail.js';
import { Card } from '../src/components/sidebar-card.js';
import { StatusBar, type StatusBarProps } from '../src/components/status-bar.js';
import { Text } from '../src/ink.js';
import { statuslineBackgrounds } from '../src/statusline-palette.js';
import {
  setActiveTheme,
  sidebarCardSurface,
  THEME_OPTIONS,
  theme,
  themePresets,
} from '../src/theme.js';

/**
 * Raw-SGR color pins for the status bar — the only statusline tests that
 * must run outside the default vitest worker.
 *
 * These pins assert the raw `\x1b[38;2;253;159;2m` escape (STACK_ORANGE
 * #FD9F02). Ink → chalk renders `<Text color>` via `chalk.hex()`; chalk's
 * color level is auto-detected from `process.stdout.isTTY`, `COLORTERM`, and
 * `FORCE_COLOR` — in the default vitest worker (non-TTY, no env) it resolves
 * to 0 (disabled) and the brand-orange truecolor is silently stripped before
 * `ink-testing-library` ever sees it. This file therefore runs under the
 * dedicated config `vitest.status-bar-sgr.config.ts`
 * (`pnpm test:status-bar`), which sets `FORCE_COLOR=3` +
 * `COLORTERM=truecolor` at worker start so chalk initializes at level 3.
 * `FORCE_COLOR=1` alone would only force 16-color mode and downsample the
 * orange to a basic ANSI code. Applying these env vars package-wide breaks
 * ~55 unrelated ink tests that depend on the default non-color path.
 *
 * Everything else that used to live in status-bar-overflow.test.ts now runs
 * in the main config (width-controlled via renderRealTty, text-level
 * assertions only).
 */

describe('StatusBar version-chip SGR color pins', () => {
  it.each(THEME_OPTIONS.map(({ id }) => id))(
    'renders %s capsule colors without changing no-color geometry',
    (id) => {
      const palette = { ...themePresets[id], supportsBackground: true };
      const segments = ['project', 'model', 'state', 'tokens', 'cost'].map((text) =>
        React.createElement(Text, { key: text }, text),
      );
      const colored = render(React.createElement(PowerlineRail, { segments, budget: 90, palette }));
      const raw = colored.lastFrame() ?? '';
      colored.unmount();
      for (const hex of statuslineBackgrounds(palette)) {
        const rgb = [1, 3, 5]
          .map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16))
          .join(';');
        expect(raw).toContain(`\x1b[48;2;${rgb}m`);
      }
      const plain = render(
        React.createElement(PowerlineRail, { segments, budget: 90, palette, monochrome: true }),
      );
      const plainRaw = plain.lastFrame() ?? '';
      plain.unmount();
      expect(plainRaw).not.toMatch(/\x1b\[(?:38|48);/);
      expect(stripVTControlCharacters(raw)).toBe(plainRaw);
    },
  );
  it.each([
    ['statusline', React.createElement(StatusBar, { model: 'test', state: 'idle' })],
    [
      'code',
      React.createElement(CodeBlock, { code: 'const value = 1', lang: 'ts', contentWidth: 80 }),
    ],
    ['assistant', React.createElement(AssistantBody, { text: '**hello**', termWidth: 80 })],
  ])('repaints memoized %s immediately when the theme changes', async (_name, element) => {
    setActiveTheme('catppuccin');
    const view = render(element);
    try {
      await new Promise((resolve) => setTimeout(resolve, 40));
      const before = view.lastFrame();
      setActiveTheme('gruvbox-dark');
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(view.lastFrame()).not.toBe(before);
    } finally {
      view.unmount();
      setActiveTheme('catppuccin');
    }
  });
  it('paints connected status capsules while preserving foreground colors', () => {
    const previous = theme.supportsBackground;
    theme.supportsBackground = true;
    try {
      const { lastFrame, unmount } = render(
        React.createElement(StatusBar, {
          model: 'anthropic/claude',
          state: 'idle',
          projectName: 'WrongStack',
        } as StatusBarProps),
      );
      const raw = lastFrame() ?? '';
      unmount();
      expect(raw).toMatch(/\x1b\[38;2;/);
      const backgrounds = new Set(
        [...raw.matchAll(/\x1b\[48;2;(\d+);(\d+);(\d+)m/g)].map((match) =>
          match.slice(1).join(','),
        ),
      );
      expect(backgrounds.size).toBeGreaterThanOrEqual(3);
      expect(raw).toContain('▶');
    } finally {
      theme.supportsBackground = previous;
    }
  });

  it('keeps the update suffix inside the neutral status segment', () => {
    const previous = theme.supportsBackground;
    theme.supportsBackground = true;
    try {
      const { lastFrame, unmount } = render(
        React.createElement(StatusBar, {
          model: 'anthropic/claude',
          state: 'idle',
          version: '0.7.0',
          latestVersion: '0.8.1',
          updateAvailable: true,
        } as StatusBarProps),
      );
      const raw = lastFrame() ?? '';
      unmount();
      expect(raw).toContain('(update v0.8.1)');
      expect(raw).toMatch(/\x1b\[38;2;/);
      expect(raw).not.toMatch(/\x1b\[38;2;253;159;2m/);
    } finally {
      theme.supportsBackground = previous;
    }
  });

  it('renders the update chip monochrome (no orange SGR) in no-color mode', () => {
    // Render a raw (non-ANSI-stripped) frame — stripping SGR before matching
    // would make a negative SGR assertion vacuous (it could never fail).
    // Asserting on the raw frame actually catches a regression where no-color
    // mode still emits orange truecolor.
    const previous = theme.supportsBackground;
    theme.supportsBackground = true;
    try {
      const { lastFrame, unmount } = render(
        React.createElement(StatusBar, {
          model: 'anthropic/claude',
          state: 'idle',
          version: '0.7.0',
          latestVersion: '0.8.1',
          updateAvailable: true,
          mode: 'no-color',
        } as StatusBarProps),
      );
      const raw = lastFrame() ?? '';
      unmount();
      expect(raw).toContain('v0.7.0');
      expect(raw).toContain('(update v0.8.1)');
      expect(raw).not.toMatch(/\x1b\[48;2;/);
      expect(raw).not.toMatch(/\x1b\[38;2;253;159;2m/);
    } finally {
      theme.supportsBackground = previous;
    }
  });
});

describe('Sidebar card background SGR pins', () => {
  it('paints the vertical frame cells with the card surface', () => {
    const previous = theme.supportsBackground;
    theme.supportsBackground = true;
    try {
      const { lastFrame, unmount } = render(
        React.createElement(Card, {
          innerWidth: 20,
          accent: theme.accent,
          children: () => React.createElement(Text, null, 'body'),
        }),
      );
      const raw = lastFrame() ?? '';
      unmount();
      const [r, g, b] = sidebarCardSurface()
        .slice(1)
        .match(/.{2}/g)!
        .map((part) => Number.parseInt(part, 16));
      const bg = `\\x1b\\[48;2;${r};${g};${b}m`;
      expect(raw).toMatch(new RegExp(`${bg}(?:\\x1b\\[[0-9;]*m)*│`));
    } finally {
      theme.supportsBackground = previous;
    }
  });
});
