import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getPromptJournalEntries } from '../src/index.js';

let root = '';
afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
  root = '';
});

/** Writes entries where the recorder would: `<YYYY-MM>/<YYYY-MM-DD>` of the UTC timestamp. */
async function seed(timestamps: string[]) {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'pj-page-'));
  for (const [index, timestamp] of timestamps.entries()) {
    const day = timestamp.slice(0, 10);
    const dir = path.join(root, '.wrongstack', 'prompts', day.slice(0, 7), day);
    await fs.mkdir(dir, { recursive: true });
    const entry = {
      id: `p${index}`,
      timestamp,
      sessionId: 'sess_a',
      role: 'user',
      category: 'raw_user',
      content: `prompt ${index}`,
      metadata: {},
    };
    await fs.appendFile(path.join(dir, 'session-sess_a.jsonl'), `${JSON.stringify(entry)}\n`);
  }
}

describe('prompt journal paging bound', () => {
  it('pages older history with an inclusive until bound across days and months', async () => {
    await seed([
      '2026-09-30T23:59:00.000Z',
      '2026-10-01T00:00:00.000Z',
      '2026-10-01T08:00:00.000Z',
      '2026-10-02T09:00:00.000Z',
      '2026-10-03T10:00:00.000Z',
    ]);
    const ids = (entries: { id: string }[]) => entries.map((entry) => entry.id);
    const newest = await getPromptJournalEntries(root, { limit: 2 });
    expect(ids(newest)).toEqual(['p3', 'p4']);
    // The caller passes the oldest timestamp it holds; that entry returns again (inclusive)
    // and is de-duplicated by id, so equal timestamps are never skipped.
    const older = await getPromptJournalEntries(root, { limit: 2, until: newest[0]!.timestamp });
    expect(ids(older)).toEqual(['p2', 'p3']);
    const oldest = await getPromptJournalEntries(root, { limit: 3, until: older[0]!.timestamp });
    expect(ids(oldest)).toEqual(['p0', 'p1', 'p2']);
    expect(ids(await getPromptJournalEntries(root, { until: '2026-09-30T23:58:59.999Z' }))).toEqual(
      [],
    );
  });
  it('bounds since and until together, including entries exactly on either bound', async () => {
    await seed([
      '2026-10-01T00:00:00.000Z',
      '2026-10-02T00:00:00.000Z',
      '2026-10-03T00:00:00.000Z',
    ]);
    const entries = await getPromptJournalEntries(root, {
      since: '2026-10-01T00:00:00.000Z',
      until: '2026-10-02T00:00:00.000Z',
    });
    expect(entries.map((entry) => entry.id)).toEqual(['p0', 'p1']);
  });
});
