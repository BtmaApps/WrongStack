import type React from 'react';
import { Box, Text } from '../ink.js';

interface BugHuntRunningPanelProps {
  currentRound: number;
  totalRounds?: number | undefined;
  commandName?: string | undefined;
  label?: string | undefined;
}

/** A compact, non-blocking marker for the bug-hunt round currently in flight. */
export function BugHuntRunningPanel({
  currentRound,
  totalRounds,
  commandName,
  label,
}: BugHuntRunningPanelProps): React.ReactElement {
  const roundLabel = totalRounds ? `Round ${currentRound}/${totalRounds}` : `Round ${currentRound}`;
  const isCustomHunt = Boolean(commandName && commandName !== 'bughunt' && label);
  const headerText = isCustomHunt ? `◇ ${label!.toUpperCase()} STARTED` : '◇ BUG HUNTING STARTED';
  const stopCmd = isCustomHunt ? `/${commandName} stop` : '/bughunt stop';

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1}>
      <Text bold color="magenta">
        {headerText}
      </Text>
      <Text>
        <Text bold color="cyan">
          {roundLabel}
        </Text>
        <Text dimColor>{'  · proof-driven scan, reproduce, fix, verify'}</Text>
      </Text>
      <Text dimColor>{`${stopCmd} · finish this round, then stop`}</Text>
    </Box>
  );
}
