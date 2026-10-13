import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PromptUsageStore } from '../../src/storage/prompt-usage-store.js';

describe('PromptUsageStore', () => {
  let dir: string;
  let store: PromptUsageStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-usage-'));
    store = new PromptUsageStore(path.join(dir, 'prompt-usage.json'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('starts empty and tolerates a missing file', async () => {
    expect(await store.load()).toEqual({});
    expect(await store.get('nope')).toBeUndefined();
    expect(await store.recent()).toEqual([]);
  });

  it('record increments the count and stamps lastUsedAt', async () => {
    const a = await store.record('p1', new Date(1000).toISOString());
    expect(a).toMatchObject({ count: 1 });
    const b = await store.record('p1', new Date(2000).toISOString());
    expect(b).toMatchObject({ count: 2, lastUsedAt: new Date(2000).toISOString() });
    expect((await store.get('p1'))?.count).toBe(2);
  });

  it('coalesces concurrent records without losing increments', async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, index) =>
        store.record('burst', new Date(1000 + index).toISOString()),
      ),
    );
    expect(results.map((usage) => usage.count)).toEqual(
      Array.from({ length: 50 }, (_, index) => index + 1),
    );
    expect((await store.get('burst'))?.count).toBe(50);
  });

  it('preserves increments across concurrent store instances', async () => {
    const file = path.join(dir, 'shared-prompt-usage.json');
    const first = new PromptUsageStore(file);
    const second = new PromptUsageStore(file);
    await Promise.all([
      ...Array.from({ length: 25 }, () => first.record('shared')),
      ...Array.from({ length: 25 }, () => second.record('shared')),
    ]);
    expect((await first.get('shared'))?.count).toBe(50);
  });

  it('invalidates the cache when another writer replaces the file', async () => {
    await store.record('original');
    await store.load();
    await fs.writeFile(
      path.join(dir, 'prompt-usage.json'),
      JSON.stringify({
        version: 1,
        usage: { external: { count: 7, lastUsedAt: new Date(7000).toISOString() } },
      }),
    );
    expect((await store.get('external'))?.count).toBe(7);
  });

  it('recent() orders by lastUsedAt desc; top() by count desc', async () => {
    await store.record('old', new Date(1000).toISOString());
    await store.record('old', new Date(1100).toISOString()); // count 2, last 1100
    await store.record('new', new Date(5000).toISOString()); // count 1, last 5000

    expect((await store.recent()).map((r) => r.slug)).toEqual(['new', 'old']);
    expect((await store.top()).map((r) => r.slug)).toEqual(['old', 'new']);
  });

  it('tolerates a corrupt file', async () => {
    await fs.writeFile(path.join(dir, 'prompt-usage.json'), '{ broken');
    expect(await store.load()).toEqual({});
  });

  // F469: record() is a read-modify-write, and loadInternal mapped a corrupt
  // file to {} — one record then rewrote the file with only the new slug,
  // silently resetting every accumulated count. The read path above keeps
  // degrading to {}; the write path must refuse.
  it('refuses to record over a file it cannot parse, leaving its bytes alone', async () => {
    const file = path.join(dir, 'prompt-usage.json');
    const torn = '{"version":1,"usage":{"veteran":{"count":41';
    await fs.writeFile(file, torn);
    await expect(store.record('fresh', '2026-08-01T00:00:00.000Z')).rejects.toThrow();
    expect(await fs.readFile(file, 'utf8')).toBe(torn);
  });

  it('keeps the counts behind a BOM when recording', async () => {
    const file = path.join(dir, 'prompt-usage.json');
    await fs.writeFile(
      file,
      `\uFEFF${JSON.stringify({
        version: 1,
        usage: { veteran: { count: 41, lastUsedAt: '2026-01-01T00:00:00.000Z' } },
      })}`,
    );
    await store.record('fresh', '2026-08-01T00:00:00.000Z');
    expect((await store.get('veteran'))?.count).toBe(41);
    expect((await store.get('fresh'))?.count).toBe(1);
  });
});
