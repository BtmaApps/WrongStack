import { describe, expect, it } from 'vitest';
import { type FileDraftSnapshot, type FileDraftStorage, FileDraftStore } from '../src/file-draft';

function storage(): FileDraftStorage {
  const values = new Map<string, FileDraftSnapshot>();
  return {
    get: async (key) => structuredClone(values.get(key) ?? { revision: 0, value: null }),
    save: async (key, value, revision) => {
      if ((values.get(key)?.revision ?? 0) !== revision) throw Error('DRAFT_CONFLICT');
      values.set(key, { value: structuredClone(value), revision: revision + 1 });
      return revision + 1;
    },
  };
}
describe('local file draft lifecycle', () => {
  it('recovers the draft and original disk baseline after reopening, clearing only when clean', async () => {
    const db = storage();
    const first = new FileDraftStore(db);
    await Promise.all([
      first.write('src/a.ts', 'edit 1', 'original'),
      first.write('src/a.ts', 'edit 2', 'original'),
    ]);
    const reopened = new FileDraftStore(db);
    expect((await reopened.load('src/a.ts')).value).toMatchObject({
      content: 'edit 2',
      saved: 'original',
    });
    expect((await reopened.load('src/b.ts')).value).toBeNull();
    await reopened.write('src/a.ts', 'edit 2', 'edit 2');
    expect((await new FileDraftStore(db).load('src/a.ts')).value).toBeNull();
  });
  it('blocks stale autosaves, disk saves, and stale explicit conflict resolutions', async () => {
    const db = storage();
    const a = new FileDraftStore(db),
      b = new FileDraftStore(db);
    await Promise.all([a.load('a.ts'), b.load('a.ts')]);
    await a.write('a.ts', 'first window', 'disk');
    await expect(b.write('a.ts', 'second window', 'disk')).rejects.toThrow('DRAFT_CONFLICT');
    await expect(b.verify('a.ts')).rejects.toThrow('DRAFT_CONFLICT');
    const reviewed = await b.inspect('a.ts');
    await a.write('a.ts', 'newer first window', 'disk');
    await expect(b.resolve('a.ts', reviewed.revision, 'second window', 'disk')).rejects.toThrow(
      'DRAFT_CONFLICT',
    );
    const latest = await b.inspect('a.ts');
    await b.resolve('a.ts', latest.revision, 'second window', 'disk');
    expect((await new FileDraftStore(db).load('a.ts')).value?.content).toBe('second window');
    await expect(a.verify('a.ts')).rejects.toThrow('DRAFT_CONFLICT');
  });
  it('retains storage failures instead of permitting an unprotected disk save', async () => {
    const db = storage();
    db.save = async () => {
      throw Error('disk full');
    };
    const store = new FileDraftStore(db);
    await expect(store.write('a.ts', 'draft', 'disk')).rejects.toThrow('disk full');
    await expect(store.verify('a.ts')).rejects.toThrow('disk full');
  });
});
