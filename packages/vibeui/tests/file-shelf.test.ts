import { describe, expect, it } from 'vitest';
import {
  emptyFileShelf,
  fileShelfKey,
  MAX_PINNED_FILES,
  MAX_RECENT_FILES,
  readFileShelf,
  rememberFile,
  togglePinnedFile,
} from '../src/lib/file-shelf';

describe('project-scoped handy files', () => {
  it('keeps projects apart and normalizes Windows path spelling', () => {
    expect(fileShelfKey('D:\\Workspace\\Studio\\')).toBe(fileShelfKey('d:/workspace/studio'));
    expect(fileShelfKey('D:/workspace/studio')).not.toBe(fileShelfKey('D:/workspace/another'));
    expect(fileShelfKey('/Work/project')).not.toBe(fileShelfKey('/work/project'));
    expect(fileShelfKey('')).toBe('');
  });
  it.each([null, '', '{bad', '[]', 'null'])('starts clean with invalid storage: %s', (raw) => {
    expect(readFileShelf(raw)).toEqual(emptyFileShelf());
  });
  it('accepts only file shortcuts, deduplicates and bounds stored lists', () => {
    const paths = Array.from({ length: 20 }, (_, index) => `src/${index}.ts`);
    const shelf = readFileShelf(
      JSON.stringify({
        pinned: [null, '', '\u0000bad', paths[0], ...paths],
        recent: paths,
        expanded: false,
      }),
    );
    expect(shelf.pinned).toEqual(paths.slice(0, MAX_PINNED_FILES));
    expect(shelf.recent).toEqual(paths.slice(0, MAX_RECENT_FILES));
    expect(shelf.expanded).toBe(false);
  });
  it('moves a recently opened file to the front without changing pins', () => {
    const original = { pinned: ['keep.md'], recent: ['a.md', 'b.md'], expanded: false };
    const next = rememberFile(original, 'b.md');
    expect(next).toEqual({ ...original, recent: ['b.md', 'a.md'] });
    expect(original.recent).toEqual(['a.md', 'b.md']);
    expect(rememberFile(next, 'b.md')).toBe(next);
    let bounded = emptyFileShelf();
    for (let index = 0; index < 20; index++) bounded = rememberFile(bounded, `${index}.md`);
    expect(bounded.recent).toEqual(['19.md', '18.md', '17.md', '16.md', '15.md']);
  });
  it('limits pins without dropping existing shortcuts and only removes the chosen pin', () => {
    let shelf = emptyFileShelf();
    for (let index = 0; index < MAX_PINNED_FILES; index++)
      shelf = togglePinnedFile(shelf, `${index}.md`);
    expect(togglePinnedFile(shelf, 'extra.md')).toBe(shelf);
    const removed = togglePinnedFile(shelf, '2.md');
    expect(removed.pinned).not.toContain('2.md');
    expect(removed.pinned).toHaveLength(MAX_PINNED_FILES - 1);
    expect(shelf.pinned).toHaveLength(MAX_PINNED_FILES);
    expect(removed.recent).toEqual(shelf.recent);
  });
});
