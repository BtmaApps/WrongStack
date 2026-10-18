import { record, text } from './session';

/**
 * Pure decisions behind component effects that race with user input or with
 * late server replies. Kept here so they can be tested without a DOM.
 */

export const MAX_COMPOSER_IMAGES = 4;

/**
 * Whether a draft-restore request can be applied now. A blocked request must
 * stay pending (not consumed) so it applies once attachments are removed.
 */
export function canRestoreDraft(
  attachedImages: number,
  requestImages: number,
  limit = MAX_COMPOSER_IMAGES,
): boolean {
  return attachedImages + requestImages <= limit;
}

export interface SavedDraft {
  text: string;
  references: string[];
}

/**
 * Reads a session's stored draft. Missing or unreadable storage yields an
 * empty draft, never "keep what was there": the composer must not carry the
 * previous session's draft into (and then persist it under) another session.
 */
export function readSavedDraft(raw: string | null): SavedDraft {
  try {
    const saved = record(JSON.parse(raw ?? '{}'));
    return {
      text: text(saved.text),
      references: Array.isArray(saved.references)
        ? saved.references.filter((r): r is string => typeof r === 'string')
        : [],
    };
  } catch {
    return { text: '', references: [] };
  }
}

/**
 * Editor text after a save succeeds: the server's copy, unless the user kept
 * typing while the save was in flight — then their newer text wins.
 */
export function draftAfterSave(submitted: string, current: string, savedText: string): string {
  return current === submitted ? savedText : current;
}

/**
 * What a finished list-page request may still do. A reply superseded by a
 * newer list request is dropped; a reply that lands after the user opened a
 * record still refreshes the list but must not close that record.
 */
export function listReplyEffect(
  loadOwner: number,
  loadEpoch: number,
  selectionOwner: number,
  selectionEpoch: number,
): 'ignore' | 'list' | 'list-and-clear-selection' {
  if (loadOwner !== loadEpoch) return 'ignore';
  return selectionOwner === selectionEpoch ? 'list-and-clear-selection' : 'list';
}

/** Tells the user more questions wait behind the one on screen. */
export function inputQueueLabel(waiting: number): string {
  if (waiting <= 0) return '';
  return waiting === 1
    ? '1 more question is waiting after this one.'
    : `${waiting} more questions are waiting after this one.`;
}

/**
 * Whether a document-level Escape should collapse the side panels. Escape that
 * a field already handled, or that was pressed while typing, belongs to that
 * field (closing a picker, cancelling a mention), not to the layout.
 */
export function escapeClosesPanels(event: {
  key: string;
  defaultPrevented: boolean;
  target: unknown;
}): boolean {
  if (event.key !== 'Escape' || event.defaultPrevented) return false;
  const target = event.target as { tagName?: unknown; isContentEditable?: unknown } | null;
  if (!target) return true;
  if (target.isContentEditable === true) return false;
  const tag = typeof target.tagName === 'string' ? target.tagName.toUpperCase() : '';
  return tag !== 'TEXTAREA' && tag !== 'INPUT' && tag !== 'SELECT';
}
