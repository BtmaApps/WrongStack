import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionCatalogStore } from '../../src/session-catalog/store.js';
import { inheritsIntoFork } from '../../src/storage/session-store/replay.js';
import { DefaultSessionStore } from '../../src/storage/session-store.js';
import { SessionSummaryTracker } from '../../src/storage/session-summary-tracker.js';
import type { SessionEvent } from '../../src/types/session.js';

let tmp: string;
let sourceDir: string;
let targetDir: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'session-move-'));
  sourceDir = path.join(tmp, 'a', 'sessions');
  targetDir = path.join(tmp, 'b', 'sessions');
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

const ID = '2026-09-24/sess_move';

async function closedSession(store: DefaultSessionStore, id = ID): Promise<string> {
  const ts = '2026-09-24T10:00:00.000Z';
  const writer = await store.create({ id, model: 'm', provider: 'p', checkout: '/repo/main' });
  await writer.append({ type: 'user_input', ts, content: 'build the thing' });
  await writer.append({
    type: 'llm_response',
    ts,
    content: [{ type: 'text', text: 'done' }],
    stopReason: 'end_turn',
    usage: { input: 3, output: 2 },
  });
  await writer.close();
  return writer.id;
}

async function journalEvents(dir: string, id: string): Promise<SessionEvent[]> {
  const raw = await fs.readFile(path.join(dir, `${id}.jsonl`), 'utf8');
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SessionEvent);
}

