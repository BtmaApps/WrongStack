import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { SqliteMemoryPort } from '@wrongstack/sage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildMemoryCommand } from '../src/slash-commands/memory.js';

let root: string;
let openStores: SqliteMemoryPort[] = [];

/** Track each store so its SQLite handle is closed before the temp dir is removed. */
function newPort(opts: { projectRoot: string }): SqliteMemoryPort {
  const store = new SqliteMemoryPort(opts);
  openStores.push(store);
  return store;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-slash-memory-'));
  openStores = [];
});

afterEach(async () => {
  for (const store of openStores) {
    try {
      store.close();
    } catch {
      /* already closed */
    }
  }
  // Give Windows a tick to release SQLite WAL file handles before removal.
  await new Promise((resolve) => setTimeout(resolve, 10));
  await fs.rm(root, { recursive: true, force: true });
});

function command(store: SqliteMemoryPort) {
  return buildMemoryCommand({ memoryStore: store, projectRoot: root, cwd: root } as never);
}

/** Build a /memory command with a stubbed LLM provider for `compact`. */
function commandWithLlm(store: SqliteMemoryPort, opsJson: unknown) {
  const provider = {
    async complete() {
      return { content: [{ type: 'text', text: JSON.stringify(opsJson) }] };
    },
  };
  return buildMemoryCommand({
    memoryStore: store,
    projectRoot: root,
    cwd: root,
    llmProvider: provider,
    llmModel: 'test-model',
  } as never);
}

