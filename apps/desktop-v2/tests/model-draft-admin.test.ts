import { describe, expect, it } from 'vitest';
import {
  canDiscardHere,
  canOpenProvider,
  classifyModelDrafts,
  discardListedDraft,
  type ListedModelDraft,
  type ModelDraftAdminStorage,
  readModelDraftListing,
} from '../src/model-draft-admin';
import { modelDraftKey } from '../src/model-draft-key';
import { ModelEditorDraftStore } from '../src/model-editor-draft';

const current = 'a'.repeat(64),
  other = 'b'.repeat(64);
async function row(
  providerId: string | null,
  profileId: string | null,
  patch: Partial<ListedModelDraft> = {},
): Promise<ListedModelDraft> {
  return {
    formKey: await modelDraftKey(providerId ?? 'x', profileId ?? undefined),
    revision: 3,
    updatedAt: 1_700_000_000_000,
    bytes: 2048,
    supported: true,
    providerId,
    profileId,
    profileName: null,
    originalId: '',
    modelId: 'custom',
    ...patch,
  };
}

describe('saved model draft administration', () => {
  it('classifies ownership only when the stored owner hashes back to its storage key', async () => {
    const drafts = [
      await row('saved', current),
      await row('removed', current),
      await row('saved', other, { profileName: 'work' }),
      await row('saved', null),
      await row('removed', null),
      await row(null, current, { supported: false }),
      // Envelope claims this profile but was stored under another profile's key.
      { ...(await row('saved', current)), formKey: await modelDraftKey('saved', other) },
      await row('saved', current, { profileId: 'not-a-profile' }),
      await row('saved', current, { supported: false }),
    ];
    const classified = await classifyModelDrafts(drafts, current, ['saved']);
    expect(classified.map((draft) => draft.standing)).toEqual([
      'editable',
      'orphaned',
      'other-profile',
      'unassigned',
      'unassigned',
      'unverified',
      'unverified',
      'unverified',
      'unverified',
    ]);
    expect(classified.map(canOpenProvider)).toEqual([
      true,
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
    // The editor already manages reachable drafts; the dialog only discards unreachable ones.
    expect(classified.map(canDiscardHere)).toEqual([
      false,
      true,
      true,
      false,
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it('accepts only the native listing shape', () => {
    const valid = {
      limit: 200,
      truncated: false,
      drafts: [
        {
          formKey: `model-editor:${'c'.repeat(64)}`,
          revision: 1,
          updatedAt: 1,
          bytes: 10,
          supported: true,
          providerId: 'p',
          profileId: null,
          profileName: null,
          originalId: null,
          modelId: null,
        },
      ],
    };
    expect(readModelDraftListing(valid).drafts).toHaveLength(1);
    for (const broken of [
      null,
      { ...valid, truncated: 'no' },
      { ...valid, drafts: [{ ...valid.drafts[0], formKey: 'model-editor:../x' }] },
      { ...valid, drafts: [{ ...valid.drafts[0], revision: -1 }] },
      { ...valid, drafts: [{ ...valid.drafts[0], providerId: 7 }] },
    ])
      expect(() => readModelDraftListing(broken)).toThrow(/unsupported model draft listing/);
  });

  it('discards with the listed revision and never erases a newer peer draft', async () => {
    const draft = await row('removed', current);
    const rows = new Map([[draft.formKey, { revision: 3, value: {} as unknown }]]);
    const storage: ModelDraftAdminStorage = {
      list: async () => ({ drafts: [], limit: 200, truncated: false }),
      save: async (formKey, value, expectedRevision) => {
        const stored = rows.get(formKey)!;
        if (stored.revision !== expectedRevision)
          throw Error('DRAFT_CONFLICT: This profile draft changed in another window');
        rows.set(formKey, { revision: expectedRevision + 1, value });
        return { revision: expectedRevision + 1 };
      },
    };
    rows.set(draft.formKey, { revision: 4, value: { newer: true } });
    await expect(discardListedDraft(storage, draft)).rejects.toThrow(/changed after it was listed/);
    expect(rows.get(draft.formKey)).toEqual({ revision: 4, value: { newer: true } });
    await discardListedDraft(storage, { ...draft, revision: 4 });
    expect(rows.get(draft.formKey)).toEqual({ revision: 5, value: null });
    await expect(
      discardListedDraft({ ...storage, save: async () => ({ revision: 9 }) }, draft),
    ).rejects.toThrow(/did not acknowledge/);
  });

  it('records the profile display name without making it part of ownership', async () => {
    const saved: unknown[] = [];
    const store = new ModelEditorDraftStore(
      {
        get: async () => ({ revision: 0, value: null }),
        save: async (value, revision) => {
          saved.push(value);
          return revision + 1;
        },
      },
      'provider',
      current,
      'Work profile',
    );
    await store.load();
    const { modelEditorDraft } = await import('../src/model-catalog-editor');
    const draft = modelEditorDraft('model', { name: 'Model' });
    store.edit({ originalId: '', initial: undefined, draft, baseline: draft });
    await store.flush();
    expect(saved[0]).toMatchObject({ profileId: current, profileName: 'Work profile' });
    const renamed = new ModelEditorDraftStore(
      { get: async () => ({ revision: 1, value: saved[0] }), save: async (_v, r) => r + 1 },
      'provider',
      current,
      'Renamed profile',
    );
    await renamed.load();
    expect(renamed.snapshot().value?.draft.id).toBe('model');
  });
});
