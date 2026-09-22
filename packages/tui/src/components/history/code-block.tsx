import type { DiffLineKind, DiffLineRow, DiffPreview } from '@wrongstack/tools/tool-diff';
import type React from 'react';
import { memo } from 'react';
import {
  type HLState,
  highlightLine,
  type Lang,
  langFromPath,
  type Token,
} from '../../highlight.js';
import { useActiveTheme } from '../../hooks/use-active-theme.js';
import { Box, Text } from '../../ink.js';
import {
  displayWidth,
  sanitizeTerminalText,
  splitDisplay,
  truncateDisplay,
} from '../../terminal-width.js';
import { theme } from '../../theme.js';
import { formatDiffStats } from './diff-model.js';
import { HistoryRail } from './entry-helpers.js';

// ── Types ──

// The rich diff model (row shape + unified-diff parser) is now the single
// source of truth in @wrongstack/tools/tool-diff, shared with the WebUI/HQ.
// This file keeps only the TUI-specific rendering (ink/theme/wrap/tab-expand).
// Imported for local use AND re-exported so this module's public API is intact.
// Re-export straight from the source module (not the local import bindings) so
// the dts bundler can drop the chain without leaving a dangling import behind.
export type { DiffLineKind, DiffLineRow, DiffPreview } from '@wrongstack/tools/tool-diff';
export * from './diff-model.js';

// ── Constants ──

/** Max code-block lines rendered before a "+N more" footer. */
const MAX_CODE_LINES = 80;
/**
 * Wrap budget when the caller doesn't supply `contentWidth` (e.g. the
 * approval dialog). Matches the historical per-row cap so the layout risk
 * on narrow terminals is unchanged — but the content wraps instead of
 * being cut off.
 */
const DIFF_FALLBACK_WRAP_WIDTH = 100;
/**
 * Display width for a hard tab. Matches the near-universal terminal default
 * (8-column tab stops), so a tab-indented file (Go, Makefiles, kernel C, …)
 * shows the same indentation depth here as it does in `git diff` or the
 * read view, and so the wrap + wash-padding math — which counts characters —
 * agrees with the number of columns the terminal actually advances.
 */
const HARD_TAB_WIDTH = 8;

/**
 * Expand hard tabs to spaces at fixed tab stops, measured from column 0 of
 * the passed text.
 *
 * A literal `\t` is doubly broken for the diff renderer:
 *
 * 1. Inside a background-washed `<Text>` the terminal does NOT paint the
 *    cells a tab skips over — it just advances the cursor — so a tab-indented
 *    add/del line shows a colourless gap before the code (the "no background
 *    at the start of the line" artifact).
 * 2. The wrap ({@link wrapTokens}) and wash-pad ({@link DiffBlock}) math count
 *    a tab as a single character while it occupies up to `HARD_TAB_WIDTH`
 *    columns on screen, so the trailing-space pad overshoots and the row
 *    spills onto the next line.
 *
 * Converting tabs to real spaces up front makes the stored text, the wrap
 * math, and the painted background all agree. A no-tab fast path keeps the
 * common (space-indented) case allocation-free.
 */
function expandTabs(text: string, tabWidth: number = HARD_TAB_WIDTH): string {
  if (!text.includes('\t')) return text;
  let out = '';
  let col = 0;
  for (const ch of text) {
    if (ch === '\t') {
      const advance = tabWidth - (col % tabWidth);
      out += ' '.repeat(advance);
      col += advance;
    } else {
      out += ch;
      col += 1;
    }
  }
  return out;
}

// ── CodeBlock ──

