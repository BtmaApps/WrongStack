import { getProcessRegistry, tailBackgroundLog } from '@wrongstack/tools';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { FleetEntry } from '../app-state-fleet.js';
import {
  agentPeekLines,
  type BackgroundItem,
  buildBackgroundItems,
  getBackgroundStrip,
  layoutStripChips,
  sameItems,
  selectedIndex,
  updateBackgroundStrip,
  useBackgroundStrip,
} from '../background-strip-model.js';
import { useActiveTheme } from '../hooks/use-active-theme.js';
import { Box, Text } from '../ink.js';
import { useMotionStatic } from '../motion.js';
import { displayWidth, sanitizeTerminalText, truncateDisplay } from '../terminal-width.js';
import { theme } from '../theme.js';
import { BREATHE_FRAMES } from './animation-style.js';

/** Output lines shown under the strip while a chip is open. */
export const BACKGROUND_STRIP_PEEK_ROWS = 6;

/** Rows the strip takes: none while nothing runs in the background. */
export function backgroundStripRows(state: {
  items: readonly unknown[];
  focused: boolean;
  peek: boolean;
}): number {
  if (state.items.length === 0) return 0;
  return state.focused && state.peek ? 1 + BACKGROUND_STRIP_PEEK_ROWS : 1;
}

function peekLines(item: BackgroundItem | undefined, fleet: Readonly<Record<string, FleetEntry>>) {
  if (!item) return [];
  if (item.kind === 'agent') {
    const lines = agentPeekLines(fleet[item.agentId ?? ''], BACKGROUND_STRIP_PEEK_ROWS);
    return lines.length > 0 ? lines : ['(no output yet)'];
  }
  if (!item.logFile) return ['(this shell’s output is not captured)'];
  const lines = tailBackgroundLog(item.logFile, BACKGROUND_STRIP_PEEK_ROWS);
  return lines.length > 0 ? lines : [`(no output yet: ${item.logFile})`];
}

/**
 * Running subagents and background shells, one chip each, right above the
 * composer. Hidden while nothing runs in the background. Alt+B focuses it
 * (see key-route-background-strip.ts).
 */
export function BackgroundStrip({
  fleet,
  width,
}: {
  fleet: Readonly<Record<string, FleetEntry>>;
  width: number;
}): React.ReactElement | null {
  useActiveTheme();
  const strip = useBackgroundStrip();
  const motionStatic = useMotionStatic();
  const [now, setNow] = useState(() => Date.now());
  const fleetRef = useRef(fleet);
  fleetRef.current = fleet;

  // The process registry has no change event: look once a second. The fleet
  // does re-render this component, so its changes land at once.
  useEffect(() => {
    const refresh = () => {
      const items = buildBackgroundItems(fleetRef.current, getProcessRegistry().list());
      const current = getBackgroundStrip().items;
      updateBackgroundStrip({ items: sameItems(current, items) ? current : items });
      if (items.length > 0) setNow(Date.now());
    };
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const items = buildBackgroundItems(fleet, getProcessRegistry().list());
    const current = getBackgroundStrip().items;
    if (!sameItems(current, items)) updateBackgroundStrip({ items });
  }, [fleet]);

  if (strip.items.length === 0) return null;

  const index = selectedIndex(strip);
  const spinner = motionStatic
    ? '•'
    : (BREATHE_FRAMES[Math.floor(now / 1000) % BREATHE_FRAMES.length] ?? '⠋');
  const selected = strip.items[index];
  const label = 'bg';
  const inner = Math.max(10, width - 2);
  const layout = (hint: string) => {
    const chipRoom = Math.max(10, inner - displayWidth(label) - displayWidth(hint) - 6);
    return { hint, ...layoutStripChips(strip.items, index, chipRoom, now, spinner) };
  };
  let { hint, chips, hidden } = layout(
    strip.confirmStop
      ? `stop pid ${selected?.pid}? y / n`
      : strip.focused
        ? '←→ pick · Enter output · x stop shell · Esc'
        : 'Alt+B',
  );
  // The chips matter more than the key help: shorten it before hiding one.
  if (hidden > 0 && strip.focused && !strip.confirmStop) {
    ({ hint, chips, hidden } = layout('←→ · Enter · x · Esc'));
  }
  const lines =
    strip.focused && strip.peek
      ? peekLines(selected, fleet).map((l) => sanitizeTerminalText(l).replace(/\n/g, ' '))
      : [];

  return (
    <Box flexDirection="column" flexShrink={0} width={width} paddingX={1}>
      <Text wrap="truncate">
        <Text color={strip.focused ? theme.accent : theme.textMuted} bold={strip.focused}>
          {label}
        </Text>
        {chips.map((chip) => (
          <Text key={chip.item.id}>
            <Text color={theme.textMuted}> </Text>
            <Text
              color={
                chip.selected && strip.focused
                  ? theme.accent
                  : chip.item.kind === 'shell'
                    ? theme.success
                    : theme.monitor.agents
              }
              inverse={chip.selected && strip.focused}
            >
              {` ${chip.text} `}
            </Text>
          </Text>
        ))}
        {hidden > 0 ? <Text color={theme.textMuted}>{` +${hidden}`}</Text> : null}
        <Text color={strip.confirmStop ? theme.warn : theme.textMuted}>{`   ${hint}`}</Text>
      </Text>
      {lines.length > 0 ? (
        <Box flexDirection="column" height={BACKGROUND_STRIP_PEEK_ROWS}>
          {lines.map((line, i) => (
            <Text key={i} color={theme.textSecondary} wrap="truncate">
              {`│ ${truncateDisplay(line, inner - 2)}`}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
