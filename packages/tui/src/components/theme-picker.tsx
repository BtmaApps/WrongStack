import type React from 'react';
import { useTerminalSize } from '../hooks/use-terminal-size.js';
import { Box, Text } from '../ink.js';
import { type ThemeName, type ThemePickerOption, themePresets } from '../theme.js';
import {
  buildThemeRows,
  filterThemeOptions,
  type ThemeRow,
  windowThemeRows,
} from '../theme-picker-rows.js';
import { ThemePreview } from './theme-preview.js';

interface ThemePickerProps {
  options: readonly ThemePickerOption[];
  selected: number;
  activeId: ThemeName;
  hint?: string | undefined;
  /**
   * Available column width for the whole picker (the main column width the
   * picker is mounted into). Below {@link SPLIT_MIN_COLUMNS} the picker
   * renders the list full-width without the preview pane — a narrow
   * terminal (or a wide sidebar) must never squeeze list rows into
   * truncated garbage just to show a preview.
   */
  columns?: number | undefined;
  /**
   * Measured vertical budget for the whole picker box (terminal rows minus
   * status bar, input, and margins — see app-view.tsx). When provided the
   * window math uses it instead of the `rows - shellReservedRows` guess,
   * which is what keeps the picker inside a 24-row terminal even when the
   * input bar or status bar grows. The preview pane is skipped when this
   * budget is too small for it to be useful.
   */
  maxRows?: number | undefined;
  /** Type-to-filter query. An empty string renders the full catalogue. */
  filter?: string | undefined;
}

/**
 * Interactive theme picker. Mirrors the autonomy-picker visual pattern
 * (bordered box, ↑/↓ navigate, Enter apply, Esc cancel) so the two
 * pickers look and feel consistent. The currently active preset is
 * highlighted with a `[active]` marker so the user can see whether
 * their selection will actually change anything.
 *
 * On wide terminals the picker splits into two panes: the list on
 * the left and a live {@link ThemePreview} on the right that renders the
 * *focused* preset's palette from its frozen snapshot. Navigating with ↑/↓
 * re-renders the preview; Enter alone applies the theme. The description
 * column is dropped from list rows in split mode — it moves into the
 * preview header, which is what frees the list to show more rows.
 *
 * Three things the flat-list version did not have:
 *
 *   - **Type-to-filter.** Printable keys narrow the list on name, id and
 *     description. `selected` is an index into the FILTERED list, so the
 *     window, the preview, and Enter all resolve through the same
 *     `filterThemeOptions` call.
 *   - **Family headers.** Related presets (Catppuccin ×4, Tokyo Night ×3)
 *     sit under one header, so a family is reachable without scrolling past
 *     60 unrelated rows. Headers are real rows and are counted against
 *     `maxRows` by {@link windowThemeRows}.
 *   - **Inline swatches.** Each row carries a six-chip palette sample, so
 *     the list is still informative on the narrow terminals that get no
 *     preview pane at all.
 */
