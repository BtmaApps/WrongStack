import type { FormDraftCodec } from './durable-form-draft';

/** Unsaved Design Studio color and tuning edits for one active kit. */
export interface DesignEditDraft {
  kit: string;
  colors: Record<string, string>;
  /** Saved overrides when the first color was edited; detects edits made elsewhere. */
  baseline: Record<string, string> | null;
  tune: Record<string, string>;
}
const MAX_ENTRIES = 512;
const MAX_VALUE = 4096;
function strings(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const rows = Object.entries(value);
  return (
    rows.length <= MAX_ENTRIES &&
    rows.every(
      ([key, item]) =>
        key.length <= 200 &&
        !['__proto__', 'constructor', 'prototype'].includes(key) &&
        typeof item === 'string' &&
        item.length <= MAX_VALUE,
    )
  );
}
export const designEditEmpty = (draft: Omit<DesignEditDraft, 'kit'>) =>
  !Object.keys(draft.colors).length && !Object.values(draft.tune).some((value) => value.trim());

export const designEditCodec: FormDraftCodec<DesignEditDraft> = {
  serialize: (draft) => ({ version: 1, ...draft }),
  parse: (value) => {
    if (value === null) return null;
    const saved = (value ?? {}) as Record<string, unknown>;
    if (
      saved['version'] !== 1 ||
      typeof saved['kit'] !== 'string' ||
      !saved['kit'] ||
      saved['kit'].length > 200 ||
      !strings(saved['colors']) ||
      !strings(saved['tune']) ||
      (saved['baseline'] !== null && !strings(saved['baseline']))
    )
      throw Error('Saved design edits have an unsupported format.');
    return {
      kit: saved['kit'],
      colors: { ...saved['colors'] },
      baseline: saved['baseline'] ? { ...(saved['baseline'] as Record<string, string>) } : null,
      tune: { ...saved['tune'] },
    };
  },
};
