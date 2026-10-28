import { describe, expect, it } from 'vitest';
import {
  defaultHistoryView,
  HistoryViewStore,
  parseHistoryView,
  type SavedHistoryView,
} from '../src/history-view-store';

function persistence() {
  let value: SavedHistoryView | null = null,
    revision = 0;
  return {
    get: async () => ({ value: structuredClone(value), revision }),
    save: async (next: SavedHistoryView | null, expected: number) => {
      if (expected !== revision) throw Error('DRAFT_CONFLICT');
      value = structuredClone(next);
      return ++revision;
    },
  };
}
describe('project history view preferences', () => {
  it('persists filters and exact-ID anchors across controller replacement without storing stale offsets', async () => {
    const storage = persistence(),
      first = new HistoryViewStore(storage);
    await first.load();
    const view = {
      pageSize: 200,
      query: 'release',
      provider: 'local',
      outcome: 'completed',
      includeEmpty: true,
      selectedId: '2026-01/session',
      anchorId: '2026-01/first-row',
    };
    first.change(view);
    await first.flush();
    const reopened = new HistoryViewStore(storage);
    await reopened.load();
    expect(reopened.snapshot().value).toEqual(view);
    expect((await storage.get()).value).toEqual({ version: 1, view });
    expect(
      parseHistoryView({ version: 1, view: { ...view, offset: 1000, revision: 'obsolete' } }),
    ).toEqual(view);
  });
  it('merges only independently changed preference fields from other windows', async () => {
    const storage = persistence(),
      a = new HistoryViewStore(storage),
      b = new HistoryViewStore(storage);
    await a.load();
    await b.load();
    a.change({ pageSize: 50, query: 'alpha' });
    await a.flush();
    b.change({ provider: 'saved-provider' });
    await b.flush();
    expect((await storage.get()).value?.view).toMatchObject({
      pageSize: 50,
      query: 'alpha',
      provider: 'saved-provider',
    });
    a.change({ query: 'newest-query' });
    await a.flush();
    expect((await storage.get()).value?.view.provider).toBe('saved-provider');
  });
  it('persists an explicit selection clear even when that window already has no local selection', async () => {
    const storage = persistence(),
      a = new HistoryViewStore(storage),
      b = new HistoryViewStore(storage);
    await a.load();
    await b.load();
    a.change({ selectedId: 'record-in-a', anchorId: 'first-in-a' });
    await a.flush();
    b.change({ selectedId: '', anchorId: 'first-in-b' });
    await b.flush();
    expect((await storage.get()).value?.view).toMatchObject({
      selectedId: '',
      anchorId: 'first-in-b',
    });
  });
  it('retries a racing revision with a fresh merge and bounds repeated conflicts', async () => {
    const storage = persistence();
    let collisions = 1;
    const store = new HistoryViewStore({
      ...storage,
      save: async (...args) => {
        if (collisions-- > 0) {
          const latest = await storage.get();
          await storage.save(
            { version: 1, view: { ...defaultHistoryView(), provider: 'concurrent' } },
            latest.revision,
          );
        }
        return storage.save(...args);
      },
    });
    await store.load();
    store.change({ query: 'retain' });
    await store.flush();
    expect((await storage.get()).value?.view).toMatchObject({
      query: 'retain',
      provider: 'concurrent',
    });
    let attempts = 0;
    const blocked = new HistoryViewStore({
      ...storage,
      save: async () => {
        attempts++;
        throw Error('DRAFT_CONFLICT');
      },
    });
    await blocked.load();
    blocked.change({ query: 'unsaved' });
    await blocked.flush();
    expect(attempts).toBe(3);
    expect(blocked.snapshot()).toMatchObject({ value: { query: 'unsaved' }, saving: false });
    expect(blocked.snapshot().error).toContain('not saved');
    expect((await storage.get()).value?.view.query).toBe('retain');
  });
  it('keeps edits arriving during persistence and retries a failed write without losing local view', async () => {
    const storage = persistence();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0,
      fail = false;
    const store = new HistoryViewStore({
      ...storage,
      save: async (...args) => {
        if (++calls === 1) await gate;
        if (fail) throw Error('Disk unavailable');
        return storage.save(...args);
      },
    });
    await store.load();
    store.change({ query: 'first' });
    store.change({ query: 'last', includeEmpty: true });
    release();
    await store.flush();
    expect((await storage.get()).value?.view).toMatchObject({ query: 'last', includeEmpty: true });
    fail = true;
    store.change({ query: 'retry me' });
    await store.flush();
    expect(store.snapshot().value.query).toBe('retry me');
    expect(store.snapshot().error).toContain('not saved');
    fail = false;
    await store.retry();
    expect((await storage.get()).value?.view.query).toBe('retry me');
  });
  it('keeps the library usable with defaults after malformed storage and does not overwrite it', async () => {
    let writes = 0;
    const store = new HistoryViewStore({
      get: async () => ({ revision: 1, value: { version: 999 } }),
      save: async () => {
        writes++;
        return 2;
      },
    });
    await store.load();
    expect(store.snapshot()).toMatchObject({ ready: true, value: defaultHistoryView() });
    store.change({ query: 'local only' });
    await store.flush();
    expect(writes).toBe(0);
    expect(store.snapshot().value.query).toBe('local only');
  });
  it.each([
    { pageSize: 500 },
    { query: 'x'.repeat(501) },
    { outcome: 'unknown' },
    { selectedId: 'x'.repeat(1025) },
    { includeEmpty: 'yes' },
  ])('rejects unsupported saved values %j', (patch) => {
    expect(() =>
      parseHistoryView({ version: 1, view: { ...defaultHistoryView(), ...patch } }),
    ).toThrow('unsupported');
  });
});
