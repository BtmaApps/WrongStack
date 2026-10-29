import { describe, expect, it, vi } from 'vitest';
import type { EngineCommand } from '../src/engine-operations';
import { readModelProfile, verifyModelProfile } from '../src/ModelCatalogProfile';
import { modelEditorDraft } from '../src/model-catalog-editor';
import { modelDraftKey } from '../src/model-draft-key';
import {
  ModelEditorDraftStore,
  parseModelEditor,
  type SavedModelEditor,
} from '../src/model-editor-draft';

const a = 'a'.repeat(64),
  b = 'b'.repeat(64);
describe('profile-owned native model drafts', () => {
  it('separates two profiles using the same provider and retains the legacy namespace independently', async () => {
    const keys = await Promise.all([
      modelDraftKey('same-provider', a),
      modelDraftKey('same-provider', b),
      modelDraftKey('same-provider'),
    ]);
    expect(new Set(keys).size).toBe(3);
    expect(await modelDraftKey('same-provider', a)).toBe(keys[0]);
    await expect(modelDraftKey('provider', 'unverified')).rejects.toThrow(/verified profile/);
    const rows = new Map<string, { revision: number; value: SavedModelEditor | null }>();
    const store = async (profile: string) => {
      const key = await modelDraftKey('same-provider', profile);
      return new ModelEditorDraftStore(
        {
          get: async () => rows.get(key) ?? { revision: 0, value: null },
          save: async (value, revision) => {
            const before = rows.get(key)?.revision ?? 0;
            if (before !== revision) throw Error('DRAFT_CONFLICT');
            rows.set(key, { revision: revision + 1, value: structuredClone(value) });
            return revision + 1;
          },
        },
        'same-provider',
        profile,
      );
    };
    const first = await store(a),
      second = await store(b);
    await Promise.all([first.load(), second.load()]);
    const draft = modelEditorDraft('model', { name: 'Profile A draft' });
    first.edit({ originalId: '', initial: undefined, draft, baseline: structuredClone(draft) });
    await first.flush();
    expect(second.snapshot().value).toBeNull();
    const envelope = rows.get(keys[0]!)!.value;
    expect(envelope?.profileId).toBe(a);
    expect(() => parseModelEditor(envelope, 'same-provider', b)).toThrow(
      /another provider or profile/,
    );
    const legacy = { ...envelope! };
    delete legacy.profileId;
    expect(() => parseModelEditor(legacy, 'same-provider', a)).toThrow(/profile/);
    expect(parseModelEditor(legacy, 'same-provider')).not.toBeNull();
    await second.clear();
    expect(rows.get(keys[0]!)!.value).toEqual(envelope);
  });
  it('rejects missing identity and a changed runtime before applying model edits', async () => {
    expect(() => readModelProfile({ id: a, name: 'default' })).not.toThrow();
    for (const value of [undefined, {}, { id: 'wrong', name: 'default' }])
      expect(() => readModelProfile(value)).toThrow(/verified profile/);
    const command = vi.fn(async () => ({
      profileIdentity: { id: b, name: 'other' },
    })) as unknown as EngineCommand;
    await expect(verifyModelProfile(command, { id: a, name: 'default' })).rejects.toThrow(
      /runtime changed/,
    );
    await expect(verifyModelProfile(command, { id: b, name: 'other' })).resolves.toEqual({
      id: b,
      name: 'other',
    });
  });
});
