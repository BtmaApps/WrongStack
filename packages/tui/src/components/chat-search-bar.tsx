import type React from 'react';
import { memo, useMemo } from 'react';
import type { State } from '../app-state.js';
import type { HistoryEntry } from '../history-entry.js';
import { useActiveTheme } from '../hooks/use-active-theme.js';
import { Box, Text } from '../ink.js';
import { displayWidth, sanitizeTerminalText, truncateDisplay } from '../terminal-width.js';
import { theme } from '../theme.js';
import { findTranscriptMatches, transcriptMatchSnippet } from '../transcript-search.js';

/** Rows the bar always occupies, so the history viewport never jumps. */
export const CHAT_SEARCH_BAR_ROWS = 2;

const KEY_HINT = '↑/Enter older · ↓ newer · Ctrl+U clear · Esc close';

interface ChatSearchBarProps {
  search: NonNullable<State['chatSearch']>;
  entries: readonly HistoryEntry[];
  includeReasoning: boolean;
  width: number;
}

function oneLine(text: string): string {
  return sanitizeTerminalText(text).replace(/\n/g, ' ');
}

/**
 * Transcript search bar shown above the composer while Alt+F search is open.
 * Row 1: query, match position and key hints. Row 2: the selected match's
 * line with the hit highlighted (or guidance when there is nothing to show).
 */
export const ChatSearchBar = memo(function ChatSearchBar({
  search,
  entries,
  includeReasoning,
  width,
}: ChatSearchBarProps): React.ReactElement {
  useActiveTheme();
  const matches = useMemo(
    () => findTranscriptMatches(entries, search.query, { includeReasoning }),
    [entries, search.query, includeReasoning],
  );
  const position = matches.findIndex((m) => m.entryId === search.selectedEntryId);
  const selected = position >= 0 ? matches[position] : undefined;
  const inner = Math.max(8, width - 2);

  const label = '⌕ Search chat ';
  const count =
    search.query.trim() === ''
      ? ''
      : matches.length === 0
        ? ' no matches'
        : ` ${position >= 0 ? position + 1 : '–'}/${matches.length}`;
  const queryWidth = Math.max(1, inner - displayWidth(label) - displayWidth(count) - 1);
  const query = truncateDisplay(oneLine(search.query), queryWidth);
  const hintRoom = inner - displayWidth(label) - displayWidth(query) - 1 - displayWidth(count);
  const hint = hintRoom > displayWidth(KEY_HINT) + 3 ? `   ${KEY_HINT}` : '';

  let detail: React.ReactElement;
  if (selected) {
    const snippet = transcriptMatchSnippet(selected, inner);
    const hit = truncateDisplay(oneLine(snippet.hit), inner);
    const beforeRoom = Math.max(0, inner - displayWidth(hit));
    const before = truncateDisplay(oneLine(snippet.before), beforeRoom);
    const afterRoom = Math.max(0, beforeRoom - displayWidth(before));
    const after = truncateDisplay(oneLine(snippet.after), afterRoom);
    detail = (
      <Text wrap="truncate">
        <Text color={theme.textMuted}>{before}</Text>
        <Text color={theme.accent} bold inverse>
          {hit}
        </Text>
        <Text color={theme.textMuted}>{after}</Text>
      </Text>
    );
  } else {
    const guidance =
      search.query.trim() === ''
        ? 'Type to search the retained chat history.'
        : matches.length === 0
          ? 'No retained message, tool result or note contains this text.'
          : KEY_HINT;
    detail = (
      <Text color={theme.textMuted} wrap="truncate">
        {truncateDisplay(guidance, inner)}
      </Text>
    );
  }

  return (
    <Box flexDirection="column" flexShrink={0} width={width} paddingX={1}>
      <Text wrap="truncate">
        <Text color={theme.accent} bold>
          {label}
        </Text>
        <Text color={theme.textPrimary}>{query}</Text>
        <Text color={theme.accent}>▌</Text>
        <Text color={matches.length === 0 && count ? theme.warn : theme.textSecondary}>
          {count}
        </Text>
        <Text color={theme.textMuted}>{hint}</Text>
      </Text>
      {detail}
    </Box>
  );
});
