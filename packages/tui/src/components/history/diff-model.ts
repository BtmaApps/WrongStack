/**
 * Pure diff model for tool-result cards: per-file preview types, render
 * ceilings, multi-file rollups and extraction from tool output. No Ink or
 * React — `code-block.tsx` renders it and re-exports it.
 */
import { type DiffPreview, parseUnifiedDiffPreview } from '@wrongstack/tools/tool-diff';
import {
  collectMultiFileDiffItems,
  countUnifiedDiffChanges,
  extractUnifiedDiffText,
  joinReplaceDiffs,
  newFileDiffFromWriteInput,
} from './code-block-diff-helpers.js';
import { stringOf, tryParseJson } from './utils.js';

export type { DiffLineKind, DiffLineRow, DiffPreview } from '@wrongstack/tools/tool-diff';

/**
 * A parsed diff paired with the file it belongs to. Used when a tool
 * produces diffs for several files at once (currently `replace`); each
 * `DiffFilePreview` renders as one labeled `DiffFileBlock`.
 */
export interface DiffFilePreview {
  path: string;
  preview: DiffPreview;
}

interface OmittedDiffSummary {
  fileCount: number;
  added: number;
  removed: number;
}

/** Renderable file previews plus aggregate data for files omitted by the cap. */
export type DiffFilePreviews = DiffFilePreview[] & {
  omitted?: OmittedDiffSummary | undefined;
};

/**
 * Hard ceiling for one file's rendered diff preview. Diff rows are React/Ink
 * elements and therefore retained by the active virtual-history window; an
 * unbounded preview lets a single generated-file edit defeat virtualization.
 * Totals for the whole diff remain available through `added`/`removed`, while
 * the footer reports the hidden portion.
 */
export const DIFF_MAX_LINES = 200;
/** Maximum number of per-file diff blocks retained for one tool entry. */
export const MULTI_DIFF_MAX_FILES = 20;
/** Maximum rendered diff rows retained across every file in one tool entry. */
export const MULTI_DIFF_MAX_ROWS = 400;

/**
 * Minimum number of files before a summary footer is rendered above the
 * per-file blocks. Below this threshold each file's own `… +N -M hidden`
 * footer carries enough signal; above it, a single aggregate line keeps
 * the screen from being drowned in per-file tail lines.
 *
 * This is the default when no user-tunable value is supplied. The
 * settings picker exposes `MULTI_DIFF_SUMMARY_THRESHOLD_PRESETS` so
 * users can raise the cutoff (e.g. for very wide terminals) or lower
 * it (e.g. for tiny scrollback), or set it to 0 to suppress the
 * summary entirely.
 */
export const MULTI_DIFF_SUMMARY_THRESHOLD = 5;

/**
 * Aggregate stats across a list of per-file diffs — used to print a
 * single summary line at the top of a multi-file diff view when there
 * are enough files to make the rollup useful.
 */
export interface MultiDiffSummary {
  fileCount: number;
  added: number;
  removed: number;
  hiddenAdded: number;
  hiddenRemoved: number;
  /** Number of rendered files whose preview was truncated (has hidden rows).
   *  Does not include files omitted entirely by the multi-file render ceiling;
   *  those are tracked separately via {@link omittedFiles}. */
  truncatedFiles: number;
  /** Files omitted entirely by the multi-file render ceiling. Guaranteed non-negative. */
  omittedFiles: number;
}

/**
 * Sum the totals of a list of per-file diff previews. Files that were
 * parsed but have no rows (e.g. entirely empty after the no-op skip) are
 * excluded from the rollup so the summary reflects what the user will
 * actually see rendered below.
 */
export function summarizeMultiFileDiffs(items: DiffFilePreviews): MultiDiffSummary {
  let added = 0;
  let removed = 0;
  let hiddenAdded = 0;
  let hiddenRemoved = 0;
  let truncatedFiles = 0;
  for (const item of items) {
    added += item.preview.added;
    removed += item.preview.removed;
    hiddenAdded += item.preview.hiddenAdded;
    hiddenRemoved += item.preview.hiddenRemoved;
    if (item.preview.hidden > 0) truncatedFiles += 1;
  }
  const omitted = items.omitted;
  if (omitted) {
    added += omitted.added;
    removed += omitted.removed;
  }
  return {
    fileCount: items.length + (omitted?.fileCount ?? 0),
    added,
    removed,
    hiddenAdded,
    hiddenRemoved,
    truncatedFiles,
    omittedFiles: omitted?.fileCount ?? 0,
  };
}

