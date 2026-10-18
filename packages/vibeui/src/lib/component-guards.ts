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
