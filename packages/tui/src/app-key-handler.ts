import { toErrorMessage } from '@wrongstack/core/utils';
import { getProcessRegistry } from '@wrongstack/tools';
import { bottomPanelOwnsInput, effectivePanelPositions } from './app-ui-state.js';
import { EMPTY_KEY, type KeyEvent } from './components/input.js';
import type { AppKeyHandlerOptions, KeyRouteContext } from './key-handler-context.js';
import { routeBackgroundStrip } from './key-routes/key-route-background-strip.js';
import { routeBusyInterrupt, routeCtrlCEscalation } from './key-routes/key-route-busy.js';
import { routeChatSearch, routeMessageJump } from './key-routes/key-route-chat-search.js';
import { routeComposer, routeComposerTail } from './key-routes/key-route-composer.js';
import {
  routeChordPanels,
  routeDoubleEsc,
  routeEscClosePanels,
  routeFKeyPanels,
  routeModalOverlay,
  routePanelEscapeRouter,
  routeSddBoard,
  routeSettingsOverlay,
} from './key-routes/key-route-overlay.js';
import { routePastePipeline } from './key-routes/key-route-paste.js';
import { routePointerEvents, routeSidebarFocusScroll } from './key-routes/key-route-pointer.js';
import { overlayPointerKey } from './overlay-key-router.js';

export type { AppKeyHandlerOptions } from './key-handler-context.js';

/** Keyboard activity means the user has taken control of an armed automatic turn. */
export function stopNextStepsAutoSubmitOnKey(cancel: () => void): void {
  cancel();
}

