/**
 * Pure transcript search over the retained history entries.
 *
 * The search runs over the same lossless text a card's copy icon writes to
 * the clipboard, so a hit is always something the user can see or copy.
 * Cards whose only representation is raw JSON (banner, confirm, model
 * switch, memory activation) are skipped: matching their field names would
 * be noise. Entries evicted by history retention are not searched.
 *
 * No React, no Ink — the reducer calls it on every query keystroke.
 */
import { copyableTextForEntry } from './components/history/copy-icon.js';
import type { HistoryEntry } from './history-entry.js';

/** One match per entry: the first hit inside that entry's text. */
export interface TranscriptMatch {
  entryId: number;
  /** The line containing the first hit, untrimmed. */
  line: string;
  /** Code-unit offset of the hit inside {@link line}. */
  column: number;
  /** Code-unit length of the hit. */
  length: number;
}

export interface TranscriptSearchOptions {
  /** Thinking cards are hidden unless model reasoning is shown. */
  includeReasoning: boolean;
}

/** Per-entry text is capped so one huge tool result cannot stall a keystroke. */
export const MAX_SEARCH_CHARS_PER_ENTRY = 200_000;

const textCache = new WeakMap<HistoryEntry, { text: string; lower: string }>();

function searchableText(entry: HistoryEntry): { text: string; lower: string } | null {
  switch (entry.kind) {
    case 'banner':
    case 'confirm':
    case 'model-switch':
    case 'memory-activation':
      return null;
    default:
      break;
  }
  const cached = textCache.get(entry);
  if (cached) return cached;
  let text = copyableTextForEntry(entry);
  if (entry.kind === 'tool') text = `${entry.name}\n${text}`;
  if (text.length > MAX_SEARCH_CHARS_PER_ENTRY) text = text.slice(0, MAX_SEARCH_CHARS_PER_ENTRY);
  const value = { text, lower: text.toLowerCase() };
  textCache.set(entry, value);
  return value;
}

/** Smart case: an all-lowercase query matches case-insensitively. */
function isCaseSensitive(query: string): boolean {
  return query !== query.toLowerCase();
}

function lineAround(text: string, index: number, length: number): Omit<TranscriptMatch, 'entryId'> {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const newline = text.indexOf('\n', index + length);
  const end = newline === -1 ? text.length : newline;
  return { line: text.slice(start, end), column: index - start, length };
}

/** Matches in transcript order (oldest first), at most one per entry. */
export function findTranscriptMatches(
  entries: readonly HistoryEntry[],
  query: string,
  options: TranscriptSearchOptions,
): TranscriptMatch[] {
  if (query.trim() === '') return [];
  const caseSensitive = isCaseSensitive(query);
  const needle = caseSensitive ? query : query.toLowerCase();
  const matches: TranscriptMatch[] = [];
  for (const entry of entries) {
    if (entry.kind === 'thinking' && !options.includeReasoning) continue;
    const searchable = searchableText(entry);
    if (!searchable) continue;
    const haystack = caseSensitive ? searchable.text : searchable.lower;
    const index = haystack.indexOf(needle);
    if (index === -1) continue;
    // A multi-line query keeps its first line as the displayed hit.
    const firstLineLength = needle.includes('\n') ? needle.indexOf('\n') : needle.length;
    matches.push({ entryId: entry.id, ...lineAround(searchable.text, index, firstLineLength) });
  }
  return matches;
}

/**
 * Next selected entry after moving `delta` matches: -1 = older, +1 = newer.
 * Wraps at both ends. A selection that is no longer a match (retention
 * evicted it, or the query changed) restarts from the newest match.
 */
export function stepTranscriptMatch(
  matches: readonly TranscriptMatch[],
  selectedEntryId: number | null,
  delta: -1 | 1,
): number | null {
  if (matches.length === 0) return null;
  const current = matches.findIndex((m) => m.entryId === selectedEntryId);
  if (current === -1) return matches[matches.length - 1]?.entryId ?? null;
  const next = (current + delta + matches.length) % matches.length;
  return matches[next]?.entryId ?? null;
}

/**
 * Fit a match line into `width` columns, keeping the hit visible. Returns the
 * three display segments; an ellipsis marks each trimmed side. Widths are
 * counted in code units, which is exact for the ASCII-dominant transcript
 * text and conservative (never overflowing) for wide glyphs after the
 * caller's own display-width truncation.
 */
export function transcriptMatchSnippet(
  match: Pick<TranscriptMatch, 'line' | 'column' | 'length'>,
  width: number,
): { before: string; hit: string; after: string } {
  const line = match.line.replace(/\t/g, ' ');
  const hitEnd = match.column + match.length;
  const budget = Math.max(match.length + 2, width);
  if (line.length <= budget) {
    return {
      before: line.slice(0, match.column),
      hit: line.slice(match.column, hitEnd),
      after: line.slice(hitEnd),
    };
  }
  const context = Math.max(0, budget - match.length);
  let start = Math.max(0, match.column - Math.floor(context / 3));
  const end = Math.min(line.length, start + budget);
  start = Math.max(0, end - budget);
  const leftCut = start > 0;
  const rightCut = end < line.length;
  const before = line.slice(start + (leftCut ? 1 : 0), match.column);
  const after = line.slice(hitEnd, end - (rightCut ? 1 : 0));
  return {
    before: `${leftCut ? '…' : ''}${before}`,
    hit: line.slice(match.column, hitEnd),
    after: `${after}${rightCut ? '…' : ''}`,
  };
}
