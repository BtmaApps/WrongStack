import { describe, expect, it } from 'vitest';
import {
  canRestoreDraft,
  draftAfterSave,
  listReplyEffect,
  readSavedDraft,
} from '../src/lib/component-guards';

describe('composer draft restore (composer.tsx)', () => {
  it('blocks a restore that would exceed the image limit, then allows it once images are removed', () => {
    // Blocked: the request must stay pending instead of being consumed.
    expect(canRestoreDraft(3, 2)).toBe(false);
    // After the user removes attachments the same request fits.
    expect(canRestoreDraft(1, 2)).toBe(true);
    expect(canRestoreDraft(0, 4)).toBe(true);
  });
});

describe('composer stored draft load (composer.tsx)', () => {
  it('yields an empty draft for unreadable storage instead of keeping the previous one', () => {
    expect(readSavedDraft('{not json')).toEqual({ text: '', references: [] });
    expect(readSavedDraft(null)).toEqual({ text: '', references: [] });
    expect(readSavedDraft('"a string"')).toEqual({ text: '', references: [] });
  });
  it('reads a valid stored draft and drops non-string references', () => {
    expect(
      readSavedDraft(JSON.stringify({ text: 'Hello', references: ['src/a.ts', 7, null] })),
    ).toEqual({ text: 'Hello', references: ['src/a.ts'] });
  });
});

describe('instructions save (instructions-editor.tsx)', () => {
  it('keeps text typed while the save was in flight', () => {
    expect(draftAfterSave('v1', 'v1 and more', 'v1')).toBe('v1 and more');
  });
  it('adopts the server copy when nothing changed during the save', () => {
    expect(draftAfterSave('v1', 'v1', 'v1\n')).toBe('v1\n');
  });
});

describe('memory list refresh (memory-browser.tsx)', () => {
  it('keeps a record opened while the list page was loading', () => {
    // load captured selection epoch 1; the user then picked a record (epoch 2).
    expect(listReplyEffect(5, 5, 1, 2)).toBe('list');
  });
  it('clears selection when nothing was opened meanwhile', () => {
    expect(listReplyEffect(5, 5, 1, 1)).toBe('list-and-clear-selection');
  });
  it('drops a reply superseded by a newer list request', () => {
    expect(listReplyEffect(4, 5, 1, 1)).toBe('ignore');
  });
});
