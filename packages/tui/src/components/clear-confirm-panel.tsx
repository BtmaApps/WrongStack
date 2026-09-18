import type React from 'react';
import { Box, Text } from '../ink.js';
import { SlashModalFrame } from './slash-modal-frame.js';

interface ClearConfirmPanelProps {
  leaderActive: boolean;
  subagentCount: number;
  value: string;
}

interface ClearConfirmationKey {
  escape?: boolean | undefined;
  return?: boolean | undefined;
  backspace?: boolean | undefined;
  delete?: boolean | undefined;
  ctrl?: boolean | undefined;
  meta?: boolean | undefined;
}

type ClearConfirmationKeyResult =
  | { decision: true | false; value: string }
  | { decision: null; value: string };

/** Exact token accepted by the destructive clear confirmation. */
export function isClearConfirmation(value: string): boolean {
  return value === 'YES';
}

/**
 * Deterministic keyboard state machine shared by the App input router and
 * regression tests. An invalid Enter is deliberately a no-op: the panel stays
 * open and keeps the typed value visible.
 */
export function clearConfirmationKeyResult(
  value: string,
  input: string,
  key: ClearConfirmationKey,
): ClearConfirmationKeyResult {
  if (key.escape) return { decision: false, value };
  if (key.ctrl || key.meta) return { decision: null, value };
  if (key.return) {
    return { decision: isClearConfirmation(value) ? true : null, value };
  }
  if (key.backspace || key.delete) {
    return { decision: null, value: value.slice(0, -1) };
  }
  if (!key.ctrl && !key.meta && input) {
    return { decision: null, value: `${value}${input}`.slice(0, 16) };
  }
  return { decision: null, value };
}

/**
 * Modal confirmation for `/clear` while work is active. The typed value is
 * rendered inside the panel so keystrokes can never appear to disappear.
 */
export function ClearConfirmPanel({
  leaderActive,
  subagentCount,
  value,
}: ClearConfirmPanelProps): React.ReactElement {
  const activeParts = [
    leaderActive ? 'leader run' : null,
    subagentCount > 0 ? `${subagentCount} sub-agent${subagentCount === 1 ? '' : 's'}` : null,
  ].filter((part): part is string => part !== null);

  return (
    <SlashModalFrame
      title="⚠ CLEAR BLOCKED — ACTIVE WORK"
      accent="red"
      footer={
        <Box flexDirection="column">
          <Text wrap="truncate-end">Esc cancel · Type YES · Enter clear</Text>
          <Text>
            Confirmation:{' '}
            <Text bold color={isClearConfirmation(value) ? 'green' : 'yellow'}>
              {value}
            </Text>
            <Text color="cyan">█</Text>
          </Text>
        </Box>
      }
    >
      <Box flexDirection="column" marginTop={1}>
        <Text>
          Still running:{' '}
          <Text bold color="yellow">
            {activeParts.join(' + ')}
          </Text>
        </Text>
        <Text dimColor>
          Clearing will stop this work and permanently reset the current session.
        </Text>
      </Box>
    </SlashModalFrame>
  );
}