export function ThemePicker({
  options,
  selected,
  activeId,
  hint,
  columns = 0,
  maxRows,
  filter = '',
}: ThemePickerProps): React.ReactElement {
  const split =
    columns >= SPLIT_MIN_COLUMNS &&
    options.length > 0 &&
    (maxRows === undefined || maxRows >= PREVIEW_MIN_ROWS);
  // In split mode the preview's full sample tops out at PREVIEW_FULL_ROWS.
  // Cap the list at the same height so the panes stay balanced — a list that
  // grew to the whole `maxRows` budget would dwarf a preview that stopped
  // growing once all its sections fit.
  const listMaxRows =
    split && maxRows !== undefined ? Math.min(maxRows, PREVIEW_FULL_ROWS) : maxRows;
  const visibleOptions = filterThemeOptions(options, filter);
  const rows = buildThemeRows(visibleOptions);
  const { rows: rows_terminal } = useTerminalSize();
  // Rows the list chrome owns on top of the windowed rows: the box borders,
  // the title and the controls line, plus the worst case of the conditional
  // lines (filter prompt, both `…` markers, and the hint). Reserving the
  // worst case up front is what keeps the box inside `maxRows` no matter which
  // of those lines actually render.
  const chromeRows = 4;
  const markerRows = 4;
  // Without a measured budget, fall back to the terminal height minus the
  // surrounding shell (input bar, status bar, safety margin) — the same guess
  // `useWindowedPicker` made. Dropping this would render all 64 rows whenever
  // a caller omits `maxRows`, which is what a bare <ThemePicker> in a test or
  // an alternate host does.
  const listBudget =
    listMaxRows === undefined
      ? Math.max(1, rows_terminal - chromeRows - markerRows - SHELL_RESERVED_ROWS)
      : Math.max(1, listMaxRows - chromeRows - markerRows);
  // Clamp BEFORE windowing, not just before rendering. Type-to-filter can
  // leave the parent's `selected` pointing past the end of the narrowed list
  // (the list shrank under a stale index). If the raw index reached
  // `windowThemeRows`, its `findIndex` would miss, `focusPos` would fall back
  // to 0, and the window would snap to the top of the list while the `›`
  // highlight stayed on the clamped last row — outside the window, so the
  // cursor would visually vanish until the next keypress. Window, highlight
  // and preview must all resolve through the same index.
  const safeSelected = Math.max(0, Math.min(selected, Math.max(0, visibleOptions.length - 1)));
  const window = windowThemeRows(rows, safeSelected, listBudget);
  const selectedOption = visibleOptions[safeSelected];
  // Usable width inside the list box: the border edges and `paddingX` are not
  // available to row content, so the row layout budgets against what is left.
  const innerWidth = (split ? LIST_COLUMN_WIDTH : Math.max(0, columns)) - LIST_CHROME_COLUMNS;

  const list = (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="magenta"
      paddingX={1}
      {...(split ? { width: LIST_COLUMN_WIDTH, flexShrink: 0 } : {})}
    >
      <Text color="cyan" bold>
        ━━ TUI Theme ━━
      </Text>
      <Text dimColor wrap="truncate-end">
        ↑↓ Enter apply · / · u undo · Esc
      </Text>
      {filter ? (
        <Text color="yellow" wrap="truncate-end">
          /{filter}
          {visibleOptions.length} match{visibleOptions.length === 1 ? '' : 'es'}
        </Text>
      ) : null}
      {window.hasAbove ? <Text dimColor> … more above</Text> : null}
      {window.rows.map((row) =>
        renderRow(row, keyFor(row), activeId, safeSelected, split, innerWidth),
      )}
      {window.hasBelow ? <Text dimColor> … more below</Text> : null}
      {hint ? (
        <Text color="yellow" wrap="truncate-end">
          {hint}
        </Text>
      ) : null}
    </Box>
  );

  if (!split) {
    return list;
  }

  return (
    <Box flexDirection="row">
      {list}
      <ThemePreview
        presetId={selectedOption?.id ?? activeId}
        active={selectedOption?.id === activeId}
        columns={columns - LIST_COLUMN_WIDTH - 1}
        maxRows={maxRows}
      />
    </Box>
  );
}

/**
 * Stable React key per row.
 *
 * Both halves are unique across the whole filtered list without reference to
 * the window: preset ids are unique, and `THEME_OPTIONS` is family-grouped, so
 * each family label appears exactly once (pinned by the contiguity guard in
 * `tests/theme-presets.test.ts`). That is what makes a family name safe to key
 * on — it was NOT safe before the family sort, when the same label could head
 * several separate blocks.
 *
 * The window index must stay OUT of the key: the window slides as the cursor
 * moves, so keying on position would remount every row on each keystroke —
 * exactly the churn a stable key exists to prevent.
 */
function keyFor(row: ThemeRow): string {
  return row.kind === 'header' ? `h:${row.family}` : `o:${row.option.id}`;
}

function renderRow(
  row: ThemeRow,
  key: string,
  activeId: ThemeName,
  selected: number,
  split: boolean,
  innerWidth: number,
): React.ReactElement {
  if (row.kind === 'header') {
    return (
      <Text key={key} color="blue" bold dimColor wrap="truncate-end">
        {row.family}
      </Text>
    );
  }
  const opt = row.option;
  const isActive = opt.id === activeId;
  const isSelected = row.index === selected;
  // The swatches and the description are OPTIONAL and are dropped rather than
  // allowed to wrap: a wrapped row would double the picker's height and blow
  // the `maxRows` budget, which the viewport matrix pins at 40x8. Ink will not
  // truncate a Text that sits in a shrinking Box reliably, so the decision is
  // made here from the measured inner width, instead.
  //
  // Swatches are suppressed in split mode on purpose: the preview pane beside
  // the list already shows the full palette, so the chips would be redundant
  // there. It also keeps every row the same width as it moves, instead of
  // shifting as the cursor passes over the active row.
  const fixed = ROW_BASE_COLUMNS + (isActive ? ACTIVE_MARKER_COLUMNS : 0);
  const showSwatches = !split && innerWidth - fixed >= SWATCH_COLUMNS;
  const showDescription =
    !split && innerWidth - fixed - (showSwatches ? SWATCH_COLUMNS : 0) >= MIN_DESCRIPTION_COLUMNS;
  return (
    // The cursor/name/marker run and the swatches are SIBLINGS, not nested.
    // Ink propagates a parent's `inverse` to nested children, so keeping
    // <Swatches/> inside the inverted <Text> inverted every chip — each swatch
    // would render in the complement of its own colour, which defeats the
    // point of sampling the palette.
    <Box key={key} flexDirection="row">
      <Text inverse={isSelected} {...(isSelected ? { color: 'cyan' } : {})}>
        {isSelected ? '› ' : '  '}
        <Text bold>{fitName(opt.name)}</Text>
        {isActive ? <Text color="green"> [active]</Text> : null}
      </Text>
      {showSwatches ? <Swatches optionId={opt.id} /> : null}
      {showDescription ? (
        <Text dimColor wrap="truncate-end">
          {' '}
          {opt.description}
        </Text>
      ) : null}
    </Box>
  );
}