/** Syntax-highlighted, framed code block. */
function CodeBlockImpl({
  code,
  lang,
  contentWidth,
}: {
  code: string;
  lang: Lang;
  contentWidth: number;
}): React.ReactElement {
  useActiveTheme();
  let lines = sanitizeTerminalText(code, HARD_TAB_WIDTH).replace(/\n+$/, '').split('\n');
  const hidden = Math.max(0, lines.length - MAX_CODE_LINES);
  if (hidden > 0) lines = lines.slice(0, MAX_CODE_LINES);
  const gutterW = String(lines.length).length;
  const maxW = Math.max(1, Math.min(contentWidth - 4 - gutterW - 1, 120));
  let carry: HLState = {};
  const rows = lines.map((raw) => {
    // Expand hard tabs before measuring/truncating so a tab-indented line
    // isn't under-counted (tab = 1 char but many columns) and made to wrap.
    const expanded = expandTabs(raw);
    const display = truncateDisplay(expanded, maxW);
    const r = highlightLine(display, lang, carry);
    carry = r.carry;
    return r.tokens;
  });
  return (
    <HistoryRail color={theme.borderDefault}>
      {lang !== 'plain' ? <Text dimColor>{lang}</Text> : null}
      {rows.map((tokens, i) => (
        <Text key={i}>
          <Text dimColor>{`${String(i + 1).padStart(gutterW, ' ')} `}</Text>
          {tokens.length === 0
            ? ' '
            : tokens.map((t, j) => (
                <Text
                  key={j}
                  dimColor={Boolean(t.dim)}
                  bold={Boolean(t.bold)}
                  {...(t.color ? { color: t.color } : {})}
                >
                  {t.text}
                </Text>
              ))}
        </Text>
      ))}
      {hidden > 0 ? (
        <Text dimColor italic>{`… +${hidden} more line${hidden === 1 ? '' : 's'}`}</Text>
      ) : null}
    </HistoryRail>
  );
}

// ── DiffBlock ──

/**
 * One labeled diff — used to render a per-file block inside multi-file
 * diff views (e.g. when `replace` modifies several files). The path label
 * is rendered dim and italic so the file boundary is visible without
 * competing with the add/remove wash.
 */
export function DiffFileBlock({
  path,
  preview,
  useColor = true,
  contentWidth,
}: {
  path: string;
  preview: DiffPreview;
  /** Pass-through to {@link DiffBlock}. See that component for details. */
  useColor?: boolean | undefined;
  /** Pass-through to {@link DiffBlock}. See that component for details. */
  contentWidth?: number | undefined;
}): React.ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row" marginBottom={0}>
        <Text bold color={theme.accent}>
          {`▸ ${path}`}
        </Text>
        {preview.added > 0 || preview.removed > 0 ? (
          <Text dimColor>
            {`  (${preview.added > 0 ? `+${preview.added}` : ''}${preview.added > 0 && preview.removed > 0 ? ' ' : ''}${preview.removed > 0 ? `-${preview.removed}` : ''})`}
          </Text>
        ) : null}
      </Box>
      <DiffBlock
        rows={preview.rows}
        hidden={preview.hidden}
        added={preview.added}
        removed={preview.removed}
        hiddenAdded={preview.hiddenAdded}
        hiddenRemoved={preview.hiddenRemoved}
        useColor={useColor}
        lang={langFromPath(path)}
        showStats={false}
        contentWidth={contentWidth}
      />
    </Box>
  );
}

/**
 * Return the token list to render on a diff wash (`diffAddBg` /
 * `diffDelBg`). When `onWash` is false the input is returned unchanged —
 * plain-background rendering keeps the conventional dim comment look and
 * there is no contrast reason to intervene.
 *
 * When `onWash` is true, comment tokens are re-pointed from the
 * `syntax.comment` role to `syntax.commentOnWash` and lose their dim flag.
 * `syntax.comment` resolves to `theme.textMuted`, which is chosen to recede
 * against `theme.surface` and therefore falls below WCAG AA on either wash;
 * `syntax.commentOnWash` resolves to `theme.textSecondary`, which clears both
 * (≥ 4.5) while keeping the comment visually secondary. Because both sides
 * are ROLES, the promotion follows `/theme` automatically instead of pinning
 * one hardcoded grey for all 35 presets.
 *
 * Non-comment tokens pass through unchanged so the rest of the line keeps its
 * syntax palette on the wash.
 *
 * Exported for unit testing — `renderTokens` calls it before mapping to
 * `<Text>` elements so the override logic itself stays a pure function.
 */