describe('session move: another worktree of the same repository', () => {
  it('re-stamps the checkout in place and keeps the name', async () => {
    const store = new DefaultSessionStore({ dir: sourceDir });
    const id = await closedSession(store);
    await store.rename(id, 'Checkout redesign');

    const result = await store.move(id, { store, checkout: '/repo/feature' });

    expect(result).toMatchObject({ id, kind: 'worktree', checkout: path.resolve('/repo/feature') });
    const [listed] = await store.list(5);
    expect(listed).toMatchObject({
      id,
      name: 'Checkout redesign',
      checkout: path.resolve('/repo/feature'),
    });
    const events = await journalEvents(sourceDir, id);
    expect(events.at(-1)).toMatchObject({
      type: 'session_moved',
      checkout: path.resolve('/repo/feature'),
    });
    expect(events.at(-1)).not.toHaveProperty('fromProject');
  });

  it('survives an index rebuild, because the checkout comes from the journal', async () => {
    const store = new DefaultSessionStore({ dir: sourceDir });
    const id = await closedSession(store);
    await store.move(id, { store, checkout: '/repo/feature' });
    await fs.rm(path.join(sourceDir, `${id}.summary.json`), { force: true });
    await store.rebuildIndex();
    const fresh = new DefaultSessionStore({ dir: sourceDir });
    expect((await fresh.list(5))[0]?.checkout).toBe(path.resolve('/repo/feature'));
  });

  it('drops the redo stash, whose tail would cut the move event out again', async () => {
    const store = new DefaultSessionStore({ dir: sourceDir });
    const id = await closedSession(store);
    const stash = path.join(sourceDir, `${id}.jsonl.redo`);
    await fs.mkdir(stash, { recursive: true });
    await fs.writeFile(path.join(stash, 'stack.json'), '[]');
    await store.move(id, { store, checkout: '/repo/feature' });
    await expect(fs.stat(stash)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('session move: another project', () => {
  it('moves the journal, sidecars and session directory, and indexes it there', async () => {
    const source = new DefaultSessionStore({ dir: sourceDir, projectRoot: path.join(tmp, 'a') });
    const target = new DefaultSessionStore({ dir: targetDir, projectRoot: path.join(tmp, 'b') });
    const id = await closedSession(source);
    await source.rename(id, 'Wrong project');
    await fs.writeFile(path.join(sourceDir, `${id}.todos.json`), '{"todos":[]}');
    await fs.mkdir(path.join(sourceDir, id, 'subagents'), { recursive: true });
    await fs.writeFile(path.join(sourceDir, id, 'subagents', 'a.jsonl'), '{}\n');

    const result = await source.move(id, { store: target, checkout: path.join(tmp, 'b') });

    expect(result).toMatchObject({ kind: 'project', fromProject: path.join(tmp, 'a') });
    expect(await source.list(5)).toEqual([]);
    await expect(fs.stat(path.join(sourceDir, `${id}.jsonl`))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    const [moved] = await target.list(5);
    expect(moved).toMatchObject({ id, name: 'Wrong project', checkout: path.join(tmp, 'b') });
    expect(await fs.readFile(path.join(targetDir, `${id}.todos.json`), 'utf8')).toBe(
      '{"todos":[]}',
    );
    expect(await fs.readFile(path.join(targetDir, id, 'subagents', 'a.jsonl'), 'utf8')).toBe(
      '{}\n',
    );
    const events = await journalEvents(targetDir, id);
    expect(events.at(-1)).toMatchObject({
      type: 'session_moved',
      fromProject: path.join(tmp, 'a'),
    });
    // The conversation came along and still replays.
    const loaded = await target.load(id);
    expect(loaded.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('refuses a session that is open somewhere and touches nothing', async () => {
    const id = await closedSession(new DefaultSessionStore({ dir: sourceDir }));
    const source = new DefaultSessionStore({
      dir: sourceDir,
      isSessionInUse: async () => 'active in the TUI (PID 42)',
    });
    const target = new DefaultSessionStore({ dir: targetDir });
    await expect(source.move(id, { store: target, checkout: tmp })).rejects.toThrow(
      /in use \(active in the TUI \(PID 42\)\)/,
    );
    expect((await source.list(5)).map((s) => s.id)).toEqual([id]);
    await expect(fs.stat(targetDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses when the target already has that session', async () => {
    const source = new DefaultSessionStore({ dir: sourceDir });
    const target = new DefaultSessionStore({ dir: targetDir });
    const id = await closedSession(source);
    await fs.mkdir(path.dirname(path.join(targetDir, `${id}.jsonl`)), { recursive: true });
    await fs.writeFile(path.join(targetDir, `${id}.jsonl`), '{}\n');
    await expect(source.move(id, { store: target, checkout: tmp })).rejects.toThrow(
      /already has a session/,
    );
    expect((await source.list(5)).map((s) => s.id)).toEqual([id]);
  });

  it('restores an archived session before moving it', async () => {
    const source = new DefaultSessionStore({ dir: sourceDir });
    const target = new DefaultSessionStore({ dir: targetDir });
    const id = await closedSession(source);
    expect((await source.archive(id)).action).toBe('archived');
    await source.move(id, { store: target, checkout: tmp });
    const events = await journalEvents(targetDir, id);
    expect(events.at(-1)?.type).toBe('session_moved');
  });
});

describe('session_moved readers', () => {
  it('a live summary takes its checkout from the move event', () => {
    const tracker = new SessionSummaryTracker({
      meta: { id: 's', model: 'm', provider: 'p', startedAt: '2026-09-24T10:00:00.000Z' },
    } as never);
    tracker.observe({
      type: 'session_moved',
      ts: '2026-09-24T10:00:01.000Z',
      checkout: '/repo/feature',
    });
    expect(tracker.snapshot().checkout).toBe('/repo/feature');
  });

  it('a fork does not inherit its parent move', () => {
    expect(inheritsIntoFork({ type: 'session_moved', ts: 't', checkout: '/elsewhere' })).toBe(
      false,
    );
  });

  it('the catalog refuses a move lease while the session is live', async () => {
    // Its own temp root: the catalog's SQLite handle stays open on Windows
    // until the test ends, so it cannot live under the per-test directory.
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'session-move-catalog-'));
    await fs.mkdir(path.join(root, 'sessions', '2026-09-24'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'sessions', `${ID}.jsonl`),
      `${JSON.stringify({ type: 'session_start', ts: '2026-09-24T10:00:00.000Z', id: ID, model: 'm', provider: 'p' })}\n`,
    );
    const catalog = new SessionCatalogStore(root);
    catalog.rebuildCatalog();
    const now = new Date().toISOString();
    const live = catalog.claimNew(
      {
        sessionId: ID,
        projectSlug: 'project-a',
        projectRoot: root,
        projectName: 'project-a',
        workingDir: root,
        clientType: 'tui',
        status: 'active',
        pid: process.pid,
        startedAt: now,
        lastHeartbeatAt: now,
        agentCount: 0,
        agents: [],
      },
      'owner',
    );
    expect(() => catalog.acquireMaintenance(ID, 'move', 'mover')).toThrow(/live/);
    catalog.release(live);
    expect(catalog.acquireMaintenance(ID, 'move', 'mover').operation).toBe('move');
    catalog.close();
    await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
  });
});
