import type { Action, State } from './app-reducer.js';
import { inputContentWidth, type KeyEvent } from './components/input.js';
import {
  deleteWordBackward,
  deleteWordForward,
  nextInputWordStart,
  previousInputWordStart,
} from './input-editing.js';
import { nextGraphemeIndex, previousGraphemeIndex } from './input-graphemes.js';
import {
  deleteTokenBackward,
  inputIndexAtRowCol,
  layoutInputRows,
  tokenLengthForward,
} from './input-tokens.js';
import type { MutableCell } from './shared-types.js';
import { displayWidth } from './terminal-width.js';

const PASTE_THRESHOLD_CHARS = 200;

// Per-composer, weakly held so navigation survives renders without retaining
// closed TUIs. Buffer/caret/geometry checks invalidate it after external edits,
// pointer moves, history recall or a resize.
const verticalColumns = new WeakMap<
  object,
  {
    buffer: string;
    cursor: number;
    width: number;
    prompt: string;
    column: number;
  }
>();

export interface InputKeyRouterHost {
  readonly state: Pick<State, 'status' | 'inputHistory' | 'historyIndex' | 'bashMode'>;
  readonly draft: { readonly buffer: string; readonly cursor: number };
  readonly overlayOpen: boolean;
  readonly prompt: string;
  readonly terminalColumns: number;
  readonly terminalRows: number;
  /** Stable across renders; scopes the preferred vertical column to one input. */
  readonly navigationOwner?: object | undefined;
  readonly nextSteps: {
    readonly timer: MutableCell<ReturnType<typeof setInterval> | undefined>;
    readonly suggestion: MutableCell<string | null>;
    readonly label: string | null;
    setCountdown(value: number | null): void;
    setLabel(value: string | null): void;
    cancel(): void;
  };
  dispatch(action: Action): void;
  setDraft(buffer: string, cursor: number): void;
  pasteClipboardText(): Promise<void>;
  pasteClipboardImage(): Promise<void>;
  commitPaste(input: string): Promise<void>;
}

/**
 * Route keys owned by the editable composer after modal/picker/mouse routing.
 * Returns true when the event was consumed. Keeping this controller independent
 * from the App shell makes cursor, history, clipboard, and paste behavior
 * testable without mounting every overlay controller.
 */