describe('/memory SAGE commands', () => {
  it('searches, traverses graph, verifies, runs hygiene, and reports stats', async () => {
    await fs.writeFile(path.join(root, 'source.ts'), 'export const stableSymbol = true;\n');
    const store = newPort({ projectRoot: root });
    const memory = await store.rememberSage({
      text: 'stableSymbol is part of the public contract.',
      kind: 'decision',
      importance: 0.95,
      anchors: [{ type: 'symbol', path: 'source.ts', symbol: 'stableSymbol' }],
    });
    const cmd = command(store);

    expect((await cmd.run('search stableSymbol'))?.message).toContain(memory.id);
    expect((await cmd.run('graph source.ts'))?.message).toContain('about_symbol');
    expect((await cmd.run(`verify ${memory.id}`))?.message).toContain('verified: 1');
    expect((await cmd.run('hygiene'))?.message).toContain('SAGE Hygiene');
    // Memory→symbol, symbol→file, and file→project-root directory.
    const stats = (await cmd.run('stats'))?.message ?? '';
    expect(stats).toContain('Graph edges: 3');
    // End to end on the real backend: a store holding only active memories
    // printed "stale undefined; archived undefined; deleted undefined", because
    // `GROUP BY status` omits empty groups and the partial record was cast to
    // the complete type. The zero counts are what a user reads.
    expect(stats).toContain('Total: 1; active 1; stale 0; archived 0; deleted 0.');
    expect(stats).not.toContain('undefined');
  });

  it('remembers with structured flags, then updates and deletes by id', async () => {
    const store = newPort({ projectRoot: root });
    const cmd = command(store);

    // remember with full structured args
    const remembered = await cmd.run(
      'remember Project uses pnpm v9 --kind convention --tag pnpm,build --importance 0.9',
    );
    expect(remembered?.message).toContain('[convention]');
    expect(remembered?.message).toContain('#pnpm');

    const listed = await store.listSage();
    expect(listed).toHaveLength(1);
    const created = listed[0]!;
    expect(created.kind).toBe('convention');
    expect(created.tags).toEqual(expect.arrayContaining(['pnpm', 'build']));
    expect(created.importance).toBeCloseTo(0.9, 5);

    // update status + text by id
    const updated = await cmd.run(
      `update ${created.id} --status stale --text Project pins pnpm v9`,
    );
    expect(updated?.message).toContain('stale');
    const afterUpdate = await store.getSage(created.id);
    expect(afterUpdate?.status).toBe('stale');
    expect(afterUpdate?.text).toBe('Project pins pnpm v9');

    // delete by id
    const deleted = await cmd.run(`delete ${created.id} no longer relevant`);
    expect(deleted?.message).toContain('Deleted');
    const afterDelete = await store.getSage(created.id);
    expect(afterDelete?.status).toBe('deleted');
  });

  it('rejects an invalid --kind with a helpful message', async () => {
    const store = newPort({ projectRoot: root });
    const cmd = command(store);
    const out = await cmd.run('remember something --kind bogus');
    expect(out?.message).toContain('--kind must be one of');
    expect(await store.listSage()).toHaveLength(0);
  });

  it('compact operates on real super ids (merge + delete), not the broken legacy parse', async () => {
    const store = newPort({ projectRoot: root });
    const a = await store.rememberSage({
      text: 'Project uses pnpm workspaces.',
      kind: 'convention',
    });
    const b = await store.rememberSage({ text: 'pnpm is the package manager.', kind: 'fact' });
    const c = await store.rememberSage({ text: 'Temporary debug note.', kind: 'fact' });

    const cmd = commandWithLlm(store, {
      operations: [
        {
          action: 'merge',
          targets: [a.id, b.id],
          newText: 'Project uses pnpm workspaces as its package manager.',
          reason: 'dupes',
        },
        { action: 'delete', targets: [c.id], reason: 'obsolete' },
      ],
      summary: '3 → 1',
    });

    const out = await cmd.run('compact');
    expect(out?.message).toContain('Memory Compact');

    const active = await store.listSage(['active']);
    // Keeper (a) survives with merged text; b and c are gone.
    expect(active.map((m) => m.id).sort()).toEqual([a.id]);
    const keeper = await store.getSage(a.id);
    expect(keeper?.text).toBe('Project uses pnpm workspaces as its package manager.');
    expect((await store.getSage(b.id))?.status).toBe('deleted');
    expect((await store.getSage(c.id))?.status).toBe('deleted');
  });

  it('lists and resolves candidates', async () => {
    const store = newPort({ projectRoot: root });
    const candidate = await store.createCandidate({ text: 'Candidate invariant.' });
    const cmd = command(store);
    expect((await cmd.run('candidates'))?.message).toContain(candidate.id);
    expect((await cmd.run(`candidates accept ${candidate.id}`))?.message).toContain('Accepted');
    expect((await cmd.run('candidates'))?.message).toContain('No memory candidates');
  });

  it('accepting a review proposal applies its suggested action to the target', async () => {
    const store = newPort({ projectRoot: root });
    const target = await store.rememberSage({ text: 'Retired convention to archive.' });
    const review = await store.createCandidate({
      text: target.text,
      kind: 'memory_review',
      targetMemoryId: target.id,
      suggestedAction: 'archive',
    });
    const cmd = command(store);

    const out = await cmd.run(`candidates accept ${review.id}`);

    expect(out?.message).toContain('archive');
    expect((await store.getSage(target.id))?.status).toBe('archived');
  });

  it('resolves a review proposal with an explicit decision', async () => {
    const store = newPort({ projectRoot: root });
    const target = await store.rememberSage({ text: 'Convention the reviewer keeps.' });
    const review = await store.createCandidate({
      text: target.text,
      kind: 'memory_review',
      targetMemoryId: target.id,
      suggestedAction: 'delete',
    });
    const cmd = command(store);

    expect((await cmd.run(`candidates resolve ${review.id} maybe`))?.message).toContain('Usage');
    expect((await cmd.run(`candidates resolve ${review.id} keep`))?.message).toContain(
      `Resolved ${review.id}: keep`,
    );
    expect((await store.getSage(target.id))?.status).toBe('active');
  });

  describe('/memory audience', () => {
    it('remembers, lists, searches, and clears audience-scoped memories', async () => {
      const store = newPort({ projectRoot: root });
      const cmd = command(store);

      await store.rememberSage({
        text: 'Check for reversible rollback SQL.',
        audience: { roles: ['reviewer'] },
      });
      const refactor = await store.rememberSage({
        text: 'Preserve public API signatures.',
        audience: { roles: ['refactor-planner'], taskTypes: ['refactor'] },
      });
      await store.rememberSage({
        text: 'General project note without scope.',
      });

      // list all scoped
      const listed = await cmd.run('audience list');
      expect(listed?.message).toContain('Check for reversible rollback SQL.');
      expect(listed?.message).toContain('Preserve public API signatures.');
      expect(listed?.message).not.toContain('General project note');

      // list filtered by role
      const reviewerList = await cmd.run('audience list --role reviewer');
      expect(reviewerList?.message).toContain('rollback SQL');
      expect(reviewerList?.message).not.toContain('Preserve public API');

      // search by role name
      const searchRole = await cmd.run('audience search refactor-planner');
      expect(searchRole?.message).toContain(refactor.id);

      // search by text content
      const searchText = await cmd.run('audience search rollback');
      expect(searchText?.message).toContain('Check for reversible rollback SQL.');

      // search with no match
      const searchMiss = await cmd.run('audience search nonexistent');
      expect(searchMiss?.message).toContain('No audience-scoped memories match');

      // clear scope
      const cleared = await cmd.run(`audience clear ${refactor.id}`);
      expect(cleared?.message).toContain('Cleared audience scope');
      const afterClear = await store.getSage(refactor.id);
      expect(afterClear?.audience).toBeUndefined();
    });

    it('remember requires at least one selector', async () => {
      const store = newPort({ projectRoot: root });
      const cmd = command(store);
      const out = await cmd.run('audience remember some text');
      expect(out?.message).toContain('At least one of --role');
    });
  });
});
