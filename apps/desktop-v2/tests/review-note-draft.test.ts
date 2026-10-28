import { describe, expect, it } from 'vitest';
import { parseReviewNote, ReviewNoteDraft, type SavedReviewNote } from '../src/review-note-draft';

function persistence() {
  let value: SavedReviewNote | null = null,
    revision = 0;
  return {
    get: async () => ({ value: structuredClone(value), revision }),
    save: async (next: SavedReviewNote | null, expected: number) => {
      if (expected !== revision) throw Error('DRAFT_CONFLICT');
      value = structuredClone(next);
      return ++revision;
    },
  };
}
describe('durable project report note drafts', () => {
  it('recovers exact unsent text after controller replacement and clears only acknowledged submission', async () => {
    const storage = persistence();
    const first = new ReviewNoteDraft(storage, 'r1');
    await first.load();
    first.edit('Keep exact text\n');
    await first.flush();
    const reopened = new ReviewNoteDraft(storage, 'r1');
    await reopened.load();
    expect(reopened.snapshot().text).toBe('Keep exact text\n');
    const submitted = (await reopened.begin())!;
    expect(submitted.text).toBe('Keep exact text\n');
    expect(await reopened.begin()).toBeNull();
    reopened.edit('Blocked while sending');
    expect(reopened.snapshot().text).toBe(submitted.text);
    await reopened.finish(submitted, 'Not acknowledged');
    expect(reopened.snapshot()).toMatchObject({
      text: submitted.text,
      error: 'Not acknowledged',
      busy: false,
    });
    expect((await storage.get()).value?.text).toBe(submitted.text);
    await reopened.finish((await reopened.begin())!);
    expect((await storage.get()).value).toBeNull();
    const cleared = new ReviewNoteDraft(storage, 'r1');
    await cleared.load();
    expect(cleared.snapshot().text).toBe('');
  });
  it('coalesces edits arriving during a save without losing the latest text', async () => {
    const storage = persistence();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const note = new ReviewNoteDraft(
      {
        ...storage,
        save: async (...args) => {
          if (++calls === 1) await gate;
          return storage.save(...args);
        },
      },
      'r1',
    );
    await note.load();
    note.edit('first');
    note.edit('latest');
    release();
    await note.flush();
    expect((await storage.get()).value?.text).toBe('latest');
    expect(note.snapshot()).toMatchObject({ text: 'latest', dirty: false, saving: false });
  });
  it('retains competing versions, refuses submit, and only overwrites after reviewed local choice', async () => {
    const storage = persistence(),
      a = new ReviewNoteDraft(storage, 'r1'),
      b = new ReviewNoteDraft(storage, 'r1');
    await a.load();
    await b.load();
    a.edit('saved in A');
    await a.flush();
    b.edit('local in B');
    await b.flush();
    expect(b.snapshot()).toMatchObject({
      text: 'local in B',
      review: { text: 'saved in A', revision: 1 },
    });
    expect(await b.begin()).toBeNull();
    await b.resolve('local');
    expect((await storage.get()).value?.text).toBe('local in B');
    expect(await a.begin()).toBeNull();
    expect(a.snapshot().review?.text).toBe('local in B');
    await a.load();
    expect(a.snapshot().text).toBe('saved in A');
    expect(a.snapshot().review?.text).toBe('local in B');
    await a.resolve('saved');
    expect(a.snapshot().text).toBe('local in B');
  });
  it('requires another review when the saved version changes again before choosing', async () => {
    const storage = persistence(),
      a = new ReviewNoteDraft(storage, 'r1'),
      b = new ReviewNoteDraft(storage, 'r1');
    await a.load();
    await b.load();
    a.edit('remote one');
    await a.flush();
    b.edit('local');
    await b.flush();
    a.edit('remote two');
    await a.flush();
    await b.resolve('local');
    expect(b.snapshot().review?.text).toBe('remote two');
    expect((await storage.get()).value?.text).toBe('remote two');
    await b.resolve('local');
    expect((await storage.get()).value?.text).toBe('local');
  });
  it('does not clear a newer window draft after another window records its reviewed note', async () => {
    const storage = persistence(),
      a = new ReviewNoteDraft(storage, 'r1'),
      b = new ReviewNoteDraft(storage, 'r1');
    await a.load();
    a.edit('send this');
    await a.flush();
    await b.load();
    const submitted = (await a.begin())!;
    b.edit('newer note');
    await b.flush();
    await a.finish(submitted);
    expect((await storage.get()).value?.text).toBe('newer note');
    expect(a.snapshot().review?.text).toBe('newer note');
    expect(await a.begin()).toBeNull();
  });
  it('retains text on storage failure and requires explicit review before retry', async () => {
    const storage = persistence();
    let fail = true;
    const note = new ReviewNoteDraft(
      {
        ...storage,
        save: async (...args) => {
          if (fail) throw Error('Disk unavailable');
          return storage.save(...args);
        },
      },
      'r1',
    );
    await note.load();
    note.edit('retain me');
    await note.flush();
    expect(note.snapshot()).toMatchObject({ text: 'retain me', dirty: true });
    expect(await note.begin()).toBeNull();
    fail = false;
    await note.load();
    expect(note.snapshot().review?.text).toBe('');
    await note.resolve('local');
    expect((await storage.get()).value?.text).toBe('retain me');
  });
  it('rejects corrupt or cross-report data before enabling edits', async () => {
    expect(() => parseReviewNote({ version: 1, reportId: 'other', text: 'private' }, 'r1')).toThrow(
      'another report',
    );
    expect(() => parseReviewNote({ version: 2, reportId: 'r1', text: 'private' }, 'r1')).toThrow(
      'unsupported',
    );
    expect(() =>
      parseReviewNote({ version: 1, reportId: 'r1', text: 'x'.repeat(100001) }, 'r1'),
    ).toThrow('unsupported');
    const note = new ReviewNoteDraft(
      {
        get: async () => ({
          revision: 1,
          value: { version: 1, reportId: 'other', text: 'private' },
        }),
        save: async () => 2,
      },
      'r1',
    );
    await note.load();
    note.edit('must not overwrite');
    expect(note.snapshot()).toMatchObject({ ready: false, text: '' });
  });
});
