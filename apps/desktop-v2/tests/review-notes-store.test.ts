import { expect, it } from 'vitest';
import {
  parseReviewNotes,
  ReviewNotesStore,
  type SavedReviewNotes,
} from '../src/review-notes-store';

it('restores project review notes and refuses a stale window without discarding its saved view', async () => {
  let revision = 0,
    value: SavedReviewNotes | null = null;
  const storage = {
    get: async () => ({ revision, value }),
    save: async (next: SavedReviewNotes | null, expected: number) => {
      if (revision !== expected) throw Error('revision conflict');
      value = structuredClone(next);
      return ++revision;
    },
  };
  const first = new ReviewNotesStore(storage),
    peer = new ReviewNotesStore(storage);
  await first.load();
  await peer.load();
  const note = { path: 'src/main.ts', line: 3, text: 'Preserve the project boundary.' };
  await first.save([note]);
  await expect(peer.save([{ ...note, text: 'A stale replacement' }])).rejects.toThrow(
    'revision conflict',
  );
  expect(first.snapshot().notes).toEqual([note]);
  expect(peer.snapshot().error).toContain('Another window');
  const restarted = new ReviewNotesStore(storage);
  await restarted.load();
  expect(restarted.snapshot().notes).toEqual([note]);
  await peer.load();
  await peer.save([]);
  await restarted.load();
  expect(restarted.snapshot().notes).toEqual([]);
});
it('rejects malformed note anchors and keeps storage failures visible', async () => {
  expect(() =>
    parseReviewNotes({ version: 1, notes: [{ path: 'a', line: 0, text: 'bad' }] }),
  ).toThrow('unsupported');
  const broken = new ReviewNotesStore({
    get: async () => {
      throw Error('database unavailable');
    },
    save: async () => 1,
  });
  await broken.load();
  expect(broken.snapshot().ready).toBe(false);
  expect(broken.snapshot().error).toContain('database unavailable');
  await expect(broken.save([])).rejects.toThrow('loading');
});
it('migrates existing window notes only when there is no saved project collection', async () => {
  const note = { path: 'a.ts', line: 1, text: 'Existing window note' };
  let saved: unknown;
  const store = new ReviewNotesStore(
    {
      get: async () => ({ revision: 0, value: null }),
      save: async (value, revision) => {
        expect(revision).toBe(0);
        saved = value;
        return 1;
      },
    },
    [note],
  );
  await store.load();
  expect(parseReviewNotes(saved)).toEqual([note]);
  expect(store.snapshot().revision).toBe(1);
});
