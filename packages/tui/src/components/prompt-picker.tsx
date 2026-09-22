import type React from 'react';
import { useWindowedPicker } from '../hooks/use-windowed-picker.js';
import { Box, Text } from '../ink.js';
import { wrapRefinementPreview } from './enhance-panel.js';

import type { PromptPickEntry } from './prompt-picker-model.js';

export * from './prompt-picker-model.js';

const MAX_VISIBLE = 12;

/**
 * Maximum line budgets for the detail panel's variable sections. The ACTUAL
 * budgets are derived from `maxRows` (see {@link detailBudgets}) so the
 * bordered panel never exceeds its allocated region.
 */
const MAX_DESC_LINES = 2;
const MAX_PREVIEW_LINES = 6;

/**
 * Fixed chrome rows the detail panel always renders regardless of content:
 * 2 borders + title + 2 blank separators + slug/category/source/favorite +
 * "preview" label. The description and preview budgets are sized so that
 * `descLines + previewLines + DETAIL_CHROME_ROWS <= maxRows`.
 */
const DETAIL_CHROME_ROWS = 10;

/**
 * Minimum vertical budget before split mode engages. Below this the picker
 * falls back to list-only so the detail panel can never overflow a short
 * terminal: 10 chrome rows + at least 2 description + 2 preview = 14.
 */
const SPLIT_MIN_ROWS = 14;

/**
 * Derive the description and preview line budgets from the measured `maxRows`
 * so the bordered detail panel always fits within its allocated region. Both
 * sections get at least 1 line in split mode; the description is capped at
 * {@link MAX_DESC_LINES} and the preview at {@link MAX_PREVIEW_LINES}. When
 * `maxRows` is unknown (no measurement) the full caps apply.
 */
function detailBudgets(maxRows: number | undefined): {
  descLines: number;
  previewLines: number;
} {
  if (maxRows === undefined) {
    return { descLines: MAX_DESC_LINES, previewLines: MAX_PREVIEW_LINES };
  }
  const content = Math.max(2, maxRows - DETAIL_CHROME_ROWS);
  const descLines = Math.min(MAX_DESC_LINES, Math.max(1, content - 1));
  const previewLines = Math.min(MAX_PREVIEW_LINES, Math.max(1, content - descLines));
  return { descLines, previewLines };
}

function glyph(source: string): string {
  return source === 'project' ? '📁' : source === 'user' ? '👤' : source === 'synced' ? '☁' : '📦';
}

interface PromptPickerProps {
  /** Already-filtered entries for the active category. */
  entries: PromptPickEntry[];
  selected: number;
  category: string;
  total: number;
  columns?: number | undefined;
  maxRows?: number | undefined;
}

/**
 * Prompt library picker overlay (opened by a bare `/prompt` in the TUI).
 * Presentational only — navigation/category/selection state lives in the
 * reducer; Enter sets the input buffer to the chosen prompt's content (with
 * any `{{variables}}` left in place for the user to fill inline).
 */
export function PromptPicker({
  entries,
  selected,
  category,
  total,
  columns = 0,
  maxRows,
}: PromptPickerProps): React.ReactElement {
  const { start, end } = useWindowedPicker({
    total: entries.length,
    selected,
    maxRows: maxRows === undefined ? MAX_VISIBLE + 4 : Math.min(maxRows, MAX_VISIBLE + 4),
    chromeRows: 4,
  });
  const focused = entries[Math.max(0, Math.min(selected, entries.length - 1))];
  const longest = entries.reduce((value, entry) => Math.max(value, entry.title.length), 0);
  const listWidth = Math.max(36, Math.min(56, longest + 10));
  const { descLines, previewLines } = detailBudgets(maxRows);
  const split =
    columns >= listWidth + 43 &&
    Boolean(focused) &&
    (maxRows === undefined || maxRows >= SPLIT_MIN_ROWS);
  const list = (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      {...(split ? { width: listWidth, flexShrink: 0 } : {})}
    >
      <Text color="cyan" bold wrap="truncate-end">
        ━━ Prompt library · {category} ({entries.length}/{total}) ━━
      </Text>
      <Text dimColor wrap="truncate-end">
        {(columns > 0 && columns < 100) || split
          ? 'Esc · ↑↓ · ←→ · Enter · f ★ · e'
          : '↑/↓ navigate · ←/→ category · Enter insert · f favorite · e edit · Esc cancel'}
      </Text>
      {entries.length === 0 ? (
        <Text dimColor>No prompts in this category.</Text>
      ) : (
        entries.slice(start, end).map((e, i) => {
          const idx = start + i;
          const isSel = idx === selected;
          return (
            <Text
              key={e.slug}
              wrap="truncate-end"
              inverse={isSel}
              {...(isSel ? { color: 'cyan' } : {})}
            >
              {isSel ? '› ' : '  '}
              {glyph(e.source)} {e.favorite ? '★ ' : ''}
              <Text bold>{e.title}</Text>{' '}
              {split ? null : <Text dimColor>{e.description.slice(0, 52)}</Text>}
            </Text>
          );
        })
      )}
    </Box>
  );
  if (!split || !focused) return list;
  // Pre-wrap both variable-length sections into FIXED line budgets so the
  // detail panel height never changes as the user navigates between prompts
  // with different description/preview lengths — same idiom the /model and
  // /skill pickers use. wrapRefinementPreview is word-aware, caps at the line
  // budget, and ellipsizes overflow; the remainder is padded with blank lines.
  const detailColumns = Math.max(20, columns - listWidth - 4);
  const descWrapped = wrapRefinementPreview(
    focused.description || '(no description)',
    detailColumns,
    descLines,
  );
  const previewWrapped = wrapRefinementPreview(focused.content, detailColumns, previewLines);
  return (
    <Box flexDirection="row">
      {list}
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} flexGrow={1}>
        <Text color="cyan" bold wrap="truncate-end">
          {focused.title}
        </Text>
        {descWrapped.map((line, i) => (
          <Text key={`desc-${i}`} wrap="truncate-end">
            {line}
          </Text>
        ))}
        {/* Pad remaining description slots so every prompt's panel is the same height. */}
        {Array.from({ length: descLines - descWrapped.length }).map((_, i) => (
          <Text key={`desc-pad-${i}`}> </Text>
        ))}
        <Text> </Text>
        <Text wrap="truncate-end">
          <Text dimColor>slug: </Text>
          {focused.slug}
        </Text>
        <Text wrap="truncate-end">
          <Text dimColor>category: </Text>
          {focused.category}
        </Text>
        <Text wrap="truncate-end">
          <Text dimColor>source: </Text>
          {focused.source}
        </Text>
        <Text wrap="truncate-end">
          <Text dimColor>favorite: </Text>
          {focused.favorite ? 'yes' : 'no'}
        </Text>
        <Text> </Text>
        <Text dimColor>preview</Text>
        {previewWrapped.map((line, i) => (
          <Text key={`prev-${i}`} wrap="truncate-end">
            {line}
          </Text>
        ))}
        {/* Pad remaining preview slots so every prompt's panel is the same height. */}
        {Array.from({ length: previewLines - previewWrapped.length }).map((_, i) => (
          <Text key={`prev-pad-${i}`}> </Text>
        ))}
      </Box>
    </Box>
  );
}
