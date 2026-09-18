import type React from 'react';
import { Box, Text } from '../ink.js';
import { SlashModalFrame } from './slash-modal-frame.js';

interface SlashConfirmPanelProps {
  question: string;
  defaultYes: boolean;
}

interface SlashConfirmationKey {
  ctrl?: boolean | undefined;
  meta?: boolean | undefined;
  escape?: boolean | undefined;
  return?: boolean | undefined;
}

/** Resolve a generic confirmation key; null means keep waiting. */
export function slashConfirmationDecision(
  input: string,
  key: SlashConfirmationKey,
  defaultYes: boolean,
): boolean | null | 'cancel' {
  if (key.escape) return 'cancel';
  if (key.ctrl || key.meta) return null;
  if (key.return) return defaultYes;
  const normalized = input.toLowerCase();
  if (normalized === 'y') return true;
  if (normalized === 'n') return false;
  if (normalized === 'q') return 'cancel';
  return null;
}

/** Visible modal used by slash commands that previously prompted via readline. */
export function SlashConfirmPanel({
  question,
  defaultYes,
}: SlashConfirmPanelProps): React.ReactElement {
  return (
    <SlashModalFrame
      title="? CONFIRM ACTION"
      accent="yellow"
      footer={
        <Text wrap="truncate-end">Esc/q = cancel · y/n · Enter = {defaultYes ? 'yes' : 'no'}</Text>
      }
    >
      <Box marginTop={1}>
        <Text>{question}</Text>
      </Box>
    </SlashModalFrame>
  );
}
