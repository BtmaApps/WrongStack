import {
  CHIP_DESCRIPTIONS,
  DEFAULT_LINES,
  effectiveDensity,
  effectiveLine,
  LINE_SUBTITLES,
  LINE_TITLES,
  resolveStatuslineOrder,
  STATUSLINE_ITEMS,
  type StatuslineDensities,
  type StatuslineDensity,
  type StatuslineItem,
  type StatuslineLine,
  type StatuslineLines,
  type StatuslineOrder,
} from '@wrongstack/core/statusline';
import type React from 'react';
import { Box, Text } from '../ink.js';
import { theme } from '../theme.js';
import type { ChipMeta } from '../ui-contracts.js';
import { glyphs } from '../ui-glyphs.js';
import { KeyCap, MonitorShell, truncatePanelText, useMonitorSize } from './monitor-shell.js';
import { renderMeter } from './status-bar-format.js';
import type { StatusBarClickMap } from './status-bar-types.js';
import {
  COMPOSER_OWNED_CHIPS,
  isChipExpired,
  navigableFields,
  STREAM_CHIP_KEYS,
} from './statusline-picker-model.js';

export * from './statusline-picker-model.js';

/** Live per-line fill measured by the StatusBar's last render. */
interface RailFill {
  used: number;
  budget: number;
  dropped: Set<string>;
  levels: Map<string, number>;
}

function readRailFills(clickMap: StatusBarClickMap | null | undefined): Map<number, RailFill> {
  const fills = new Map<number, RailFill>();
  for (const line of clickMap?.lines ?? []) {
    const logical = line.logical;
    if (logical == null) continue;
    fills.set(logical, {
      used: line.used ?? 0,
      budget: line.budget ?? 0,
      dropped: new Set(line.droppedIds ?? []),
      levels: new Map(line.spans.map((span) => [span.id, span.level])),
    });
  }
  return fills;
}

interface StatuslinePickerProps {
  /** Focused field index into STATUSLINE_ITEMS. */
  field: number;
  /** Current hidden-items list. */
  hiddenItems: StatuslineItem[];
  /** Per-chip line assignment; absent keys use DEFAULT_LINES. */
  lines?: StatuslineLines | undefined;
  /** Per-chip density pin; absent keys mean 'auto'. */
  densities?: StatuslineDensities | undefined;
  /** Custom left-to-right order; absent means canonical contract order. */
  order?: StatuslineOrder | undefined;
  /** Temporarily-visible chips with expiration metadata. */
  visibleChips?: ChipMeta[] | undefined;
  /** Text filter over chip names and descriptions. */
  filter?: string | undefined;
  /** True while `/` filter entry is capturing keystrokes. */
  filtering?: boolean | undefined;
  /** Optional hint message from the reducer. */
  hint?: string | undefined;
  /** Last published rail geometry, used for the live fill gauges. */
  clickMap?: StatusBarClickMap | null | undefined;
}

const DENSITY_LABEL: Record<StatuslineDensity, string> = {
  auto: 'auto',
  full: 'full',
  short: 'short',
  micro: 'micro',
};

/** Fixed-width inline line picker rendered beside every chip's on/off state. */
export function lineSelectorText(active: StatuslineLine): string {
  return ([1, 2, 3, 4] as StatuslineLine[])
    .map((line) => (line === active ? `[${line}]` : String(line)))
    .join(' ');
}

/**
 * The `/statusline` editor.
 *
 * Line, order and density controls share one row: 1-4 assigns the rail,
 * `o`/`O` changes left-to-right position (`[`/`]` and Shift+Up/Down are aliases), and `d` pins density. The
 * measured strip above previews the resulting layout rather than mocking it.
 * The layout strip at the top is not a mock-up — it reads the rail geometry
 * the StatusBar published on its last render, so `used/budget` and the
 * dropped/shortened marks are the real thing.
 */
