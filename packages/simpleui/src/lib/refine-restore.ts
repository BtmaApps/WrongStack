/** Hand a pending refine round-trip back to the composer.
 *
 * The refine panel is the ONE place where the user's message exists only in
 * the panel: `submitWith` flushes the draft, file references and attached
 * images before the round-trip starts. So "I want to edit that after all"
 * cannot just close the panel — it has to put the text and the images back.
 *
 * Two triggers share this path: the global Escape shortcut and the countdown
 * face's Edit button. They must not drift, hence one function instead of two
 * copies of the epoch/guard/image bookkeeping.
 */

import type { RefObject } from 'react';
import { type RefineState, resolveEscapeRestore } from './refine-model.js';

export interface RefineRestoreDeps {
  refineStateRef: RefObject<RefineState | null>;
  setRefineState: (state: RefineState | null) => void;
  refineEpochRef: RefObject<number>;
  refineStartFiredRef: RefObject<boolean>;
  draftRef: RefObject<string>;
  setDraft: (value: string) => void;
  setAttachedImages: (
    images: Array<{ data: string; mime: string; name: string; id: string }>,
  ) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

/**
 * Dismiss the refine panel and restore what the send consumed.
 *
 * Returns false (and does nothing) when no refine round-trip is pending, so
 * callers can use it as a "did I handle this?" guard.
 */
export function restoreRefineToComposer(deps: RefineRestoreDeps): boolean {
  const {
    refineStateRef,
    setRefineState,
    refineEpochRef,
    refineStartFiredRef,
    draftRef,
    setDraft,
    setAttachedImages,
    textareaRef,
  } = deps;
  const state = refineStateRef.current;
  if (!state) return false;

  const images = state.images;
  // Bump the epoch so any in-flight model.refine result that arrives after
  // this (e.g., a slow 180s refineRetryFallback window) is recognised as
  // stale and dropped by the handler — the wire protocol carries no request
  // id, so a slow orphan could otherwise match by epoch coincidence and
  // corrupt a later send.
  refineEpochRef.current++;
  refineStartFiredRef.current = false;
  // Guard: never clobber text the user typed after the panel opened
  // (resolveEscapeRestore returns null in that case).
  const restore = resolveEscapeRestore(state, draftRef.current);
  // Null the ref synchronously so a same-tick startSend flush or panel
  // decision cannot observe the dismissed state and dispatch.
  refineStateRef.current = null;
  setRefineState(null);
  if (restore !== null) {
    setDraft(restore);
    draftRef.current = restore;
  }
  // Restore attached images that were part of the original send. Without
  // this, a re-submit silently drops them because submitWith clears them
  // before startSend.
  if (images && images.length > 0) {
    setAttachedImages(
      images.map((img, i) => ({
        id: `restored-${Date.now()}-${i}`,
        name: `restored-${i}`,
        data: img.data,
        mime: img.mime,
      })),
    );
  }
  requestAnimationFrame(() => textareaRef.current?.focus());
  return true;
}