/** Columns the name column occupies, after {@link fitName}. */
const NAME_COLUMNS = 21;

/**
 * Pad a preset name to exactly {@link NAME_COLUMNS}, truncating with an ellipsis
 * when it is longer.
 *
 * `padEnd(21)` alone is NOT enough: it pads but never shortens, so a name wider
 * than the column silently pushed the row past the width the swatch/description
 * gate budgeted against. That is not hypothetical — "GitHub Dark High Contrast"
 * is 25 characters, so the `[active]` row overran by 4 columns and could wrap,
 * which doubles the row height and breaks the `maxRows` contract. Truncating
 * keeps every row exactly the width the layout math assumes.
 */
function fitName(name: string): string {
  return name.length > NAME_COLUMNS
    ? `${name.slice(0, NAME_COLUMNS - 1)}…`
    : name.padEnd(NAME_COLUMNS);
}

/** Columns the six chips plus their leading gap occupy. */
const SWATCH_COLUMNS = 7;

/** Every row's fixed cost: cursor (2) + name (21). */
const ROW_BASE_COLUMNS = 2 + NAME_COLUMNS;

/** Extra columns the ` [active]` marker costs on the one row that carries it. */
const ACTIVE_MARKER_COLUMNS = 9;

/**
 * Minimum columns a description needs before it is worth rendering. Below
 * this the text would truncate to a few unreadable characters while still
 * costing a row, so the row is better off carrying just the name.
 */
const MIN_DESCRIPTION_COLUMNS = 12;

/**
 * Columns the list box spends on its own frame — the two border edges plus
 * `paddingX={1}` on each side. Not available to row content, so the width the
 * row layout budgets against has to subtract it.
 */
const LIST_CHROME_COLUMNS = 4;

/**
 * Six single-cell chips sampled from the row's own palette, so a user can tell
 * two similarly-named presets apart without moving focus to the preview pane.
 * Rendered from `themePresets` (the frozen snapshot) — never from the live
 * `theme`, so browsing cannot repaint the list itself.
 */
function Swatches({ optionId }: { optionId: ThemeName }): React.ReactElement | null {
  const preset = themePresets[optionId];
  if (!preset) return null;
  const chips = [
    preset.accent,
    preset.brandPrimary,
    preset.user,
    preset.success,
    preset.error,
    preset.surfaceRaised,
  ] as const;
  return (
    <Text>
      {' '}
      {chips.map((color, i) => (
        <Text key={`${optionId}-${i}`} backgroundColor={color}>
          {' '}
        </Text>
      ))}
    </Text>
  );
}

/**
 * Rows the surrounding app shell reserves when no measured `maxRows` budget is
 * supplied — input bar (1), status bar (1) and a margin for the chat
 * viewport's own chrome. Mirrors `useWindowedPicker`'s default so both
 * pickers agree on how much a list can occupy.
 */
const SHELL_RESERVED_ROWS = 6;

/**
 * List column width in split mode: cursor (2) + name (21) + ` [active]` (9)
 * + swatches (7: 1 gap + 6 chips) + border/padding (4) ≈ 43 columns. The
 * description lives in the preview, so the list stays narrow and the preview
 * gets the remaining width.
 */
const LIST_COLUMN_WIDTH = 43;

/**
 * Minimum picker width before the split layout engages. Below this the
 * preview pane is dropped and the list renders full-width with its inline
 * descriptions (the pre-split behavior).
 */
const SPLIT_MIN_COLUMNS = 92;

/**
 * Minimum vertical budget before the preview pane is worth rendering. Below
 * this the picker falls back to list-only so a very short terminal never
 * gets a preview box taller than the list it sits beside.
 */
const PREVIEW_MIN_ROWS = 12;

/**
 * Full height of the preview pane when every section fits. In split mode the
 * list window is capped at this so the two panes top out at the same height
 * instead of the list dwarfing the preview.
 */
const PREVIEW_FULL_ROWS = 18;
