import type React from 'react';
import { Box, Text, useInput } from '../ink.js';

import {
  formatSendModeMessagePreview,
  SEND_MODE_OPTIONS,
  type SendMode,
  sendModeFromKey,
} from './send-mode-model.js';

export * from './send-mode-model.js';

interface SendModePickerProps {
  selected: number;
  /** The message being routed, shown so the modal question has context. */
  messagePreview?: string | undefined;
  /** Move the highlight by `delta` (caller clamps/wraps via nextSendModeIndex). */
  onMove: (delta: number) => void;
  /** Commit a decision (quick-key / Enter) or cancel (Esc → 'cancel'). */
  onSelect: (decision: SendMode | 'cancel') => void;
}

/**
 * Modal shown when the user submits a plain message while the agent is busy.
 * Self-contained input handling (own `useInput`) like {@link EscConfirmPrompt};
 * the main input is gated off via a handleKey early-return while this is open.
 *
 * - q / b / s → pick that mode immediately
 * - ↑ / ↓     → move the highlight
 * - Enter     → pick the highlighted mode
 * - Esc       → cancel (caller restores the draft to the composer)
 */
export function SendModePicker({
  selected,
  messagePreview,
  onMove,
  onSelect,
}: SendModePickerProps): React.ReactElement {
  useInput((input, key) => {
    if (key.upArrow) {
      onMove(-1);
      return;
    }
    if (key.downArrow) {
      onMove(1);
      return;
    }
    const decision = sendModeFromKey(input, key, selected);
    if (decision) onSelect(decision);
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1} marginY={1}>
      <Text color="cyan" bold>
        ━━ Deliver this message how? ━━
      </Text>
      {messagePreview ? (
        <Text>
          <Text dimColor>Message: </Text>
          <Text color="white">{formatSendModeMessagePreview(messagePreview)}</Text>
        </Text>
      ) : null}
      <Text dimColor>q/b/s pick · ↑/↓ move · Enter select · Esc → back to input</Text>
      {SEND_MODE_OPTIONS.map((opt, i) => (
        <Text
          key={opt.mode}
          inverse={i === selected}
          {...(i === selected ? { color: opt.color } : {})}
        >
          {i === selected ? '› ' : '  '}
          <Text bold color={opt.color}>
            [{opt.key}]
          </Text>{' '}
          <Text bold>{opt.label.padEnd(12)}</Text>
          <Text dimColor>{opt.description}</Text>
        </Text>
      ))}
    </Box>
  );
}
