import { DraftWriter } from './draft-storage';
import {
  blankRequirementFields,
  type ProjectFormDraftStorage,
  type RequirementFormFields,
} from './requirement-draft';

export interface RequirementRecordDraft {
  version: 1;
  intakeId: string;
  fields: RequirementFormFields | null;
  expectedVersion: number | null;
  answers: Record<string, { text: string; expectedVersion: number }>;
}
export type RequirementRecordDraftStorageFactory = (
  id: string,
) => ProjectFormDraftStorage<RequirementRecordDraft>;
export const emptyRecordDraft = (intakeId: string): RequirementRecordDraft => ({
  version: 1,
  intakeId,
  fields: null,
  expectedVersion: null,
  answers: {},
});
const validVersion = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
export function parseRecordDraft(value: unknown, intakeId: string): RequirementRecordDraft {
  if (value === null) return emptyRecordDraft(intakeId);
  const draft = value as RequirementRecordDraft;
  if (!draft || typeof draft !== 'object' || draft.version !== 1 || draft.intakeId !== intakeId)
    throw Error('Saved edit draft belongs to a different requirement or format.');
  if (
    draft.fields === null
      ? draft.expectedVersion !== null
      : !draft.fields ||
        typeof draft.fields !== 'object' ||
        !validVersion(draft.expectedVersion) ||
        Object.keys(blankRequirementFields()).some(
          (key) => typeof draft.fields?.[key as keyof RequirementFormFields] !== 'string',
        )
  )
    throw Error('Saved requirement information is invalid.');
  if (
    !draft.answers ||
    typeof draft.answers !== 'object' ||
    Array.isArray(draft.answers) ||
    Object.values(draft.answers).some(
      (answer) =>
        !answer || typeof answer.text !== 'string' || !validVersion(answer.expectedVersion),
    )
  )
    throw Error('Saved answer drafts are invalid.');
  return draft;
}
export const hasRecordDraft = (draft: RequirementRecordDraft) =>
  draft.fields !== null || Object.keys(draft.answers).length > 0;
type Status = 'loading' | 'saving' | 'saved' | 'conflict' | 'error';
export interface RecordDraftState {
  value: RequirementRecordDraft;
  ready: boolean;
  status: Status;
  error: string;
  resolving: boolean;
  review: { revision: number; value: RequirementRecordDraft } | null;
}