/** Creates the terminal key host around focused overlay/input routers. */
export function createAppKeyHandler(
  options: AppKeyHandlerOptions,
): (input: string, key: KeyEvent) => Promise<void> {
  const {
    state,
    dispatch,
    inputGateRef,
    pasteAccumRef,
    tryPickerKey,
    termRows,
    terminalColumns,
    terminalRows,
    mainColumnWidth,
    cancelNextStepsCountdown,
  } = options;
  const stdout = { columns: terminalColumns, rows: terminalRows };
  /** Effective width of the history area (terminal minus sidebar).
   *  Used for scrollbar/hit-test geometry so clicks land on the correct track. */
  const historyWidth = mainColumnWidth > 0 ? mainColumnWidth : (stdout?.columns ?? 80);

  /**
   * Run a detached promise from a key handler without risking the process.
   *
   * `void fn()` is the default idiom in this file, and most call sites were
   * only safe because the callee happened to try/catch internally — incidental,
   * not enforced. The ones that did not (paste commit on the 500 ms timer
   * stack, the SDD lifecycle ops, the clipboard write, `/goal` dispatch) each
   * turned a routine failure into an unhandled rejection, which Node 22's
   * default `--unhandled-rejections=throw` escalates to process death. That
   * violates the project's "no error may kill the process" rule, and a key
   * handler is the last place a user can afford to lose the session.
   *
   * The failure surfaces as an error entry, the same way `submit-controller`
   * reports a failed slash dispatch.
   */
  const detach = (work: Promise<unknown> | undefined, what: string): void => {
    void Promise.resolve(work).catch((err: unknown) => {
      dispatch({
        type: 'addEntry',
        entry: { kind: 'error', text: `${what} failed: ${toErrorMessage(err)}` },
      });
    });
  };

  // Shared view for the ordered route modules (decomposition Phase 3).
  const ctx: KeyRouteContext = { ...options, stdout, historyWidth, detach };
  const panelOwnsInput = bottomPanelOwnsInput(
    state,
    effectivePanelPositions(state, options.getSettings?.()),
  );

  const handleKey = async (input: string, key: KeyEvent) => {
    // Only consecutive composer Esc presses may clear a draft. Keys owned by
    // another surface must neither trigger nor arm that shortcut.
    if (!key.escape) ctx.lastEscAtRef.current = 0;
    // Any key is an explicit user takeover. Stop both the final-ten-second
    // sweep and its armed submit before routing the key, including keys owned
    // by overlays/navigation and Ctrl+C. The cancel callback is a no-op when
    // no next-step countdown exists.
    stopNextStepsAutoSubmitOnKey(cancelNextStepsCountdown);

    // ── Ctrl+C: THE unconditional escape hatch ────────────────────────
    // Moved verbatim to routeCtrlCEscalation (key-routes/key-route-busy.ts,
    // decomposition Phase 3). Raw-mode terminals deliver Ctrl+C as KEY DATA —
    // no SIGINT is ever generated — so this runs BEFORE every modal/status
    // guard: Ctrl+C has to work precisely when everything else is wedged.
    if (routeCtrlCEscalation(ctx, input, key)) return;
    if (routeModalOverlay(ctx, input, key)) {
      ctx.lastEscAtRef.current = 0;
      return;
    }

    // Bottom F-key panels own the keyboard while their composer is hidden.
    // Sidebar twins keep chat input available; critical modals still win above.

    // Re-entrancy guard: block stale-second events from \r\n terminals.
    if (inputGateRef.current) return;

    // Function keys switch/close panels even when a picker owns all other keys.
    if (panelOwnsInput && key.fn !== undefined && routeFKeyPanels(ctx, input, key)) return;
    if (panelOwnsInput && key.meta && (key.pageUp || key.pageDown)) return;

    // Transcript search bar (Alt+F): owns text entry while open, before the
    // paste pipeline can commit anything into the composer draft.
    if (!panelOwnsInput && routeChatSearch(ctx, input, key)) return;
    // Background strip (Alt+B): running subagents and background shells.
    if (
      !panelOwnsInput &&
      routeBackgroundStrip(input, key, (pid) => getProcessRegistry().kill(pid))
    ) {
      return;
    }
    // Alt+↑ / Alt+↓: jump between the user's messages in the transcript.
    if (!panelOwnsInput && routeMessageJump(ctx, input, key)) return;

    // ── Bracketed-paste accumulation ──────────────────────────────────
    // Moved verbatim to routePastePipeline (key-routes/key-route-paste.ts,
    // decomposition Phase 3). The begin marker (\x1b[200~) opens accumulation;
    // fragments accumulate until the end marker (\x1b[201~), then the whole
    // payload finalizes at once — before Enter handling, so a "\n" fragment
    // inside a paste never submits mid-paste.
    if (!panelOwnsInput && (await routePastePipeline(ctx, input))) return;

    // Some terminals emit \r\n for Enter as two separate stdin events.
    // \r arrives with key.return=true (handled below); \n may arrive as
    // a stray character with key.return=false. Normalize both to Enter
    // and prevent them from polluting the buffer as literal text.
    // Mouse buttons inside a selectable overlay map to keyboard semantics:
    // left = confirm (Enter), right = cancel/back (Esc). Tracking is
    // overlay-scoped (see the mouse effect near stateRef), so this is gated on
    // an overlay being open and never disturbs normal chat clicks. Combined
    // with wheel-to-move in each picker block, this gives full mouse menu
    // control without any pixel hit-testing.
    const { isEnter, cancelAction } = overlayPointerKey(state, input, key, {
      termRows,
      viewportRows: state.viewportRows,
    });

    // Right-click cancels the open overlay (mirrors each picker's Esc path).
    if (cancelAction) {
      // Cancellation may abort OAuth, leave an inline editor, or dismiss a
      // resume confirmation. Use the same lifecycle as the physical Esc key.
      if (tryPickerKey('', { ...EMPTY_KEY, escape: true }, false)) return;
      dispatch(cancelAction);
      return;
    }

    // ── Paste-active guard: swallow Enter mid-paste ──────────────────
    // Ink can split `\r\n` (which arrives inside a paste payload) into
    // BOTH a raw `\r` character AND a decoded Enter event (key.return,
    // input=''). The former is correctly accumulated by feedPaste above,
    // but the decoded Enter has input='' → it bypasses feedPaste and
    // would submit the buffer mid-paste. Catch it here.
    if (pasteAccumRef.current !== null && isEnter) return;

    // IMPORTANT: do NOT bail on `!input` here. Special keys (arrows,
    // Enter, Escape, Tab, Backspace) arrive with an empty `input`
    // string, and the slash/file pickers + cursor movement below all
    // depend on receiving those events. The late guard before text
    // insertion handles the empty-input case correctly.

    // All picker dispatch is delegated to the usePickerKeys hook.
    // The hook handles Esc (close), ↑/↓ (navigate), wheel (scroll),
    // Enter (confirm), and picker-specific keys (search, filter, Tab).
    // If no picker is open the hook returns false immediately.
    if (tryPickerKey(input, key, isEnter)) {
      ctx.lastEscAtRef.current = 0;
      return;
    }

    if (routeEscClosePanels(ctx, key)) return;

    // Panel-owned Esc must be resolved before the draft-clearing shortcut.
    if (routeDoubleEsc(ctx, key)) return;

    if (routeBusyInterrupt(ctx, key)) return;

    // Monitor-overlay chords (Ctrl+B → SDD board, Ctrl+Y → kanban) — moved
    // verbatim to routeChordPanels (key-routes/key-route-overlay.ts, Phase 3).
    if (routeChordPanels(ctx, input, key)) return;
    // F-key / Ctrl-alias dispatch — moved verbatim to routeFKeyPanels
    // (key-routes/key-route-overlay.ts, Phase 3).
    if (routeFKeyPanels(ctx, input, key)) return;
    // SDD board drill-down (←/→ phases, c/z/x run lifecycle) — moved
    // verbatim to routeSddBoard (key-routes/key-route-overlay.ts, Phase 3).
    if (routeSddBoard(ctx, input, key)) return;
    if (routeSettingsOverlay(ctx, input, key, isEnter)) return;
    if (routePanelEscapeRouter(ctx, key)) return;

    // Local panel handlers receive the same Ink event. Never also edit or
    // submit the hidden composer, including when it holds a saved draft.
    if (panelOwnsInput) return;

    // overlayOpen tracks whether the renderer hides the right sidebar for a
    // bottom-routed panel/overlay. Sidebar-routed panels must not suppress
    // sidebar focus or history hit-testing, so this shares AppView's
    // routing-aware layout decision via mainColumnWidth.

    // ── Sidebar focus + scroll ───────────────────────────────────────
    if (routeSidebarFocusScroll(ctx, input, key)) return;

    // ── Composer shortcuts + Enter pipeline ──────────────────────────
    if (routeComposer(ctx, input, key, isEnter)) return;

    // ── Pointer events (mouse/wheel/paging) ───────────────────────────
    if (await routePointerEvents(ctx, input, key)) return;

    // ── Composer tail (routeInputKey + Ctrl+P) ───────────────────────
    if (await routeComposerTail(ctx, input, key)) return;
  };

  return handleKey;
}
