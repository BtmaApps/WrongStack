import type { ProjectFormDraftStorage } from './requirement-draft';

export interface ReviewNote {
  path: string;
  line: number;
  text: string;
}
export interface SavedReviewNotes {
  version: 1;
  notes: ReviewNote[];
}
export function parseReviewNotes(value: unknown): ReviewNote[] {
  if (value === null) return [];
  const data = value as Partial<SavedReviewNotes> | undefined;
  if (
    data?.version !== 1 ||
    !Array.isArray(data.notes) ||
    data.notes.length > 500 ||
    data.notes.some(
      (note) =>
        !note ||
        typeof note.path !== 'string' ||
        !note.path ||
        !Number.isSafeInteger(note.line) ||
        note.line < 1 ||
        typeof note.text !== 'string' ||
        !note.text.trim(),
    )
  )
    throw Error('Saved review notes have an unsupported format.');
  return data.notes.map((note) => ({ ...note }));
}
export class ReviewNotesStore {
  private state = { notes: [] as ReviewNote[], revision: 0, ready: false, busy: false, error: '' };
  private listeners = new Set<() => void>();
  constructor(
    private storage: ProjectFormDraftStorage<SavedReviewNotes>,
    private initial: ReviewNote[] = [],
  ) {
    this.state = { ...this.state, notes: initial };
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<typeof this.state>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  load = async () => {
    if (this.state.busy) return;
    this.update({ busy: true, error: '' });
    try {
      const saved = await this.storage.get();
      const notes = saved.value === null ? this.initial : parseReviewNotes(saved.value);
      let revision = saved.revision;
      if (saved.value === null && notes.length) {
        const value: SavedReviewNotes = { version: 1, notes };
        parseReviewNotes(value);
        revision = await this.storage.save(value, revision);
      }
      this.update({
        notes,
        revision,
        ready: true,
      });
    } catch (error) {
      this.update({ error: String(error), ready: false });
    } finally {
      this.update({ busy: false });
    }
  };
  save = async (notes: ReviewNote[]) => {
    if (!this.state.ready || this.state.busy)
      throw Error('Wait for review notes to finish loading or saving.');
    const value: SavedReviewNotes = { version: 1, notes };
    parseReviewNotes(value);
    this.update({ busy: true, error: '' });
    try {
      const revision = await this.storage.save(value, this.state.revision);
      this.initial = [];
      this.update({ notes, revision });
    } catch (error) {
      this.update({
        error:
          'Review notes were not saved. Another window may have changed them. Reload saved review notes before retrying.',
      });
      throw error;
    } finally {
      this.update({ busy: false });
    }
  };
}
