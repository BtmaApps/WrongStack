/**
 * Transcript search bar keys (Alt+F / `/chat-search`).
 *
 * While the bar is open it owns text entry: typing edits the query and never
 * reaches the composer draft. Scrolling (wheel, mouse, PgUp/PgDn), function
 * keys and Ctrl+C keep their normal routes, so the user can still page
 * around the transcript or open a panel with the bar visible.
 */

import type { KeyEvent } from '../components/input.js';
import { previousGraphemeIndex } from '../input-graphemes.js';
import type { KeyRouteContext } from '../key-handler-context.js';
import { checkpointForMessage } from '../message-checkpoint.js';

/** Thinking cards are only searchable while they are shown. */
export function chatSearchIncludesReasoning(ctx: Pick<KeyRouteContext, 'getSettings'>): boolean {
  return ctx.getSettings?.()?.showModelReasoning ?? true;
}

/** Printable text from one key event; control and escape sequences drop out. */
function printable(input: string): string {
  if (input.includes('\x1b')) return '';
  return input.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').replace(/[\r\n\t]+/g, ' ');
}

function isAltF(input: string, key: KeyEvent): boolean {
  return key.meta && !key.ctrl && (input === 'f' || input === 'F');
}

/** Returns true when the key was consumed by the search bar (or opened it). */
export function routeChatSearch(ctx: KeyRouteContext, input: string, key: KeyEvent): boolean {
  const { state, dispatch } = ctx;
  const search = state.chatSearch;
  const includeReasoning = chatSearchIncludesReasoning(ctx);

  if (!search) {
    if (!isAltF(input, key)) return false;
    dispatch({ type: 'chatSearchOpen', includeReasoning });
    return true;
  }

  // Keep scrolling, panels and pointer handling on their normal routes.
  if (key.mouse || key.pageUp || key.pageDown || key.fn !== undefined) return false;
  if (key.ctrl && (input === 'c' || input === '\x03')) return false;

  if (key.escape || isAltF(input, key)) {
    dispatch({ type: 'chatSearchClose' });
    return true;
  }
  if (key.upArrow || key.return) {
    dispatch({ type: 'chatSearchStep', delta: -1, includeReasoning });
    return true;
  }
  if (key.downArrow) {
    dispatch({ type: 'chatSearchStep', delta: 1, includeReasoning });
    return true;
  }
  if (key.backspace || key.delete) {
    const query = search.query.slice(0, previousGraphemeIndex(search.query, search.query.length));
    dispatch({ type: 'chatSearchSetQuery', query, includeReasoning });
    return true;
  }
  if (key.ctrl && (input === 'u' || input === '\x15')) {
    dispatch({ type: 'chatSearchSetQuery', query: '', includeReasoning });
    return true;
  }
  // Every other chord is swallowed so it cannot edit the hidden draft.
  if (key.ctrl || key.meta || key.tab) return true;

  const text = printable(input);
  if (text) {
    dispatch({ type: 'chatSearchSetQuery', query: search.query + text, includeReasoning });
  }
  return true;
}

/**
 * Alt+↑ / Alt+↓: jump to the previous / next message the user sent.
 *
 * The marked message then takes one key: Enter on an empty composer opens
 * the rewind timeline at that message's checkpoint (Enter rewinds, `f`
 * forks), Esc lets go of it. Any other key lets go of it too and does its
 * usual job, so a mark left behind never captures a later Enter.
 */
export function routeMessageJump(ctx: KeyRouteContext, _input: string, key: KeyEvent): boolean {
  if (key.meta && !key.ctrl && (key.upArrow || key.downArrow)) {
    ctx.dispatch({ type: 'messageJump', direction: key.upArrow ? -1 : 1 });
    return true;
  }
  const { state } = ctx;
  const marked = state.messageJump.entryId;
  if (marked === null) return false;
  // Scrolling to read around the message keeps it marked.
  if (key.mouse || key.pageUp || key.pageDown) return false;
  if (key.escape) {
    ctx.dispatch({ type: 'messageJumpClear' });
    return true;
  }
  const plainEnter = key.return && !key.meta && !key.ctrl && !key.shift;
  const empty = ctx.draftRef.current.buffer === '';
  if (!plainEnter || !empty || ctx.pasteAccumRef.current !== null) {
    ctx.dispatch({ type: 'messageJumpClear' });
    return false;
  }
  ctx.dispatch({ type: 'messageJumpClear' });
  if (state.checkpoints.length === 0) {
    ctx.dispatch({ type: 'hint', text: 'No checkpoints in this session yet.' });
    return true;
  }
  const selected = checkpointForMessage(state.entries, state.checkpoints, marked);
  ctx.dispatch({ type: 'rewindOverlayOpen', selected });
  if (selected === undefined) {
    ctx.dispatch({
      type: 'hint',
      text: 'That message could not be matched to a checkpoint; pick it in the list.',
    });
  }
  return true;
}