export function applyWashTokens(tokens: Token[], onWash: boolean): Token[] {
  if (!onWash) return tokens;
  return tokens.map((t) => {
    if (t.color !== 'syntax.comment') return t;
    return { ...t, color: 'syntax.commentOnWash', dim: false };
  });
}

/**
 * Render highlight tokens as nested `<Text>` segments. Tokens without a
 * color inherit the enclosing default foreground, so the same token list
 * reads correctly both on the plain background (context lines) and on the
 * dark add/del washes. `onWash` switches into "sitting on a dark
 * green/maroon diff wash" mode — see {@link applyWashTokens} for the
 * contrast rationale and the override rules.
 */
function renderTokens(tokens: Token[], onWash: boolean = false): React.ReactNode {
  const effective = applyWashTokens(tokens, onWash);
  if (effective.length === 0) return ' ';
  return effective.map((t, j) => (
    <Text
      key={j}
      dimColor={Boolean(t.dim)}
      bold={Boolean(t.bold)}
      {...(t.color ? { color: t.color } : {})}
    >
      {t.text}
    </Text>
  ));
}

/**
 * Hard-wrap a highlighted token stream into segments of at most `width`
 * display characters. Splitting happens on the token list (not the raw
 * string) so a token that straddles the boundary keeps its color/style on
 * both sides. Always returns at least one segment so empty rows still
 * render as a (blank) line.
 */
function wrapTokens(tokens: Token[], width: number): Token[][] {
  if (width <= 0) return [tokens];
  const segments: Token[][] = [];
  let current: Token[] = [];
  let currentWidth = 0;
  for (const t of tokens) {
    let text = t.text;
    while (text.length > 0) {
      const room = width - currentWidth;
      if (room <= 0) {
        segments.push(current);
        current = [];
        currentWidth = 0;
        continue;
      }
      const [piece, rest] = splitDisplay(text, room);
      if (!piece) {
        segments.push(current);
        current = [];
        currentWidth = 0;
        continue;
      }
      current.push({ ...t, text: piece });
      currentWidth += displayWidth(piece);
      text = rest;
    }
  }
  if (current.length > 0 || segments.length === 0) segments.push(current);
  return segments;
}