/** One instance owns one record; pending writes keep their original storage target. */
export class RequirementRecordDraftStore {
  private state: RecordDraftState;
  private listeners = new Set<() => void>();
  private writer: DraftWriter;
  private readSequence = 0;
  private writeSequence = 0;
  private blocked = false;
  private resolving = false;
  constructor(
    private id: string,
    private storage: ProjectFormDraftStorage<RequirementRecordDraft>,
  ) {
    this.state = {
      value: emptyRecordDraft(id),
      ready: false,
      status: 'loading',
      error: '',
      review: null,
      resolving: false,
    };
    this.writer = new DraftWriter((_key, value, revision) =>
      storage.save(value ? parseRecordDraft(JSON.parse(value), id) : null, revision),
    );
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<RecordDraftState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  async load() {
    const seq = ++this.readSequence;
    this.publish({ ready: false, status: 'loading', error: '' });
    try {
      const saved = await this.storage.get();
      const value = parseRecordDraft(saved.value, this.id);
      if (seq !== this.readSequence) return;
      this.writer.initialize(this.id, saved.revision);
      this.blocked = false;
      this.publish({ value, ready: true, status: 'saved', error: '', review: null });
    } catch (error) {
      if (seq === this.readSequence) this.publish({ status: 'error', error: String(error) });
    }
  }
  invalidateRead() {
    this.readSequence++;
  }
  private async persist(value: RequirementRecordDraft) {
    if (!this.state.ready || this.blocked)
      throw Error('Resolve this requirement draft before saving.');
    const seq = ++this.writeSequence;
    this.publish({ status: 'saving', error: '' });
    try {
      await this.writer.write(this.id, hasRecordDraft(value) ? JSON.stringify(value) : '');
      if (seq === this.writeSequence && !this.blocked) this.publish({ status: 'saved' });
    } catch (error) {
      if (String(error).includes('DRAFT_CONFLICT')) this.blocked = true;
      this.publish({ status: this.blocked ? 'conflict' : 'error', error: String(error) });
      throw error;
    }
  }
  update(change: (value: RequirementRecordDraft) => RequirementRecordDraft) {
    if (!this.state.ready || this.resolving) return;
    const value = parseRecordDraft(change(this.state.value), this.id);
    this.publish({ value });
    if (!this.blocked) void this.persist(value).catch(() => {});
  }
  async flush() {
    await this.writer.drain(this.id);
    if (!this.state.ready || this.blocked || this.resolving)
      throw Error('Resolve this requirement draft before writing to the project.');
    if (this.state.status === 'error') await this.persist(this.state.value);
    const saved = await this.storage.get();
    if (saved.revision !== this.writer.revision(this.id)) {
      this.blocked = true;
      this.publish({
        status: 'conflict',
        error: 'This requirement edit or answer draft changed in another window.',
      });
      throw Error(
        'This requirement draft changed in another window. Compare versions before writing.',
      );
    }
  }
  beginEdit(fields: RequirementFormFields, expectedVersion: number) {
    this.update((value) => ({ ...value, fields, expectedVersion }));
  }
  discardEdit() {
    this.update((value) => ({ ...value, fields: null, expectedVersion: null }));
  }
  setAnswer(questionId: string, text: string, version: number) {
    this.update((value) => {
      const answers = { ...value.answers };
      if (!text) delete answers[questionId];
      else
        answers[questionId] = {
          text,
          expectedVersion: answers[questionId]?.expectedVersion ?? version,
        };
      return { ...value, answers };
    });
  }
  rebaseAnswer(questionId: string, version: number) {
    this.update((value) => {
      const answer = value.answers[questionId];
      return answer
        ? {
            ...value,
            answers: { ...value.answers, [questionId]: { ...answer, expectedVersion: version } },
          }
        : value;
    });
  }
  async acknowledgeEdit(submitted: RequirementRecordDraft) {
    if (
      this.state.value.fields !== submitted.fields ||
      this.state.value.expectedVersion !== submitted.expectedVersion
    )
      return;
    const value = { ...this.state.value, fields: null, expectedVersion: null };
    this.publish({ value });
    await this.persist(value);
  }
  async acknowledgeAnswer(id: string, submittedText: string) {
    if (this.state.value.answers[id]?.text.trim() !== submittedText) return;
    const answers = { ...this.state.value.answers };
    delete answers[id];
    const value = { ...this.state.value, answers };
    this.publish({ value });
    await this.persist(value);
  }
  async compare() {
    await this.writer.drain(this.id);
    try {
      const saved = await this.storage.get();
      this.publish({
        review: { revision: saved.revision, value: parseRecordDraft(saved.value, this.id) },
      });
    } catch (error) {
      this.publish({ error: String(error) });
    }
  }
  async resolve(choice: 'saved' | 'local') {
    const review = this.state.review;
    if (!review || this.resolving) return;
    this.resolving = true;
    this.publish({ resolving: true });
    try {
      await this.writer.drain(this.id);
      const latest = await this.storage.get();
      if (latest.revision !== review.revision) {
        this.publish({ review: null });
        throw Error('The saved requirement draft changed again. Compare the latest version.');
      }
      this.writer.initialize(this.id, latest.revision);
      this.blocked = false;
      this.writeSequence++;
      if (choice === 'saved')
        this.publish({
          value: parseRecordDraft(latest.value, this.id),
          status: 'saved',
          error: '',
          review: null,
        });
      else {
        await this.persist(this.state.value);
        this.publish({ review: null });
      }
    } catch (error) {
      this.blocked = true;
      this.publish({ status: 'conflict', error: String(error) });
    } finally {
      this.resolving = false;
      this.publish({ resolving: false });
    }
  }
}