/**
 * Format a multi-file diff summary as a single dim italic line, suitable
 * for rendering above the per-file blocks. Mirrors the per-file footer's
 * `… +N -M hidden` shape so a reader who has seen the footer recognises
 * the format. Returns `null` when there's nothing useful to surface
 * (no files, or below the user's threshold where the per-file footer
 * already covers the rollup).
 *
 * @param threshold User-tunable cutoff. Pass `MULTI_DIFF_SUMMARY_THRESHOLD`
 *   for the default behaviour, `0` to suppress the summary entirely
 *   (always returns null), or a positive number to set a custom cutoff.
 *   A negative value is treated as "use default" so callers can pass an
 *   `undefined`-coerced settings value without a separate branch.
 */
export function formatMultiDiffSummary(
  summary: MultiDiffSummary,
  threshold: number = MULTI_DIFF_SUMMARY_THRESHOLD,
): string | null {
  if (threshold === 0) return null;
  const effectiveThreshold = threshold < 0 ? MULTI_DIFF_SUMMARY_THRESHOLD : threshold;
  if (summary.fileCount < effectiveThreshold) return null;
  const parts: string[] = [`${summary.fileCount} files`];
  if (summary.added > 0) parts.push(`+${summary.added}`);
  if (summary.removed > 0) parts.push(`-${summary.removed}`);
  if (summary.hiddenAdded > 0 || summary.hiddenRemoved > 0) {
    const hiddenParts: string[] = [];
    if (summary.hiddenAdded > 0) hiddenParts.push(`+${summary.hiddenAdded}`);
    if (summary.hiddenRemoved > 0) hiddenParts.push(`-${summary.hiddenRemoved}`);
    parts.push(
      `… ${hiddenParts.join(' ')} hidden across ${summary.truncatedFiles} file${summary.truncatedFiles === 1 ? '' : 's'}`,
    );
  }
  const omittedFiles = summary.omittedFiles ?? 0;
  if (omittedFiles > 0) {
    parts.push(`${omittedFiles} more file${omittedFiles === 1 ? '' : 's'} not rendered`);
  }
  return parts.join(' · ');
}

/**
 * Human-readable change-size line for a diff — `Added N lines, removed M
 * lines` (Claude Code phrasing). Omits the zero side; returns `null` when
 * nothing changed so callers can skip the line entirely.
 */
export function formatDiffStats(added: number, removed: number): string | null {
  const parts: string[] = [];
  if (added > 0) parts.push(`added ${added} line${added === 1 ? '' : 's'}`);
  if (removed > 0) parts.push(`removed ${removed} line${removed === 1 ? '' : 's'}`);
  if (parts.length === 0) return null;
  const joined = parts.join(', ');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

// ── Diff parsing ──

/**
 * Parse a unified-diff string into a {@link DiffPreview}. Thin wrapper over the
 * shared, single-source-of-truth `parseUnifiedDiffPreview` in
 * @wrongstack/tools/tool-diff (which the WebUI and HQ also read). Kept as a
 * local export so this module's many callers and tests are unchanged.
 */
export function parseUnifiedDiff(diff: string, maxLines: number): DiffPreview {
  return parseUnifiedDiffPreview(diff, maxLines);
}

/**
 * Pull a unified-diff string out of a tool's JSON output, then turn it
 * into a small, structured preview suitable for colour-coded rendering.
 */
export function extractDiffPreview(
  toolName: string,
  output: string | undefined,
  input?: unknown | undefined,
): DiffPreview | undefined {
  if (!output) return undefined;
  const text = output.trim();
  if (!text) return undefined;

  let diff: string | undefined;
  if (toolName === 'edit' || toolName === 'diff' || toolName === 'write') {
    const parsed = tryParseJson(text);
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      diff =
        toolName === 'write' && obj['created'] === true
          ? (newFileDiffFromWriteInput(obj, input) ?? stringOf(obj['diff']))
          : stringOf(obj['diff']);
    } else {
      // The tool-output serializer renders edit/diff/write results as a
      // human-readable string (a header line such as
      // `edit (path=… replacements=1)` followed by the raw unified diff),
      // NOT as JSON. When JSON parsing fails, recover the diff body by
      // slicing from the first real diff marker so the DiffBlock renders
      // instead of falling back to a flat plain-text view.
      diff = extractUnifiedDiffText(text);
    }
  } else if (toolName === 'patch') {
    const parsed = tryParseJson(text);
    if (parsed && typeof parsed === 'object') {
      diff =
        stringOf((parsed as Record<string, unknown>)['diff']) ??
        stringOf((parsed as Record<string, unknown>)['stdout']);
    } else if (text.includes('@@') || text.startsWith('---')) {
      diff = text;
    }
  } else if (toolName === 'replace') {
    const parsed = tryParseJson(text);
    if (parsed && typeof parsed === 'object') {
      diff = joinReplaceDiffs(parsed as Record<string, unknown>);
    }
  }

  if (!diff?.trim() || diff.startsWith('(no-op')) return undefined;
  const preview = parseUnifiedDiff(diff, DIFF_MAX_LINES);
  return preview.rows.length > 0 ? preview : undefined;
}

