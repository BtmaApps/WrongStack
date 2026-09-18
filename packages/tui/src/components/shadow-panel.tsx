import type React from 'react';
import { Box, Text } from '../ink.js';

export interface ShadowState {
  activeId: string | null;
  running: boolean;
  model: string;
  intervalMs: number;
}

interface ShadowPanelProps {
  maxRows?: number | undefined;
  shadow: ShadowState;
  hint?: string | undefined;
}

export function ShadowPanel({ shadow, hint, maxRows }: ShadowPanelProps): React.ReactElement {
  const compact = maxRows !== undefined && maxRows < 14;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1}>
      <Text bold color="blue">
        ━━ Shadow Agent ━━
      </Text>
      <Text dimColor wrap="truncate-end">
        s start · t stop · Esc close
      </Text>

      <Box marginTop={compact ? 0 : 1} flexDirection="column">
        {/* Status */}
        <Box>
          <Text bold>Status: </Text>
          {shadow.running ? (
            <Text color="green">● running</Text>
          ) : (
            <Text color="gray">○ stopped</Text>
          )}
          {shadow.activeId ? <Text dimColor>{`  ${shadow.activeId.slice(0, 12)}…`}</Text> : null}
        </Box>

        {/* Model */}
        <Box marginTop={compact ? 0 : 1}>
          <Text bold>Model: </Text>
          <Text color="cyan" wrap="truncate-end">
            {shadow.model}
          </Text>
        </Box>

        {/* Interval */}
        <Box marginTop={compact ? 0 : 1}>
          <Text bold>Interval: </Text>
          <Text color="yellow">
            {shadow.intervalMs >= 1000 ? `${shadow.intervalMs / 1000}s` : `${shadow.intervalMs}ms`}
          </Text>
          <Text dimColor> (min 5s)</Text>
        </Box>

        {/* Actions legend */}
        {!compact ? (
          <Box marginTop={1}>
            <Text dimColor>
              {shadow.running
                ? 'Press t to stop the Shadow Agent'
                : 'Press s to start the Shadow Agent'}
            </Text>
          </Box>
        ) : null}
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
