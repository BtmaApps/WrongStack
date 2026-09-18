import type React from 'react';
import { useTerminalSize } from '../hooks/use-terminal-size.js';
import { useWindowedPicker } from '../hooks/use-windowed-picker.js';
import { Box, Text } from '../ink.js';

export interface PluginPickerItem {
  name: string;
  enabled: boolean;
  risk: 'low' | 'medium' | 'high';
  summary: string;
  /**
   * When false the row is locked: the picker renders a 🔒 marker and ignores
   * Enter/←/→ on it. The current built-in audit list is fully toggleable, but
   * the component keeps this marker for future or externally supplied locked
   * rows.
   */
  lockable?: boolean | undefined;
}

interface PluginPickerProps {
  maxRows?: number | undefined;
  columns?: number | undefined;
  items: PluginPickerItem[];
  selected: number;
  busy?: boolean | undefined;
  hint?: string | undefined;
}

/**
 * Hard ceiling on how many plugin rows are rendered at once. Smaller terminals
 * use the measured picker allocation; on tall terminals
 * this cap prevents the picker from monopolising the viewport. Overflowing
 * rows remain reachable via ↑/↓ (the window re-centres on the selection) with
 * `↑ N more` / `↓ N more` indicators.
 */
const MAX_PICKER_ITEMS = 15;

export function PluginPicker({
  items,
  selected,
  busy = false,
  hint,
  maxRows,
  columns,
}: PluginPickerProps): React.ReactElement {
  const size = useTerminalSize();
  const budget = maxRows ?? Math.max(8, size.rows - 6);
  const compact = budget < 12;

  // Height-aware scrolling window centred on the selection — small terminals
  // get a short window with ↑/↓ overflow indicators instead of an overflowing
  // (and Ink-clipped) full list.
  const total = items.length;
  const { start: windowStart, end: windowEnd } = useWindowedPicker({
    total,
    selected,
    maxRows: Math.min(budget, MAX_PICKER_ITEMS + 9),
    chromeRows: 4 + (compact ? 0 : 1) + (hint ? (compact ? 1 : 2) : 0),
    markerRows: 2,
  });
  const above = windowStart;
  const below = total - windowEnd;
  const hasLockedRows = items.some((item) => item.lockable === false);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">
        Plugin menu
      </Text>
      <Text dimColor wrap="truncate-end">
        {(columns ?? size.columns) < 70
          ? '↑↓ select · Enter toggle · Esc close'
          : `↑/↓ select · Enter/←/→ toggle${hasLockedRows ? ' · 🔒 = locked' : ''} · Esc close`}
      </Text>
      <Box marginTop={compact ? 0 : 1} flexDirection="column">
        {items.length === 0 ? (
          <Text dimColor>{busy ? 'Loading plugins…' : 'No plugins available.'}</Text>
        ) : (
          <>
            {above > 0 ? <Text dimColor>{`  ↑ ${above} more`}</Text> : null}
            {items.slice(windowStart, windowEnd).map((item, i) => {
              const index = windowStart + i;
              const focused = index === selected;
              const marker = focused ? '›' : ' ';
              const isLocked = item.lockable === false;
              const state = item.enabled ? '● on ' : '○ off';
              const color = item.enabled ? 'green' : 'gray';
              // The 🔒 lives in its own column after the name (not inside the
              // on/off column) so the state column stays uniform. The emoji
              // occupies 2 cells, so the unlocked filler is 2 spaces.
              const lock = isLocked ? '🔒' : '  ';
              return (
                <Text key={item.name} color={focused ? 'cyan' : undefined} wrap="truncate-end">
                  {marker} <Text color={color}>{state}</Text> {item.name.padEnd(18)}{' '}
                  <Text color={isLocked ? 'yellow' : undefined}>{lock}</Text>{' '}
                  <Text dimColor>risk={item.risk.padEnd(6)}</Text> {item.summary}
                </Text>
              );
            })}
            {below > 0 ? <Text dimColor>{`  ↓ ${below} more`}</Text> : null}
          </>
        )}
      </Box>
      {hint ? (
        <Box marginTop={compact ? 0 : 1}>
          <Text dimColor wrap="truncate-end">
            {hint}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}
