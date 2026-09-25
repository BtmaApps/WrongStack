import type React from 'react';
import { useRef } from 'react';
import { useWindowedPicker } from '../hooks/use-windowed-picker.js';
import { Box, Text, useInput } from '../ink.js';
import { useMonitorSize } from './monitor-shell.js';

export interface CheckpointTimelineProps {
  checkpoints: Array<{
    promptIndex: number;
    promptPreview: string;
    ts: string;
    fileCount: number;
  }>;
  selected: number;
  onSelect: (index: number) => void;
  onConfirm: (index: number) => void | Promise<void>;
  /** Branch a new session at the checkpoint; absent when the host cannot fork. */
  onFork?: ((index: number) => void) | undefined;
  onClose: () => void;
}

/**
 * Full-screen checkpoint timeline overlay for the /rewind command.
 * Arrow keys to navigate, Enter to rewind to selected, `f` to fork a new
 * session there, Esc to close. Both take the selected prompt and everything
 * after it back, and put the prompt back in the composer.
 */
export function CheckpointTimeline({
  checkpoints,
  selected,
  onSelect,
  onConfirm,
  onFork,
  onClose,
}: CheckpointTimelineProps): React.ReactElement {
  const size = useMonitorSize();
  const pending = useRef(false);
  const { start, end } = useWindowedPicker({
    total: checkpoints.length,
    selected,
    maxRows: size.rows,
    chromeRows: 4,
    markerRows: 1,
  });
  useInput((input, key) => {
    if (key.ctrl || key.meta) return;
    if (key.escape) {
      onClose();
    } else if (onFork && input === 'f' && checkpoints[selected] && !pending.current) {
      onFork(selected);
    } else if (key.upArrow) {
      onSelect(Math.max(0, selected - 1));
    } else if (key.downArrow && checkpoints.length > 0) {
      onSelect(Math.min(checkpoints.length - 1, selected + 1));
    } else if (key.return && checkpoints[selected] && !pending.current) {
      pending.current = true;
      void Promise.resolve()
        .then(() => onConfirm(selected))
        .finally(() => {
          pending.current = false;
        })
        .catch(() => {});
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">
        ⟲ Session Rewind
      </Text>
      <Text dimColor wrap="truncate-end">
        {size.columns < 60
          ? `Esc cancel · ↑↓ · Enter rewind${onFork ? ' · f fork' : ''}`
          : `Esc cancel · ↑/↓ navigate · Enter rewind here${onFork ? ' · f fork a new session from here' : ''}`}
      </Text>
      {checkpoints.length === 0 ? (
        <Text dimColor>No checkpoints in this session.</Text>
      ) : (
        checkpoints.slice(start, end).map((cp, offset) => {
          const i = start + offset;
          const isSelected = i === selected;
          const label = `[${cp.promptIndex}] ${cp.promptPreview}`;
          return (
            <Text key={cp.promptIndex} wrap="truncate-end">
              <Text bold={isSelected} {...(isSelected ? { color: 'cyan' } : {})}>
                {isSelected ? '▸ ' : '  '}
              </Text>
              <Text bold={isSelected} {...(isSelected ? { color: 'cyan' } : {})}>
                {label}
              </Text>
              <Text dimColor> {new Date(cp.ts).toLocaleTimeString()}</Text>
              {cp.fileCount > 0 && (
                <Text dimColor>
                  {' '}
                  · {cp.fileCount} file{cp.fileCount !== 1 ? 's' : ''}
                </Text>
              )}
            </Text>
          );
        })
      )}
      {checkpoints.length > end || start > 0 ? (
        <Text dimColor>
          {start + 1}–{end}/{checkpoints.length}
        </Text>
      ) : null}
    </Box>
  );
}
