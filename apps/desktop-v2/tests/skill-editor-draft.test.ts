import { describe, expect, it } from 'vitest';
import { DurableFormDraft, type FormDraftStorage } from '../src/durable-form-draft';
import { skillEditorCodec, skillEditorKey } from '../src/skill-editor-draft';

const profile = 'f'.repeat(64);
describe('skill editor drafts', () => {
  it('keys drafts by profile, source and name', async () => {
    const keys = await Promise.all([
      skillEditorKey({ name: 'review', source: 'project' }),
      skillEditorKey({ name: 'review', source: 'user', profileId: profile }),
      skillEditorKey({ name: 'review', source: 'user', profileId: 'e'.repeat(64) }),
      skillEditorKey({ name: 'other', source: 'project' }),
    ]);
    expect(new Set(keys).size).toBe(4);
    for (const key of keys) expect(key).toMatch(/^skill-editor:[a-f0-9]{64}$/);
  });

  it('refuses drafts owned by another skill, source or profile', () => {
    const owner = { name: 'review', source: 'user', profileId: profile };
    const saved = skillEditorCodec(owner).serialize({ base: 'old', body: 'new' });
    expect(skillEditorCodec(owner).parse(saved)).toEqual({ base: 'old', body: 'new' });
    for (const other of [
      { ...owner, name: 'other' },
      { ...owner, source: 'project' },
      { ...owner, profileId: 'e'.repeat(64) },
      { name: 'review', source: 'user' },
    ])
      expect(() => skillEditorCodec(other).parse(saved)).toThrow(/another skill/);
    expect(() =>
      skillEditorCodec(owner).parse({
        ...(saved as object),
        body: 'x'.repeat(512 * 1024 + 1),
      }),
    ).toThrow();
  });

  it('round-trips base and body through a native slot', async () => {
    const slot = { revision: 0, value: null as unknown };
    const storage: FormDraftStorage = {
      get: async () => structuredClone(slot),
      save: async (value, expected) => {
        if (expected !== slot.revision) throw Error('DRAFT_CONFLICT');
        slot.revision++;
        slot.value = structuredClone(value);
        return slot.revision;
      },
    };
    const owner = { name: 'review', source: 'project' };
    const form = new DurableFormDraft(storage, skillEditorCodec(owner));
    await form.load();
    form.edit({ base: '# Skill\n', body: '# Skill\nMore\n' });
    await form.flush();
    const reopened = new DurableFormDraft(storage, skillEditorCodec(owner));
    await reopened.load();
    expect(reopened.snapshot().value).toEqual({ base: '# Skill\n', body: '# Skill\nMore\n' });
  });
});
