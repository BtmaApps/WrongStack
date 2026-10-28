import type { ProjectFormDraftStorage, RequirementDraftSnapshot } from './requirement-draft';

export interface SavedReviewNote {
  version: 1;
  reportId: string;
  text: string;
}
export interface ReviewNoteState {
  text: string;
  revision: number;
  ready: boolean;
  dirty: boolean;
  saving: boolean;
  busy: boolean;
  error: string;
  review: { text: string; revision: number } | null;
}
export function parseReviewNote(value: unknown, reportId: string): string {
  if (value === null) return '';
  const note = value as Partial<SavedReviewNote> | undefined;
  if (
    note?.version !== 1 ||
    note.reportId !== reportId ||
    typeof note.text !== 'string' ||
    note.text.length > 100000
  )
    throw Error('Saved review note has an unsupported format or belongs to another report.');
  return note.text;
}
export class ReviewNoteDraft {
  private state: ReviewNoteState = {
    text: '',
    revision: 0,
    ready: false,
    dirty: false,
    saving: false,
    busy: false,
    error: '',
    review: null,
  };
  private listeners = new Set<() => void>();
  private pending: Promise<void> | null = null;
  private loading: Promise<void> | null = null;
  private blocked = false;
  private preparing = false;
  private resolving = false;
  private version = 0;
  constructor(
    private storage: ProjectFormDraftStorage<SavedReviewNote>,
    private reportId: string,
  ) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<ReviewNoteState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  private read(saved: RequirementDraftSnapshot) {
    if (!Number.isSafeInteger(saved.revision) || saved.revision < 0)
      throw Error('Invalid saved note revision.');
    return { text: parseReviewNote(saved.value, this.reportId), revision: saved.revision };
  }
  load = (): Promise<void> => {
    if (this.state.busy) return Promise.resolve();
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const version = this.version;
      try {
        await this.pending;
        const saved = this.read(await this.storage.get());
        if (
          this.state.ready &&
          (this.state.dirty ||
            this.state.review ||
            (this.version !== version && saved.text !== this.state.text))
        ) {
          this.update({
            review: saved,
            error: 'Review your local note and the saved note before continuing.',
          });
        } else {
          this.blocked = false;
          this.update({ ...saved, ready: true, dirty: false, review: null, error: '' });
        }
      } catch (error) {
        this.update({ error: String(error) });
      }
    })().finally(() => {
      this.loading = null;
    });
    return this.loading;
  };
  edit = (text: string) => {
    if (!this.state.ready || this.state.busy || text.length > 100000) return;
    this.version++;
    this.update({ text, dirty: true });
    void this.flush();
  };
  flush = (): Promise<void> => {
    if (this.pending) return this.pending;
    if (!this.state.ready || this.blocked || this.state.review || !this.state.dirty)
      return Promise.resolve();
    this.update({ saving: true });
    this.pending = (async () => {
      while (this.state.dirty && !this.blocked && !this.state.review) {
        const { text, revision } = this.state;
        const version = this.version;
        try {
          const next = await this.storage.save(
            text ? { version: 1, reportId: this.reportId, text } : null,
            revision,
          );
          if (next !== revision + 1) throw Error('Invalid note save acknowledgement.');
          this.update({ revision: next, dirty: version !== this.version, error: '' });
        } catch (error) {
          this.blocked = true;
          this.update({
            error:
              'This note is not saved. Your local text is retained. Reload saved note to review before retrying.',
          });
          if (String(error).includes('DRAFT_CONFLICT')) {
            try {
              this.update({ review: this.read(await this.storage.get()) });
            } catch (readError) {
              this.update({ error: String(readError) });
            }
          }
        }
      }
    })().finally(() => {
      this.pending = null;
      this.update({ saving: false });
    });
    return this.pending;
  };
  resolve = async (choice: 'local' | 'saved') => {
    const review = this.state.review;
    if (!review || this.state.busy || this.state.saving || this.resolving) return;
    this.resolving = true;
    const version = this.version;
    try {
      const latest = this.read(await this.storage.get());
      if (version !== this.version) return;
      if (latest.revision !== review.revision) {
        this.update({
          review: latest,
          error: 'The saved note changed again. Review the new saved version.',
        });
        return;
      }
      this.blocked = false;
      this.version++;
      this.update({
        revision: latest.revision,
        review: null,
        error: '',
        ...(choice === 'saved' ? { text: latest.text, dirty: false } : { dirty: true }),
      });
      if (choice === 'local') await this.flush();
    } catch (error) {
      this.update({ error: String(error) });
    } finally {
      this.resolving = false;
    }
  };
  begin = async (): Promise<{ text: string; version: number } | null> => {
    if (this.preparing) return null;
    this.preparing = true;
    try {
      await this.flush();
      if (
        !this.state.ready ||
        this.state.busy ||
        this.state.dirty ||
        this.state.review ||
        !this.state.text.trim()
      )
        return null;
      const submitted = { text: this.state.text, version: this.version };
      const saved = this.read(await this.storage.get());
      if (submitted.version !== this.version || this.state.dirty || this.state.saving) return null;
      if (saved.revision !== this.state.revision) {
        this.blocked = true;
        this.update({
          review: saved,
          error: 'The saved note changed before submission. Review both versions.',
        });
        return null;
      }
      this.update({ busy: true, error: '' });
      return submitted;
    } catch (error) {
      this.update({ error: String(error) });
      return null;
    } finally {
      this.preparing = false;
    }
  };
  finish = async (submitted: { text: string; version: number }, error = '') => {
    this.update({ busy: false, error });
    if (!error && this.version === submitted.version) {
      this.version++;
      this.update({ text: '', dirty: true });
      await this.flush();
    }
  };
}