export function DiffBlock({
  rows,
  hidden,
  added = 0,
  removed = 0,
  hiddenAdded = 0,
  hiddenRemoved = 0,
  useColor = true,
  lang = 'plain',
  showStats = true,
  contentWidth,
}: {
  rows: DiffLineRow[];
  hidden: number;
  /**
   * Total lines added across the whole diff (not just the visible slice).
   * Surfaced in the `⎿  Added N lines, removed M lines` stats line so the
   * reader knows the change size even when the body is truncated.
   */
  added?: number | undefined;
  /** Total lines removed across the whole diff (not just the visible slice). */
  removed?: number | undefined;
  hiddenAdded?: number | undefined;
  hiddenRemoved?: number | undefined;
  /**
   * When true (default), added/removed rows get a dark green/maroon
   * background wash (Claude Code style) with normal-brightness,
   * syntax-highlighted foreground text. When false, only the `+`/`-`
   * markers get colored (bright green/red, bold) so the diff stays
   * readable on terminals that don't support truecolor backgrounds
   * (TERM=xterm, `NO_COLOR=1`, etc.). Pass `theme.supportsBackground`
   * from the entry-point.
   */
  useColor?: boolean | undefined;
  /**
   * Syntax-highlight language for line bodies (derive from the touched
   * file's extension via `langFromPath`). `plain` disables highlighting.
   */
  lang?: Lang | undefined;
  /**
   * Render the leading `⎿  Added N lines, removed M lines` stats line.
   * Callers that print their own header/stats (e.g. the Update(path)
   * entry header) pass `false` to avoid the duplicate.
   */
  showStats?: boolean | undefined;
  /**
   * Terminal width available to this block. Line bodies longer than the
   * remaining budget hard-wrap onto continuation rows (blank gutter, blank
   * marker cell, same background wash) so the full line content is always
   * visible without ever flowing under the gutter. When omitted, wrapping
   * falls back to a 100-char budget.
   */
  contentWidth?: number | undefined;
}): React.ReactElement {
  // Single-column gutter (Claude Code style): each row shows ONE line
  // number — the old line for deletions, the new line for additions and
  // context.
  const lineNoOf = (row: DiffLineRow): number | undefined =>
    row.kind === 'del' ? row.oldLine : (row.newLine ?? row.oldLine);
  let gutterWidth = 1;
  for (const r of rows) {
    const n = lineNoOf(r);
    if (typeof n === 'number' && String(n).length > gutterWidth) gutterWidth = String(n).length;
  }
  const blank = ' '.repeat(gutterWidth);

  const markerFor = (kind: DiffLineKind) => {
    if (kind === 'add') return '+';
    if (kind === 'del') return '-';
    return ' ';
  };

  const textForDisplay = (row: DiffLineRow) => {
    // Expand hard tabs to spaces so tab-indented lines (Go, Makefiles, …)
    // render with painted background under their indentation and don't
    // overshoot the wrap/pad budget — see {@link expandTabs}.
    if ((row.kind === 'add' || row.kind === 'del' || row.kind === 'ctx') && row.text.length > 0) {
      return sanitizeTerminalText(expandTabs(row.text.slice(1)), HARD_TAB_WIDTH) || ' ';
    }
    return sanitizeTerminalText(expandTabs(row.text), HARD_TAB_WIDTH) || ' ';
  };

  const stats = showStats ? formatDiffStats(added, removed) : null;

  // Row anatomy: box margin (2) + `   ` prefix (3) + line number + ` X `
  // marker cell (3). Keep one terminal column as a wrap guard when the width
  // is known: writing a printable trailing-space background into the final
  // column can leave some terminals in pending-wrap state, so the next reset /
  // newline appears as a visual spill even though the measured string is
  // exactly `contentWidth` wide.
  const terminalWrapGuard = typeof contentWidth === 'number' ? 1 : 0;
  const bodyBudget =
    typeof contentWidth === 'number'
      ? Math.max(1, contentWidth - (2 + 3 + gutterWidth + 3 + terminalWrapGuard))
      : DIFF_FALLBACK_WRAP_WIDTH;
  // When the width is known, the add/del wash pads its body out to the guarded
  // `bodyBudget` with trailing spaces so the dark green/maroon background
  // spans almost the whole line without touching the terminal's last column.
  // This is required because Ink only paints a background behind actual
  // characters (a `<Text backgroundColor>` colours its trailing spaces; a
  // `<Box backgroundColor>` does NOT fill the empty area), so the wash needs
  // real padding chars. The approval-dialog path (no contentWidth) skips the
  // padding to avoid over-wide rows in the bordered confirm box.
  const hasWidth = typeof contentWidth === 'number';
  const padBody = (seg: Token[]): number => {
    if (!hasWidth) return 0;
    const len = seg.reduce((n, t) => n + displayWidth(t.text), 0);
    return Math.max(0, bodyBudget - len);
  };
  // Continuation-row prefix: same width as `   ${ln} X ` so wrapped
  // segments line up with the first segment's body column.
  const contPrefix = `   ${blank}   `;

  const hiddenStats: string[] = [];
  if (hiddenAdded > 0) hiddenStats.push(`+${hiddenAdded}`);
  if (hiddenRemoved > 0) hiddenStats.push(`-${hiddenRemoved}`);

  return (
    <Box flexDirection="column" marginLeft={2} marginTop={0}>
      {stats ? (
        <Text>
          <Text dimColor>{'⎿  '}</Text>
          <Text>{stats}</Text>
        </Text>
      ) : null}
      {rows.map((row, i) => {
        const key = i;
        if (row.kind === 'hunk') {
          // Claude Code hides hunk headers — the line numbers already carry
          // position. A leading hunk renders nothing; between hunks a dim
          // `⋯` marks the gap.
          if (i === 0) return null;
          return (
            <Text key={key} dimColor>
              {`   ${blank} ⋯`}
            </Text>
          );
        }
        if (row.kind === 'meta') {
          return (
            <Text key={key} dimColor>
              {`   ${blank}   ${sanitizeTerminalText(row.text)}`}
            </Text>
          );
        }
        const n = lineNoOf(row);
        const ln = typeof n === 'number' ? String(n).padStart(gutterWidth, ' ') : blank;
        const body = textForDisplay(row);
        // Fresh highlight state per row: diff rows are disjoint slices of
        // the file, so carrying block-comment state across add/del pairs
        // would color the wrong lines.
        const tokens = highlightLine(body, lang).tokens;
        // Long lines hard-wrap onto continuation rows (blank gutter, blank
        // marker cell) instead of being mid-line truncated — the full line
        // content always renders.
        const segments = wrapTokens(tokens, bodyBudget);
        if (row.kind === 'ctx') {
          return (
            <Box key={key} flexDirection="column">
              {segments.map((seg, si) => (
                <Text key={si}>
                  <Text dimColor>{si === 0 ? `   ${ln}   ` : contPrefix}</Text>
                  {renderTokens(seg)}
                </Text>
              ))}
            </Box>
          );
        }
        const marker = markerFor(row.kind);
        const markerColor = row.kind === 'add' ? theme.success : theme.error;
        // Truecolor path: the whole row (number + marker + body) sits on a
        // dark green/maroon wash; the body keeps its syntax colors, which
        // stay readable on the dark tint. Fallback path: no wash, the bold
        // colored marker alone distinguishes add vs del.
        if (useColor) {
          const bg = row.kind === 'add' ? theme.diffAddBg : theme.diffDelBg;
          // Wash lives on the <Text> (not the parent <Box>): Ink paints a
          // background behind characters only, so the whole line — prefix,
          // marker, syntax-highlighted body and the trailing pad — must sit
          // inside one background <Text> for the wash to reach the edge.
          //
          // `onWash: true` lets `renderTokens` promote comment tokens off
          // dim/gray — see {@link renderTokens}. Without that promotion the
          // dim-gray comment collapses into the dark green/maroon wash and
          // becomes unreadable.
          return (
            <Box key={key} flexDirection="column">
              {segments.map((seg, si) => {
                const pad = padBody(seg);
                return (
                  <Text key={si} backgroundColor={bg}>
                    {si === 0 ? (
                      <>
                        <Text dimColor>{`   ${ln} `}</Text>
                        <Text color={markerColor} bold>
                          {marker}
                        </Text>
                        <Text> </Text>
                      </>
                    ) : (
                      <Text dimColor>{contPrefix}</Text>
                    )}
                    {renderTokens(seg, true)}
                    {pad > 0 ? <Text>{' '.repeat(pad)}</Text> : null}
                  </Text>
                );
              })}
            </Box>
          );
        }
        return (
          <Box key={key} flexDirection="column">
            {segments.map((seg, si) => (
              <Text key={si}>
                {si === 0 ? (
                  <>
                    <Text dimColor>{`   ${ln} `}</Text>
                    <Text color={markerColor} bold>
                      {marker}
                    </Text>
                    <Text> </Text>
                  </>
                ) : (
                  <Text dimColor>{contPrefix}</Text>
                )}
                {renderTokens(seg)}
              </Text>
            ))}
          </Box>
        );
      })}
      {hidden > 0 ? (
        <Text dimColor italic>
          {`   ${blank}  … ${hidden} more line${hidden === 1 ? '' : 's'}${
            hiddenStats.length > 0 ? ` (${hiddenStats.join(' ')} hidden)` : ''
          }`}
        </Text>
      ) : null}
    </Box>
  );
}

/**
 * Syntax-highlighted code / diff block.
 *
 * Memoized: highlighting is the single most expensive thing in the transcript,
 * and a completed fence never changes again while later text streams in.
 */
export const CodeBlock = memo(CodeBlockImpl);
