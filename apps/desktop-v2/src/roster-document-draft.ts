import type { FormDraftCodec } from './durable-form-draft';

/** Unsaved project role document text and the stored text it started from. */
export interface RosterDocumentDraft {
  base: string;
  text: string;
}
export interface RosterDocumentOwner {
  role: string;
  kind: string;
  skill: string;
}
const MAX_TEXT = 1024 * 1024;

export async function rosterDocumentDraftKey(owner: RosterDocumentOwner) {
  const source = JSON.stringify(['roster-document', owner.role, owner.kind, owner.skill]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return `roster-document:${[...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}
export function rosterDocumentCodec(
  owner: RosterDocumentOwner,
): FormDraftCodec<RosterDocumentDraft> {
  return {
    serialize: (draft) => ({ version: 1, ...owner, base: draft.base, text: draft.text }),
    parse: (value) => {
      if (value === null) return null;
      const saved = (value ?? {}) as Record<string, unknown>;
      if (
        saved['version'] !== 1 ||
        saved['role'] !== owner.role ||
        saved['kind'] !== owner.kind ||
        saved['skill'] !== owner.skill ||
        typeof saved['base'] !== 'string' ||
        typeof saved['text'] !== 'string' ||
        saved['base'].length > MAX_TEXT ||
        saved['text'].length > MAX_TEXT
      )
        throw Error('The saved role document draft has an unsupported format or another owner.');
      return { base: saved['base'], text: saved['text'] };
    },
  };
}