export function StatuslinePicker({
  field,
  hiddenItems,
  lines = {},
  densities = {},
  order = [],
  visibleChips = [],
  filter = '',
  filtering = false,
  hint,
  clickMap,
}: StatuslinePickerProps): React.ReactElement {
  const size = useMonitorSize();
  const compact = size.rows < 22;
  const tight = size.rows < 12;
  const hiddenSet = new Set(hiddenItems);
  const visibleChipsMap = new Map(visibleChips.map((chip) => [chip.key, chip]));
  const composerOwned = new Set(COMPOSER_OWNED_CHIPS);
  const totalFields = STATUSLINE_ITEMS.length;
  const fills = readRailFills(clickMap);
  const focused = STATUSLINE_ITEMS[field];

  const resolvedOrder = resolveStatuslineOrder(order);
  const enabledOn = (line: StatuslineLine): StatuslineItem[] =>
    resolvedOrder.filter((item) => effectiveLine(item, lines) === line && !hiddenSet.has(item));

  const visibleFields = navigableFields(filter, order, lines);
  const fieldRank = Math.max(0, visibleFields.indexOf(field));

  // ── Layout strip: four rails, real fill, focused chip highlighted ──
  // Colour carries the state the user needs: what is on screen right now,
  // what the fitter had to shorten, what it dropped, and what is enabled but
  // has no data to show yet.
  const chipTone = (fill: RailFill | undefined, item: StatuslineItem): [string, string] => {
    if (!fill) return [theme.textMuted, ''];
    if (fill.dropped.has(item)) return [theme.error, '·'];
    const level = fill.levels.get(item);
    if (level == null) return [theme.textMuted, ''];
    if (level >= 2) return [theme.warn, '«'];
    if (level === 1) return [theme.warn, '‹'];
    return [theme.textSecondary, ''];
  };

  const strip = ([1, 2, 3, 4] as StatuslineLine[]).map((line) => {
    const items = enabledOn(line);
    const fill = fills.get(line);
    const ratio = fill && fill.budget > 0 ? Math.min(1, fill.used / fill.budget) : 0;
    return { line, fill, ratio, items };
  });

  // ── Rows: section headers + chip rows, windowed around the selection ──
  interface Row {
    section?: StatuslineLine | undefined;
    item?: StatuslineItem | undefined;
    fieldIdx?: number | undefined;
  }
  const listRows = compact
    ? Math.max(1, Math.min(3, size.rows - (size.columns < 80 ? 15 : 13)))
    : Math.max(3, size.contentRows - 8);
  const windowStart = Math.max(
    0,
    Math.min(fieldRank - Math.floor(listRows / 2), visibleFields.length - listRows),
  );
  const windowEnd = Math.min(windowStart + listRows, visibleFields.length);
  const windowed = new Set(visibleFields.slice(windowStart, windowEnd));

  const rows: Row[] = [];
  let lastSection: StatuslineLine | null = null;
  for (const index of visibleFields) {
    if (!windowed.has(index)) continue;
    const item = STATUSLINE_ITEMS[index]!;
    const line = effectiveLine(item, lines);
    if (line !== lastSection) {
      rows.push({ section: line });
      lastSection = line;
    }
    rows.push({ item, fieldIdx: index });
  }
  const above = windowStart;
  const below = visibleFields.length - windowEnd;

  const stateOf = (item: StatuslineItem): string => {
    if (hiddenSet.has(item)) return 'off';
    if (STREAM_CHIP_KEYS.includes(item)) {
      const meta = visibleChipsMap.get(item);
      if (!meta) return 'auto';
      if (meta.expiresIn == null) return 'on';
      const remainingMs = meta.shownAt + meta.expiresIn * 60_000 - Date.now();
      if (remainingMs <= 0) return 'auto';
      return `~${Math.max(1, Math.ceil(remainingMs / 60_000))}m`;
    }
    return 'on';
  };
  const stateColor = (item: StatuslineItem): string => {
    if (hiddenSet.has(item)) return theme.error;
    if (STREAM_CHIP_KEYS.includes(item)) {
      const meta = visibleChipsMap.get(item);
      if (!meta || isChipExpired(meta)) return theme.accent;
      return theme.warn; // stream chip active — it may disappear on its own
    }
    return theme.success;
  };

  const descWidth = Math.max(10, size.contentWidth - 56);
  const showDescriptions = size.columns >= 140;

  return (
    <MonitorShell
      accent={theme.warn}
      icon={glyphs.terminal}
      title="STATUS LINE"
      kicker="chip · on/off · line 1-4 · order · density"
      right={
        <Text color={theme.textMuted}>
          {totalFields - hiddenItems.length}/{totalFields} on
        </Text>
      }
      footer={
        tight ? (
          <Text dimColor wrap="truncate-end">
            ↑↓ · 1–4 line · o/O · Esc close
          </Text>
        ) : (
          <Box flexDirection="column">
            {/* Two fixed rows rather than one wrapping row: Ink's flexWrap
              reserves the full line height for every wrapped run, which left
              blank rows between the key caps. */}
            <Box gap={2}>
              <KeyCap keyName="↑↓" label="select" color={theme.warn} />
              <KeyCap keyName="←→" label="on/off" color={theme.accent} />
              <KeyCap keyName="1-4" label="line" color={theme.accent} />
              <KeyCap keyName="o/O" label="order" color={theme.accent} />
              <KeyCap keyName="d" label="density" color={theme.accent} />
            </Box>
            <Box gap={2}>
              <KeyCap keyName="/" label="filter" color={theme.accent} />
              <KeyCap keyName="a" label="line on/off" color={theme.accent} />
              <KeyCap keyName="r" label="reset layout" color={theme.error} />
              <KeyCap keyName="Esc" label="close" color={theme.error} />
            </Box>
            {size.columns >= 140 ? (
              <Text color={theme.textMuted}>
                {'  '}
                {'‹ shortened  « micro  · dropped — saved to the active profile/statusline.json'}
              </Text>
            ) : null}
          </Box>
        )
      }
    >
      {/* Live layout strip — the real rails, not a mock-up. */}
      {!compact ? (
        <Box flexDirection="column" marginTop={1}>
          {strip.map((rail) => {
            const budgetText = rail.fill
              ? `${renderMeter(rail.ratio, 8)} ${String(rail.fill.used).padStart(3)}/${rail.fill.budget}`
              : ' '.repeat(10);
            // Label (18) + `[meter] used/budget` (18) + the two-space gutter,
            // plus room for the `+N` elision marker. Overshooting here makes
            // Ink squeeze the row and silently eat the inter-chip spaces.
            const chipBudget = Math.max(10, size.contentWidth - 38 - 4);
            let used = 0;
            const shown: Array<{ item: StatuslineItem; tone: string; mark: string }> = [];
            for (const item of rail.items) {
              const [tone, mark] = chipTone(rail.fill, item);
              const density = effectiveDensity(item, densities);
              const width = item.length + mark.length + (density === 'auto' ? 0 : 2) + 1;
              if (used + width > chipBudget) break;
              used += width;
              shown.push({ item, tone, mark });
            }
            const elided = rail.items.length - shown.length;
            return (
              <Box key={`strip-${rail.line}`}>
                <Text
                  color={
                    focused && rail.line === effectiveLine(focused, lines)
                      ? theme.warn
                      : theme.textSecondary
                  }
                  bold
                >
                  {`L${rail.line} ${LINE_TITLES[rail.line]}`.padEnd(18)}
                </Text>
                <Text
                  color={rail.fill && rail.fill.dropped.size > 0 ? theme.error : theme.textMuted}
                >
                  {`${budgetText}  `}
                </Text>
                {rail.items.length === 0 ? <Text color={theme.textMuted}>—</Text> : null}
                {/* One template string per chip: Ink collapses a standalone
                  `{' '}` between sibling Text nodes, which silently ran chip
                  names together (`mailboxbrain`). */}
                {shown.map(({ item, tone, mark }) => {
                  const density = effectiveDensity(item, densities);
                  const pin = density === 'auto' ? '' : `=${density.slice(0, 1)}`;
                  return (
                    <Text key={`strip-${rail.line}-${item}`} color={tone}>
                      {`${item}${mark}${pin} `}
                    </Text>
                  );
                })}
                {elided > 0 ? <Text color={theme.textMuted}>{`+${elided}`}</Text> : null}
              </Box>
            );
          })}
        </Box>
      ) : null}
      {filtering || filter ? (
        <Text color={theme.accent}>
          {`  ${glyphs.search} ${filter}${filtering ? '▏' : ''} — ${visibleFields.length} match${visibleFields.length === 1 ? '' : 'es'}`}
        </Text>
      ) : null}
      {above > 0 && !tight ? <Text color={theme.textMuted}>{`  ↑ ${above} more`}</Text> : null}

      <Box flexDirection="column" marginTop={tight ? 0 : 1}>
        {rows.map((row) => {
          if (row.section != null) {
            const line = row.section;
            return (
              <Text key={`section-${line}`} bold color={theme.textMuted} wrap="truncate-end">
                {`LINE ${line} · ${LINE_TITLES[line]}${compact ? '' : ` — ${LINE_SUBTITLES[line]}`}`}
              </Text>
            );
          }
          const item = row.item!;
          const fieldIdx = row.fieldIdx!;
          const selected = fieldIdx === field;
          const line = effectiveLine(item, lines);
          const moved = line !== DEFAULT_LINES[item];
          const density = effectiveDensity(item, densities);
          const lineItems = resolvedOrder.filter(
            (candidate) => effectiveLine(candidate, lines) === line,
          );
          const orderIndex = lineItems.indexOf(item) + 1;
          return (
            <Box key={`row-${item}`}>
              <Text color={selected ? theme.warn : theme.textMuted}>{selected ? '› ' : '  '}</Text>
              <Text color={selected ? theme.textPrimary : theme.textSecondary} bold={selected}>
                {item.padEnd(16)}
              </Text>
              <Text color={stateColor(item)} bold>
                {stateOf(item).padEnd(6)}
              </Text>
              <Text
                color={selected ? theme.accent : moved ? theme.warn : theme.textMuted}
                bold={selected}
              >
                {lineSelectorText(line)}
                {'  '}
              </Text>
              <Text color={selected ? theme.warn : theme.textMuted}>
                {`#${String(orderIndex).padStart(2, '0')} `}
              </Text>
              <Text color={density === 'auto' ? theme.textMuted : theme.brand}>
                {DENSITY_LABEL[density].padEnd(6)}
              </Text>
              {composerOwned.has(item) ? (
                <Text color={theme.textMuted}>in composer</Text>
              ) : showDescriptions ? (
                <Text color={theme.textMuted}>
                  {truncatePanelText(CHIP_DESCRIPTIONS[item], descWidth)}
                </Text>
              ) : null}
            </Box>
          );
        })}
      </Box>

      {below > 0 && !tight ? <Text color={theme.textMuted}>{`  ↓ ${below} more`}</Text> : null}
      {hint && !(tight && (filtering || filter)) ? (
        <Text color={theme.warn}> {truncatePanelText(hint, size.contentWidth - 4)}</Text>
      ) : null}
    </MonitorShell>
  );
}
