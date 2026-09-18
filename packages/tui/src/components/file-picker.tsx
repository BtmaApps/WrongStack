import type React from 'react';
import { useWindowedPicker } from '../hooks/use-windowed-picker.js';
import { Box, Text } from '../ink.js';

export interface FilePickerProps {
  query: string;
  matches: string[];
  selected: number;
  maxRows?: number | undefined;
}

export function FilePicker({
  query,
  matches,
  selected,
  maxRows,
}: FilePickerProps): React.ReactElement {
  const { start, end, hasAbove, hasBelow } = useWindowedPicker({
    total: matches.length,
    selected,
    maxRows,
    chromeRows: 4,
    markerRows: 2,
    minVisible: 1,
  });
  if (matches.length === 0) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text dimColor>@{query} — no matches</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text dimColor wrap="truncate-end">
        @{query || '…'}
      </Text>
      <Text dimColor wrap="truncate-end">
        ↑↓ · Enter attach · Esc cancel
      </Text>
      {hasAbove ? <Text dimColor>↑ {start} more</Text> : null}
      {matches.slice(start, end).map((m, i) => (
        <Text
          key={m}
          wrap="truncate-end"
          inverse={start + i === selected}
          {...(start + i === selected ? { color: 'cyan' } : {})}
        >
          {start + i === selected ? '› ' : '  '}
          {highlight(m, query)}
        </Text>
      ))}
      {hasBelow ? <Text dimColor>↓ {matches.length - end} more</Text> : null}
    </Box>
  );
}

function highlight(path: string, _query: string): string {
  // Visual highlight is omitted for terseness; ink Text styling at char level
  // requires splitting into segments. Keep the path verbatim for now.
  return path;
}