export async function routeInputKey(
  host: InputKeyRouterHost,
  input: string,
  key: KeyEvent,
): Promise<boolean> {
  const { buffer, cursor } = host.draft;
  const navigationOwner = host.navigationOwner ?? host.setDraft;
  const vertical = key.upArrow || key.downArrow || key.pageUp || key.pageDown;
  if (!vertical || host.overlayOpen) verticalColumns.delete(navigationOwner);

  // Tab accepts the pending next-steps suggestion — but NEVER in bash mode,
  // where it would silently rewrite a shell command into a chat suggestion
  // and one Enter away from executing it. There Tab is a harmless no-op.
  if (key.tab) {
    if (!host.state.bashMode && host.nextSteps.timer.current != null) {
      const pending = host.nextSteps.suggestion.current ?? host.nextSteps.label ?? '';
      clearInterval(host.nextSteps.timer.current);
      host.nextSteps.timer.current = undefined;
      host.nextSteps.setCountdown(null);
      host.nextSteps.setLabel(null);
      host.nextSteps.suggestion.current = null;
      const text = pending.trim();
      if (text) host.setDraft(text, text.length);
    }
    return true;
  }

  if (key.backspace) {
    if (key.ctrl) {
      const result = deleteWordBackward(buffer, cursor);
      if (result) {
        host.nextSteps.cancel();
        host.setDraft(result.buffer, result.cursor);
      }
      return true;
    }
    // Backspace on an empty bash-mode line leaves the mode: the composer
    // returns to the normal chat prompt without touching the buffer.
    if (host.state.bashMode && buffer === '') {
      host.dispatch({ type: 'bashModeExit' });
      return true;
    }
    const token = deleteTokenBackward(buffer, cursor);
    if (token) {
      host.nextSteps.cancel();
      host.setDraft(token.buffer, token.cursor);
      return true;
    }
    if (cursor > 0) {
      host.nextSteps.cancel();
      const previous = previousGraphemeIndex(buffer, cursor);
      host.setDraft(buffer.slice(0, previous) + buffer.slice(cursor), previous);
    }
    return true;
  }

  if (key.ctrl && input === 'w') {
    const result = deleteWordBackward(buffer, cursor);
    if (result) {
      host.nextSteps.cancel();
      host.setDraft(result.buffer, result.cursor);
    }
    return true;
  }

  if (key.delete) {
    if (key.ctrl) {
      const result = deleteWordForward(buffer, cursor);
      if (result) {
        host.nextSteps.cancel();
        host.setDraft(result.buffer, result.cursor);
      }
      return true;
    }
    if (cursor < buffer.length) {
      const span = tokenLengthForward(buffer, cursor) || nextGraphemeIndex(buffer, cursor) - cursor;
      host.nextSteps.cancel();
      host.setDraft(buffer.slice(0, cursor) + buffer.slice(cursor + span), cursor);
    }
    return true;
  }

  if (key.leftArrow) {
    const nextCursor = key.ctrl
      ? previousInputWordStart(buffer, cursor)
      : previousGraphemeIndex(buffer, cursor);
    if (nextCursor !== cursor) host.setDraft(buffer, nextCursor);
    return true;
  }
  if (key.rightArrow) {
    const nextCursor = key.ctrl
      ? nextInputWordStart(buffer, cursor)
      : nextGraphemeIndex(buffer, cursor);
    if (nextCursor !== cursor) host.setDraft(buffer, nextCursor);
    return true;
  }
  if (key.home) {
    host.setDraft(buffer, 0);
    return true;
  }
  if (key.end) {
    host.setDraft(buffer, buffer.length);
    return true;
  }

  if (!host.overlayOpen && (key.upArrow || key.downArrow || key.pageUp || key.pageDown)) {
    const width = inputContentWidth(host.terminalColumns);
    const rows = layoutInputRows(host.prompt, buffer, cursor, width);
    if (rows.length > 1) {
      // Locate the caret cell the layout already marked. Counting cell
      // offsets here would drift from the buffer cursor by prompt.length
      // (prompt cells are part of row 0) and by every '\n' cell consumed
      // as a row break.
      let row = 0;
      let col = 0;
      const caretRow = rows.findIndex((cells) => cells.some((cell) => cell.cursor));
      if (caretRow >= 0) {
        row = caretRow;
        const cells = rows[caretRow]!;
        col = displayWidth(
          cells
            .slice(
              0,
              cells.findIndex((cell) => cell.cursor),
            )
            .map((cell) => cell.ch)
            .join(''),
        );
      } else {
        // The caret sits on a '\n' cell, which wrapping consumes: treat it
        // as the end of the row that newline terminates.
        let valueCells = 0;
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
          const cells = rows[rowIndex]!;
          valueCells += cells.filter((cell) => !cell.prompt).length;
          if (valueCells >= cursor) {
            row = rowIndex;
            col = cells.length;
            break;
          }
        }
      }

      const previous = verticalColumns.get(navigationOwner);
      const column =
        previous?.buffer === buffer &&
        previous.cursor === cursor &&
        previous.width === width &&
        previous.prompt === host.prompt
          ? previous.column
          : col;
      const targetRow = key.upArrow
        ? Math.max(0, row - 1)
        : key.downArrow
          ? Math.min(rows.length - 1, row + 1)
          : Math.max(
              0,
              Math.min(
                rows.length - 1,
                row + (key.pageUp ? -1 : 1) * Math.max(1, Math.floor(host.terminalRows / 2)),
              ),
            );
      if (targetRow !== row) {
        const target = inputIndexAtRowCol(host.prompt, buffer, width, targetRow, column);
        verticalColumns.set(navigationOwner, {
          buffer,
          cursor: target,
          width,
          prompt: host.prompt,
          column,
        });
        host.setDraft(buffer, target);
      }
      return true; // Always consume when multi-line: prevents Up/Down at the
      // first/last row from falling through to historyUp/historyDown.
    }
    verticalColumns.delete(navigationOwner);
  }

  if (key.upArrow) {
    if (!host.overlayOpen && host.state.inputHistory.length > 0) {
      host.dispatch({ type: 'historyUp' });
    }
    return true;
  }
  if (key.downArrow) {
    if (!host.overlayOpen && host.state.historyIndex > 0) {
      host.dispatch({ type: 'historyDown' });
    }
    return true;
  }
  // PgUp/PgDn are not consumed here — multi-line scroll already handled above,
  // and for single-line / at-boundary they should fall through to the default
  // handler (line 235) which returns false (not consumed). In non-mouse-mode
  // no consumer needs these keys; in mouse-mode the overlay scroll handler
  // owns them before reaching this router.

  if (key.ctrl && input === 'a') {
    host.setDraft(buffer, 0);
    return true;
  }
  if (key.ctrl && input === 'e') {
    host.setDraft(buffer, buffer.length);
    return true;
  }
  if (key.ctrl && input === 'u') {
    host.nextSteps.cancel();
    host.setDraft('', 0);
    return true;
  }
  if (key.ctrl && (input === 'd' || input === 'k')) {
    if (cursor < buffer.length) {
      const end =
        input === 'd'
          ? cursor +
            (tokenLengthForward(buffer, cursor) || nextGraphemeIndex(buffer, cursor) - cursor)
          : buffer.length;
      host.nextSteps.cancel();
      host.setDraft(buffer.slice(0, cursor) + buffer.slice(end), cursor);
    }
    return true;
  }

  if (key.ctrl && input === 'v') {
    // Lock paste only while the agent is actively working — the original
    // three-state gate (running / streaming / aborting) is intentional so
    // paste still works in error, queued, and active states.
    if (
      host.state.status === 'running' ||
      host.state.status === 'streaming' ||
      host.state.status === 'aborting'
    ) {
      host.dispatch({
        type: 'addEntry',
        entry: {
          kind: 'info',
          text: 'Input locked — wait for the agent to finish before pasting.',
        },
      });
    } else {
      await host.pasteClipboardText();
    }
    return true;
  }
  if (key.meta && input === 'v') {
    await host.pasteClipboardImage();
    return true;
  }

  if (!input || key.ctrl || key.meta || input.charCodeAt(0) === 0x1b) return false;
  if (input.length > PASTE_THRESHOLD_CHARS || input.includes('\n')) {
    await host.commitPaste(input);
    return true;
  }

  host.nextSteps.cancel();
  host.setDraft(buffer.slice(0, cursor) + input + buffer.slice(cursor), cursor + input.length);
  return true;
}