/**
 * Pull one diff preview per file from a `replace` tool result. Each entry
 * has a `path` (best-effort: `results[i].path`, falling back to the input
 * argument when every result is for the same file) and a `preview` ready
 * for `DiffFileBlock` / `DiffBlock` rendering.
 *
 * Returns `undefined` when no per-file diff is recoverable (e.g. an empty
 * `results` array, no diff fields, or the result isn't a JSON object).
 *
 * Note: For a single entry point that handles `replace`, `diff`, and
 * `patch` (the three tools whose output can span multiple files), use
 * {@link extractMultiFileDiffs} instead — this function is kept for the
 * narrower replace-specific test cases.
 */
export function extractReplaceDiffs(
  toolName: string,
  output: string | undefined,
  input?: unknown | undefined,
): DiffFilePreviews | undefined {
  if (toolName !== 'replace') return undefined;
  return extractMultiFileDiffs(toolName, output, input);
}

/**
 * Pull a list of per-file diffs from a tool result that may span multiple
 * files. Handles:
 *
 * - `replace`: JSON `{ results: [{ path, diff }, …] }` (path per result,
 *   fallback to the input path when the result omits one).
 * - `diff`: JSON `{ diff: string }` where `diff` is a git-style multi-file
 *   unified diff (split on `diff --git` headers).
 * - `patch`: either JSON `{ diff: string, files: string[] }` or a raw
 *   unified-diff string (split on `diff --git` headers, falling back to
 *   `--- a/<path>` if no `diff --git` is present).
 *
 * Returns `undefined` when the tool isn't multi-file capable, the output
 * is missing/unparseable, or no per-file diff is recoverable. Returns an
 * empty array (not undefined) when the output parses but every entry has
 * an empty diff after trimming — the caller treats both as "nothing to
 * render" but the distinction is useful in tests.
 */
export function extractMultiFileDiffs(
  toolName: string,
  output: string | undefined,
  input?: unknown | undefined,
): DiffFilePreviews | undefined {
  if (!output) return undefined;
  const items = collectMultiFileDiffItems(toolName, output, input);
  if (items === undefined) return undefined;
  if (items.length === 0) return undefined;

  const previews: DiffFilePreviews = [];
  const candidateItems = items.slice(0, MULTI_DIFF_MAX_FILES);
  let remainingRows = MULTI_DIFF_MAX_ROWS;
  let visited = 0;
  for (const item of candidateItems) {
    if (remainingRows <= 0) break;
    visited++;
    const preview = parseUnifiedDiff(item.diff, Math.min(DIFF_MAX_LINES, remainingRows));
    if (preview.rows.length === 0) continue;
    previews.push({ path: item.path ?? 'unknown file', preview });
    remainingRows -= preview.rows.length;
  }
  const omittedItems = items.slice(visited);
  if (omittedItems.length > 0) {
    let added = 0;
    let removed = 0;
    for (const item of omittedItems) {
      const summary = countUnifiedDiffChanges(item.diff);
      added += summary.added;
      removed += summary.removed;
    }
    previews.omitted = { fileCount: omittedItems.length, added, removed };
  }
  return previews.length > 0 ? previews : undefined;
}
