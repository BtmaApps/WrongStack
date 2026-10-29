import type { FormDraftCodec } from './durable-form-draft';

/** Unsaved SKILL.md edits and the disk text they started from. */
export interface SkillEditorDraft {
  /** Skill body on disk when this draft began; a different disk body needs review. */
  base: string;
  body: string;
}
export interface SkillDraftOwner {
  name: string;
  source: string;
  /** Present for profile-scoped skills; drafts never cross profiles. */
  profileId?: string;
}
const MAX_TEXT = 512 * 1024;

export async function skillEditorKey(owner: SkillDraftOwner) {
  const source = JSON.stringify([
    'skill-editor',
    owner.profileId ?? null,
    owner.source,
    owner.name,
  ]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return `skill-editor:${[...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

export function skillEditorCodec(owner: SkillDraftOwner): FormDraftCodec<SkillEditorDraft> {
  return {
    serialize: (draft) => ({
      version: 1,
      skill: owner.name,
      source: owner.source,
      ...(owner.profileId ? { profileId: owner.profileId } : {}),
      base: draft.base,
      body: draft.body,
    }),
    parse: (value) => {
      if (value === null) return null;
      const saved = (value ?? {}) as Record<string, unknown>;
      if (
        saved['version'] !== 1 ||
        saved['skill'] !== owner.name ||
        saved['source'] !== owner.source ||
        (saved['profileId'] ?? undefined) !== owner.profileId ||
        typeof saved['base'] !== 'string' ||
        typeof saved['body'] !== 'string' ||
        saved['base'].length > MAX_TEXT ||
        saved['body'].length > MAX_TEXT
      )
        throw Error('The saved skill draft has an unsupported format or belongs to another skill.');
      return { base: saved['base'], body: saved['body'] };
    },
  };
}
