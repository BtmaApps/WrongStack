/**
 * Right-edge rail for the managed viewport: copy, inspect, selection band,
 * and scrollbar track. Columns are always reserved, so affordances never
 * reflow chat content.
 *
 * The gap column doubles as the drag-selection highlight band: while a drag is
 * in progress, the subscribing component re-renders ONLY this rail (via
 * useSyncExternalStore on {@link SelectionBandStore}) — the history cards
 * never re-render, and because the band occupies the already-reserved gap
 * column the layout (and the fixed-height overflow-hidden viewport) cannot
 * change mid-drag.
 *
 * Extracted from scrollable-history.tsx.
 */
import type React from 'react';
import { memo, useSyncExternalStore } from 'react';
import { useActiveTheme } from '../../hooks/use-active-theme.js';
import { Box, Text } from '../../ink.js';
import { theme } from '../../theme.js';
import type { CopyHit } from './copy-geometry.js';
import { COPY_ICON, INSPECT_ICON } from './copy-icon.js';
import { scrollbarThumb } from './scrollbar-geometry.js';
import { createSelectionBandStore, type SelectionBandStore } from './selection-band-store.js';

/** Default no-op store so the hook call below is never conditional. */
const NO_BAND = createSelectionBandStore();

interface ScrollbarProps {
  rows: number;
  offset: number;
  total: number;
  copyHits: readonly CopyHit[];
  copiedEntryId?: number | null | undefined;
  /** Transcript-search hit; its card's first row shows a marker in the gap column. */
  markedEntryId?: number | null | undefined;
  selectionBandStore?: SelectionBandStore | undefined;
}

/**
 * The rail renders one Box + five Texts per viewport row, and its parent
 * rebuilds `copyHits` as a fresh array on every flush (streaming included).
 * Compare only what the rail actually draws — each hit's row, entry id and
 * whether it has an inspect glyph — so an unchanged rail skips the repaint.
 * Drag-selection updates bypass props entirely through the band store.
 */
export function scrollbarPropsEqual(prev: ScrollbarProps, next: ScrollbarProps): boolean {
  if (
    prev.rows !== next.rows ||
    prev.offset !== next.offset ||
    prev.total !== next.total ||
    prev.copiedEntryId !== next.copiedEntryId ||
    (prev.markedEntryId ?? null) !== (next.markedEntryId ?? null) ||
    prev.selectionBandStore !== next.selectionBandStore
  ) {
    return false;
  }
  if (prev.copyHits === next.copyHits) return true;
  if (prev.copyHits.length !== next.copyHits.length) return false;
  for (let i = 0; i < prev.copyHits.length; i++) {
    const a = prev.copyHits[i];
    const b = next.copyHits[i];
    if (
      a === undefined ||
      b === undefined ||
      a.startRow !== b.startRow ||
      a.entryId !== b.entryId ||
      (a.inspectCol !== undefined) !== (b.inspectCol !== undefined)
    ) {
      return false;
    }
  }
  return true;
}

export const Scrollbar = memo(function Scrollbar({
  rows,
  offset,
  total,
  copyHits,
  copiedEntryId,
  markedEntryId = null,
  selectionBandStore = NO_BAND,
}: ScrollbarProps): React.ReactElement {
  // Memoized: theme switches must still repaint the rail colors.
  useActiveTheme();
  const band = useSyncExternalStore(selectionBandStore.subscribe, selectionBandStore.getSnapshot);
  const { top: thumbTop, size: thumbSize, scrollable } = scrollbarThumb(rows, offset, total);
  const cells: string[] = [];
  for (let i = 0; i < rows; i++) {
    cells.push(i >= thumbTop && i < thumbTop + thumbSize ? '█' : '│');
  }
  const copyByRow = new Map<number, CopyHit>();
  for (const hit of copyHits) copyByRow.set(hit.startRow, hit);
  let markedRow = -1;
  if (markedEntryId !== null) {
    for (const hit of copyHits) {
      if (hit.entryId === markedEntryId || hit.entryIds?.includes(markedEntryId)) {
        markedRow = Math.max(0, hit.startRow);
        break;
      }
    }
  }
  return (
    <Box flexDirection="column" flexShrink={0}>
      {cells.map((cell, row) => {
        const copyHit = copyByRow.get(row);
        const inBand = band !== null && row >= band.topRow && row <= band.bottomRow && row < rows;
        const isHead = band !== null && row === band.headRow && row < rows;
        return (
          <Box key={row} flexDirection="row">
            <Text
              color={copyHit && copiedEntryId === copyHit.entryId ? theme.success : theme.textMuted}
            >
              {copyHit ? COPY_ICON : ' '}
            </Text>
            <Text> </Text>
            <Text color={copyHit?.inspectCol !== undefined ? theme.accent : undefined}>
              {copyHit?.inspectCol !== undefined ? INSPECT_ICON : ' '}
            </Text>
            <Text {...(inBand || row === markedRow ? { color: theme.accent } : {})}>
              {isHead ? '█' : inBand ? '▌' : row === markedRow ? '◀' : ' '}
            </Text>
            <Text
              {...(scrollable ? { color: theme.accent } : {})}
              dimColor={!scrollable || cell === '│'}
            >
              {cell}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}, scrollbarPropsEqual);
