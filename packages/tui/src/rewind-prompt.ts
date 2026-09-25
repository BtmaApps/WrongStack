import type { RewoundConversation } from '@wrongstack/core/storage';
import type { Action } from './app-action-type.js';
import { replaySessionMessages } from './components/history/replay.js';

const NOTE_PREVIEW = 200;

/**
 * After a rewind or a fork, hand the prompt that was taken back to the user
 * to edit and send again.
 *
 * Both wipe the composer (a rewind clears the transcript view, a fork
 * resumes another session), so the draft from before is passed in. A draft
 * wins over the prompt: it is what the user was typing, and losing it to a
 * rewind was a bug of its own. The prompt is then shown as a note instead.
 */
export function restoreRewoundPrompt(
  dispatch: (action: Action) => void,
  draftBefore: string,
  promptText: string | undefined,
): void {
  const prompt = promptText?.trim() ? promptText : undefined;
  if (draftBefore.trim()) {
    dispatch({ type: 'setBuffer', buffer: draftBefore, cursor: draftBefore.length });
    if (prompt) {
      const preview = prompt.length > NOTE_PREVIEW ? `${prompt.slice(0, NOTE_PREVIEW)}…` : prompt;
      dispatch({
        type: 'addEntry',
        entry: {
          kind: 'info',
          text: `Your draft was kept; the prompt that was taken back was:\n${preview}`,
        },
      });
    }
    return;
  }
  if (prompt) dispatch({ type: 'setBuffer', buffer: prompt, cursor: prompt.length });
}

/**
 * Redraw the transcript from the conversation a rewind or redo left. The
 * rewind event clears the screen; without this the turns that survived the
 * rewind vanished from view while the model still had them.
 */
export function showConversation(
  dispatch: (action: Action) => void,
  conversation: RewoundConversation,
): void {
  const entries = replaySessionMessages(conversation.messages, conversation.events, 1);
  dispatch({ type: 'replaceHistory', entries, nextId: entries.length + 1 });
}

/** After a rewind: the surviving turns on screen, the prompt back in the composer. */
export function showRewind(
  dispatch: (action: Action) => void,
  draftBefore: string,
  outcome: { promptText?: string | undefined; conversation?: RewoundConversation | undefined },
): void {
  if (outcome.conversation) showConversation(dispatch, outcome.conversation);
  restoreRewoundPrompt(dispatch, draftBefore, outcome.promptText);
}
