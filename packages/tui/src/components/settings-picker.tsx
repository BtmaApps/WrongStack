import type React from 'react';
import { useEffect } from 'react';
import { useTerminalSize } from '../hooks/use-terminal-size.js';
import { Box, Text } from '../ink.js';
import { SETTINGS_PICKER_MAX_HEIGHT } from '../ui-contracts.js';
import { buildSettingsFilterState } from './settings-picker-filter.js';
import { SETTINGS_PICKER_JUMP_CHORDS } from './settings-picker-jumps.js';
import type { SettingsPickerProps } from './settings-picker-props.js';
import {
  deriveSettingsSectionFieldStarts,
  SettingsPickerRowList,
} from './settings-picker-row-list.js';
import { buildSettingsPickerRows } from './settings-picker-rows.js';

export {
  SETTINGS_PICKER_JUMP_CHORDS,
  settingsPickerJumpByName,
  settingsPickerJumpField,
  settingsPickerJumpNames,
} from './settings-picker-jumps.js';
export * from './settings-picker-model.js';
export type { SettingsPickerProps } from './settings-picker-props.js';

export function SettingsPicker(props: SettingsPickerProps): React.ReactElement {
  const {
    field,
    filter,
    statuslineMode,
    configScope,
    profileConfigPath = '~/.wrongstack/profiles/default/config.json',
    inputHeight,
    maxRows,
    columns,
    hint,
    onLayoutComputed,
  } = props;
  const rows = buildSettingsPickerRows(props);

  // Build field → row index mapping. `rows` includes section headers
  // that are NOT counted by `field`; without this mapping the highlight
  // lands on the wrong row (or never shows on the first field).
  const fieldRowIndex: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i]?.section) fieldRowIndex.push(i);
  }
  useEffect(() => {
    onLayoutComputed?.({ rows, fieldRowIndex });
  });

  const { filterActive, rankedResults, filteredFieldIndices, highlightSegments } =
    buildSettingsFilterState(filter, SETTINGS_PICKER_JUMP_CHORDS);

  // ── Terminal geometry & row budget ──────────────────────────────────
  //
  // The picker must NEVER emit more terminal rows than are available.
  // An overflowing frame desyncs Ink's erase math: previously-written
  // rows survive into the next frame, duplicate/stale content stacks
  // up, and the top of the screen turns into a garbled block — the bug
  // seen when scrolling fields on short terminals like Ubuntu's default
  // 24-row GNOME Terminal.
  //
  // Two safety layers work together:
  //   1. VISIBLE_FIELDS  — limits how many field rows are rendered so
  //                        the content normally fits without clipping.
  //   2. height + overflowY — a hard cap on the picker Box that clips
  //                        any residual overflow (estimation error,
  //                        unexpected section headers, etc.) instead of
  //                        scrolling the terminal.
  //
  // Both numbers derive from the same chain so they cannot disagree:
  //
  //   pickerHeight     = clamp(termRows − inputHeight − bottomChromeRows, borderRows, maxHeight)
  //   innerHeight      = pickerHeight − BORDER_ROWS
  //   visible window  = largest centered field range whose exact wrapped
  //                     field rows + intersecting headers fit innerHeight.
  //
  // Field rows render a 40-char prefix ("  " + label.padEnd(26) +
  // value.padEnd(12)) followed by detail text. Deriving each field's wrapped
  // line cost avoids both narrow-terminal overflow and wide blank gaps.
  const { columns: termCols, rows: termRows } = useTerminalSize({
    fallbackColumns: 80,
    fallbackRows: 24,
  });

  // Content width inside the bordered, padded picker Box.
  // borderStyle="round" consumes 2 cols (left + right borders);
  // paddingX={1} consumes 2 more (1 col each side).
  const contentWidth = Math.max(10, (columns ?? termCols) - 4);
  const compact = maxRows !== undefined && maxRows < 12;
  // Match renderPickerRow's exact printable width: selection prefix + padded
  // label + padded value + detail. A fixed "2 lines at 80 cols" estimate
  // over-counted short rows and still left a large blank area in the box.
  const fieldLineCount = (fieldIdx: number): number => {
    if (compact) return 1;
    const rowIdx = fieldRowIndex[fieldIdx];
    const row = rowIdx === undefined ? undefined : rows[rowIdx];
    const printableWidth =
      2 +
      Math.max(26, (row?.label ?? '').length) +
      Math.max(12, String(row?.value ?? '').length) +
      (row?.detail ?? '').length;
    return Math.max(1, Math.ceil(printableWidth / contentWidth));
  };

  // Fixed rows consumed regardless of field count.
  // Real input height (passed from AppView) accounts for multi-line
  // buffers; default to 3 (single-line prompt + 2 chrome rows) when not
  // supplied (tests, standalone rendering).
  const INPUT_ROWS = inputHeight ?? 3;
  // StatusBar renders below the picker inside the bottom region.
  // Minimum/no-color reserves one status rail; detailed reserves its
  // four-rail worst case.
  const bottomChromeRows = statuslineMode === 'detailed' ? 4 : 1;
  const BORDER_ROWS = 2; // picker top + bottom borders
  // Title + legend/filter summary + footer. The keyboard legend wraps to a
  // second line below 64 content columns, so reserve that real extra row.
  const BASE_CHROME_ROWS = 3;

  // Picker Box height (borders included). Leaves INPUT_ROWS for the
  // Input box and bottomChromeRows for StatusBar below.
  // Keep only the two border rows as the minimum so tiny terminals do not
  // reserve content space they cannot display. The max prevents large
  // terminals from expanding the menu to the full available screen height.
  const pickerHeight = Math.min(
    SETTINGS_PICKER_MAX_HEIGHT,
    Math.max(BORDER_ROWS, maxRows ?? termRows - INPUT_ROWS - bottomChromeRows),
  );
  const innerHeight = pickerHeight - BORDER_ROWS;

  // VISIBLE_FIELDS — non-filter mode. Each field row renders linesPerField
  // lines; section headers (── Section ──) render one line and only for
  // sections that intersect the window. The old worst-case budget
  // (linesPerField + 1 per field — one header per field) under-filled the
  // box whenever fields clustered under headers, leaving a large blank
  // area above the picker's bottom border. Instead, find the largest
  // window (centered on the focused field, clamped as before) whose exact
  // rendered row count fits the available inner height.
  const totalFields = fieldRowIndex.length; // = SETTINGS_FIELD_COUNT

  // Shared with SettingsPickerRowList so the exact-fit budget and renderer
  // cannot silently disagree about which fields begin sections.
  const sectionFieldStarts = deriveSettingsSectionFieldStarts(fieldRowIndex);

  // Exact rows consumed by window [start, end): the measured line cost of
  // each field, plus one line per section header that intersects the window.
  // This includes the header of a section that began above the window and
  // still contains `start`.
  const countWindowLines = (start: number, end: number): number => {
    let lines = 0;
    for (let fieldIdx = start; fieldIdx < end; fieldIdx++) {
      lines += fieldLineCount(fieldIdx);
    }
    if (compact) return lines;
    for (const secStart of sectionFieldStarts) {
      if (secStart >= start && secStart < end) lines++;
    }
    if (start > 0 && !sectionFieldStarts.includes(start)) lines++;
    return lines;
  };

  // Window start for a given width N, centered on `field` (clamped as
  // before). The window grows by exactly one field per step, so the exact
  // row count is monotone in N and binary search finds the maximum fit.
  const windowStartFor = (n: number): number =>
    totalFields <= n ? 0 : Math.max(0, Math.min(field - Math.floor(n / 2), totalFields - n));

  const windowFits = (fieldCount: number): boolean => {
    const start = windowStartFor(fieldCount);
    const end = Math.min(start + fieldCount, totalFields);
    const scrollIndicatorRows = (start > 0 ? 1 : 0) + (end < totalFields ? 1 : 0);
    const chromeRows = BASE_CHROME_ROWS + scrollIndicatorRows + (hint && !compact ? 1 : 0);
    return countWindowLines(start, end) + chromeRows <= innerHeight;
  };

  let lo = 1;
  let hi = totalFields;
  let VISIBLE_FIELDS = Math.min(1, totalFields);
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (windowFits(mid)) {
      VISIBLE_FIELDS = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const windowStart = windowStartFor(VISIBLE_FIELDS);
  const windowEnd = Math.min(windowStart + VISIBLE_FIELDS, totalFields);
  const hasAbove = windowStart > 0;
  const hasBelow = windowEnd < totalFields;

  // Filter-mode window has no section headers. Use the most expensive
  // matching field as the per-result budget so broad queries cannot overflow,
  // while short rows are not all charged a stale worst-case width estimate.
  const maxFilteredFieldLines = Math.max(
    1,
    ...rankedResults.map((result) => fieldLineCount(result.chord.field)),
  );
  const FILTER_CHROME_ROWS = BASE_CHROME_ROWS + 2; // worst-case above + below indicators
  const FILTER_VISIBLE_FIELDS = Math.max(
    1,
    Math.floor(
      (innerHeight - FILTER_CHROME_ROWS - (hint && !compact ? 1 : 0)) / maxFilteredFieldLines,
    ),
  );
  const filterMatchCount = rankedResults.length;
  const filterSelectedIdx = filterActive
    ? rankedResults.findIndex((r) => r.chord.field === field)
    : -1;
  const filterWindowStart =
    !filterActive || filterMatchCount <= FILTER_VISIBLE_FIELDS || filterSelectedIdx < 0
      ? 0
      : Math.max(
          0,
          Math.min(
            filterSelectedIdx - Math.floor(FILTER_VISIBLE_FIELDS / 2),
            filterMatchCount - FILTER_VISIBLE_FIELDS,
          ),
        );
  const filterWindowEnd = Math.min(filterWindowStart + FILTER_VISIBLE_FIELDS, filterMatchCount);
  const filterHasAbove = filterActive && filterWindowStart > 0;
  const filterHasBelow = filterActive && filterWindowEnd < filterMatchCount;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
      height={pickerHeight}
      overflowY="hidden"
    >
      <Text color="cyan" bold wrap="truncate-end">
        ━━ Settings ━━ · Jev: /settings jev
      </Text>
      {filterActive ? (
        <Text
          wrap="truncate-end"
          color="yellow"
          bold
        >{`Filter: ${filter} (${filteredFieldIndices.length} match${filteredFieldIndices.length === 1 ? '' : 'es'})`}</Text>
      ) : (
        <Text dimColor wrap="truncate-end">
          ↑↓ field · ←→ change · / find · Esc close
        </Text>
      )}
      {filterActive && filterHasAbove ? (
        <Text
          dimColor
        >{`  ↑ ${filterWindowStart} match${filterWindowStart === 1 ? '' : 'es'} above`}</Text>
      ) : null}
      {!filterActive && hasAbove ? (
        <Text dimColor>{`  ↑ ${windowStart} field${windowStart === 1 ? '' : 's'} above`}</Text>
      ) : null}
      {filterActive && filteredFieldIndices.length === 0 ? (
        <Text dimColor italic>
          No matching settings rows.
        </Text>
      ) : null}
      <SettingsPickerRowList
        rows={rows}
        field={field}
        fieldRowIndex={fieldRowIndex}
        filterActive={filterActive}
        rankedResults={rankedResults}
        highlightSegments={highlightSegments}
        windowStart={windowStart}
        windowEnd={windowEnd}
        filterWindowStart={filterWindowStart}
        filterWindowEnd={filterWindowEnd}
        compactWidth={compact ? contentWidth : undefined}
      />
      {filterActive && filterHasBelow ? (
        <Text
          dimColor
        >{`  ↓ ${filterMatchCount - filterWindowEnd} match${filterMatchCount - filterWindowEnd === 1 ? '' : 'es'} below`}</Text>
      ) : null}
      {!filterActive && hasBelow ? (
        <Text
          dimColor
        >{`  ↓ ${totalFields - windowEnd} field${totalFields - windowEnd === 1 ? '' : 's'} below`}</Text>
      ) : null}
      <Text dimColor wrap="truncate-end">
        {compact && hint
          ? hint
          : configScope === 'project'
            ? 'Persisted to <project>/.wrongstack/config.json'
            : `Persisted to ${profileConfigPath}`}
      </Text>
      {hint && !compact ? (
        <Text color="yellow" wrap="truncate-end">
          {hint}
        </Text>
      ) : null}
    </Box>
  );
}
