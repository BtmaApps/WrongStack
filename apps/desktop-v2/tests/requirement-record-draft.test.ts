import { describe, expect, it } from 'vitest';
import {
  blankRequirementFields,
  type ProjectFormDraftStorage,
  type RequirementDraftSnapshot,
} from '../src/requirement-draft';
import {
  emptyRecordDraft,
  parseRecordDraft,
  type RequirementRecordDraft,
  RequirementRecordDraftStore,
} from '../src/requirement-record-draft';

function memoryStorage() {
  let revision = 0;
  let value: RequirementRecordDraft | null = null;
  const storage: ProjectFormDraftStorage<RequirementRecordDraft> = {
    get: async () => ({ revision, value: structuredClone(value) }),
    save: async (next, expected) => {
      if (expected !== revision) throw Error('DRAFT_CONFLICT');
      value = structuredClone(next);
      return ++revision;
    },
  };
  return storage;
}
describe('persisted requirement record drafts', () => {
  it('restores edit and answer baselines and clears only acknowledged content', async () => {
    const storage = memoryStorage();
    const first = new RequirementRecordDraftStore('reqi_one', storage);
    await first.load();
    first.beginEdit({ ...blankRequirementFields(), expectedOutcome: 'Retain metadata' }, 7);
    first.setAnswer('question-one', 'Retain answer', 7);
    await first.flush();
    const reopened = new RequirementRecordDraftStore('reqi_one', storage);
    await reopened.load();
    expect(reopened.snapshot().value.expectedVersion).toBe(7);
    expect(reopened.snapshot().value.fields?.expectedOutcome).toBe('Retain metadata');
    expect(reopened.snapshot().value.answers['question-one']).toEqual({
      text: 'Retain answer',
      expectedVersion: 7,
    });
    await reopened.acknowledgeEdit(reopened.snapshot().value);
    expect(reopened.snapshot().value.answers['question-one']?.text).toBe('Retain answer');
    await reopened.acknowledgeAnswer('question-one', 'Retain answer');
    expect((await storage.get()).value).toBeNull();
    expect((await storage.get()).revision).toBeGreaterThan(0);
  });
  it('keeps stale local edits and refuses a stale comparison decision', async () => {
    const storage = memoryStorage();
    const first = new RequirementRecordDraftStore('reqi_one', storage);
    const second = new RequirementRecordDraftStore('reqi_one', storage);
    await Promise.all([first.load(), second.load()]);
    first.beginEdit({ ...blankRequirementFields(), title: 'First' }, 1);
    await first.flush();
    second.beginEdit({ ...blankRequirementFields(), title: 'Local second' }, 1);
    await expect(second.flush()).rejects.toThrow();
    expect(second.snapshot().status).toBe('conflict');
    expect(second.snapshot().value.fields?.title).toBe('Local second');
    await second.compare();
    first.beginEdit({ ...blankRequirementFields(), title: 'Newer first' }, 1);
    await first.flush();
    await second.resolve('local');
    expect(second.snapshot().error).toContain('changed again');
    expect(parseRecordDraft((await storage.get()).value, 'reqi_one').fields?.title).toBe(
      'Newer first',
    );
    await second.compare();
    await second.resolve('saved');
    expect(second.snapshot().value.fields?.title).toBe('Newer first');
  });
  it('ignores an older load reply for the same record', async () => {
    const reads: Array<(snapshot: RequirementDraftSnapshot) => void> = [];
    const store = new RequirementRecordDraftStore('reqi_one', {
      get: () => new Promise((resolve) => reads.push(resolve)),
      save: async () => {
        throw Error('Unexpected write');
      },
    });
    const earlier = store.load();
    const later = store.load();
    reads[1]!({
      revision: 2,
      value: {
        ...emptyRecordDraft('reqi_one'),
        answers: { q: { text: 'Latest', expectedVersion: 3 } },
      },
    });
    await later;
    reads[0]!({
      revision: 1,
      value: {
        ...emptyRecordDraft('reqi_one'),
        answers: { q: { text: 'Old', expectedVersion: 1 } },
      },
    });
    await earlier;
    expect(store.snapshot().value.answers['q']?.text).toBe('Latest');
  });
  it('rejects a saved payload from another record', () => {
    expect(() => parseRecordDraft(emptyRecordDraft('reqi_other'), 'reqi_one')).toThrow();
  });
});
