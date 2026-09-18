import type React from 'react';
import { useWindowedPicker } from '../hooks/use-windowed-picker.js';
import { Box, Text } from '../ink.js';

export interface AutonomyOption {
  mode: 'off' | 'suggest' | 'auto' | 'eternal' | 'eternal-parallel';
  label: string;
  description: string;
  color: string;
}

export interface AutonomyPickerProps {
  options: AutonomyOption[];
  selected: number;
  hint?: string | undefined;
  /**
   * Measured vertical budget for the whole picker box (terminal rows minus
   * status bar, input, and margins — see `pickerMaxRows` in app-view.tsx).
   * When provided the window math uses it instead of the
   * `rows - shellReservedRows` guess, which under-reserves whenever the
   * status bar or input bar grows — the same overflow class the resume
   * panel had before it consumed this budget.
   */
  maxRows?: number | undefined;
}

export const AUTONOMY_OPTIONS: AutonomyOption[] = [
  {
    mode: 'off',
    label: 'OFF',
    description: 'Agent stops after each turn (normal interactive mode)',
    color: 'green',
  },
  {
    mode: 'suggest',
    label: 'SUGGEST',
    description: 'Shows next-step suggestions after each turn',
    color: 'cyan',
  },
  {
    mode: 'auto',
    label: 'AUTO',
    description: 'Self-driving — agent picks next step and continues',
    color: 'yellow',
  },
  {
    mode: 'eternal',
    label: 'ETERNAL',
    description: 'Goal-driven loop — requires /goal set first',
    color: 'red',
  },
  {
    mode: 'eternal-parallel',
    label: 'PARALLEL',
    description: 'Fan-out 4–8 subagents per tick — requires /goal',
    color: 'magenta',
  },
];

export function AutonomyPicker({
  options,
  selected,
  hint,
  maxRows,
}: AutonomyPickerProps): React.ReactElement {
  const { start, end, hasAbove, hasBelow } = useWindowedPicker({
    total: options.length,
    selected,
    chromeRows: 4,
    // 2 marker slots + 1 conditional hint slot — worst case, so the window
    // never overflows whether or not those rows actually render.
    markerRows: 3,
    maxRows,
  });
  const visibleOptions = options.slice(start, end);
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1}>
      <Text color="cyan" bold>
        ━━ Autonomy Mode ━━
      </Text>
      <Text dimColor wrap="truncate-end">
        ↑↓ · Enter select · Esc cancel
      </Text>
      {hasAbove ? <Text dimColor> … {start} more above</Text> : null}
      {visibleOptions.map((opt, j) => {
        const i = start + j;
        return (
          <Text
            key={opt.mode}
            wrap="truncate-end"
            inverse={i === selected}
            {...(i === selected ? { color: opt.color } : {})}
          >
            {i === selected ? '› ' : '  '}
            <Text bold>{opt.label.padEnd(12)}</Text>
            <Text dimColor>{opt.description}</Text>
          </Text>
        );
      })}
      {hasBelow ? <Text dimColor> … {options.length - end} more below</Text> : null}
      {hint ? (
        <Text color="yellow" wrap="truncate-end">
          {hint}
        </Text>
      ) : null}
    </Box>
  );
}
