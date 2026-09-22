import type { Action } from '../app-action-type.js';
import type { State } from '../app-state.js';
import { findTranscriptMatches, stepTranscriptMatch } from '../transcript-search.js';

const chatSearchActionTypes = [
  'chatSearchOpen',
  'chatSearchSetQuery',
  'chatSearchStep',
  'chatSearchClose',
] as const satisfies readonly Action['type'][];

type ChatSearchAction = Extract<Action, { type: (typeof chatSearchActionTypes)[number] }>;

const chatSearchActionTypeSet: ReadonlySet<Action['type']> = new Set(chatSearchActionTypes);

export function isChatSearchAction(action: Action): action is ChatSearchAction {
  return chatSearchActionTypeSet.has(action.type);
}

/**
 * Select the newest match for `query` and request a jump to it. `jumpSeq`
 * increments whenever the selection should scroll into view, so the view
 * re-scrolls even when the same entry is selected again (e.g. after the user
 * scrolled away and pressed Enter on a single-match query).
 */
function withQuery(
  state: State,
  query: string,
  includeReasoning: boolean,
  jumpSeq: number,
): State['chatSearch'] {
  const matches = findTranscriptMatches(state.entries, query, { includeReasoning });
  const selectedEntryId = matches[matches.length - 1]?.entryId ?? null;
  return {
    query,
    selectedEntryId,
    jumpSeq: selectedEntryId === null ? jumpSeq : jumpSeq + 1,
  };
}

/** Transcript search bar (Alt+F / `/chat-search`). */
export function reduceChatSearch(state: State, action: ChatSearchAction): State {
  switch (action.type) {
    case 'chatSearchOpen': {
      const jumpSeq = state.chatSearch?.jumpSeq ?? 0;
      const query = action.query ?? state.chatSearch?.query ?? '';
      return {
        ...state,
        inspectOverlay: null,
        chatSearch: withQuery(state, query, action.includeReasoning, jumpSeq),
      };
    }
    case 'chatSearchSetQuery': {
      if (!state.chatSearch || state.chatSearch.query === action.query) return state;
      return {
        ...state,
        chatSearch: withQuery(
          state,
          action.query,
          action.includeReasoning,
          state.chatSearch.jumpSeq,
        ),
      };
    }
    case 'chatSearchStep': {
      const search = state.chatSearch;
      if (!search) return state;
      const matches = findTranscriptMatches(state.entries, search.query, {
        includeReasoning: action.includeReasoning,
      });
      const selectedEntryId = stepTranscriptMatch(matches, search.selectedEntryId, action.delta);
      if (selectedEntryId === null) return state;
      return {
        ...state,
        chatSearch: { ...search, selectedEntryId, jumpSeq: search.jumpSeq + 1 },
      };
    }
    case 'chatSearchClose':
      return state.chatSearch ? { ...state, chatSearch: null } : state;
  }
}
