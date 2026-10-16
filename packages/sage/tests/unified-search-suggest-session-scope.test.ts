import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteSageStore } from '../src/sqlite-store.js';

/**
 * Regression: `excludeSessionScoped` (the WebUI discovery policy) must hide
 * session-scoped memories from `suggestions` too, not only from `hits` and
 * `totalCandidates`.
 *
 * The suggestion query re-runs the primary filters with an OR-expanded FTS
 * expression, but it never applied the `scope != 'session'` exclusion — so a
 * memory the policy had just removed from the result rows re-entered through
 * the suggestion channel.
 */

const SESSION_A = 'suggest-session-scope-a';

let tempDir: string;
let stores: SqliteSageStore[] = [];

beforeEach(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'wrongstack-suggest-session-'));
  stores = [];
});

afterEach(async () => {
  for (const store of stores.splice(0)) {
    try {
      store.close();
    } catch {
      /* already closed */
    }
  }
  await new Promise((r) => setTimeout(r, 10));
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

function trackStore(store: SqliteSageStore): SqliteSageStore {
  stores.push(store);
  return store;
}

/** Retrofit a legacy unowned session row (rememberSage refuses scope 'session' without an owner). */
function rawStmt(
  store: SqliteSageStore,
): (sql: string) => { run: (...args: unknown[]) => unknown } {
  return (sql) =>
    (store as unknown as { stmt: (s: string) => { run: (...a: unknown[]) => unknown } }).stmt(sql);
}

describe('unifiedSearch suggestions honor excludeSessionScoped', () => {
  it('drops owned and legacy unowned session rows from suggestions', async () => {
    const store = trackStore(new SqliteSageStore({ projectRoot: tempDir }));
    await store.initialize();

    const project = await store.rememberSage({
      text: 'alpha beta project note',
      kind: 'fact',
      scope: 'project',
      importance: 0.9,
      confidence: 0.9,
    });
    // Shares a single term with the query → a legitimate suggestion neighbor.
    const neighbor = await store.rememberSage({
      text: 'lone beta project neighbor',
      kind: 'fact',
      scope: 'project',
      importance: 0.5,
      confidence: 0.7,
    });
    const owned = await store.rememberSage({
      text: 'alpha beta session owned',
      kind: 'fact',
      scope: 'session',
      ownerSessionId: SESSION_A,
      importance: 0.8,
      confidence: 0.8,
    });
    const legacy = await store.rememberSage({
      text: 'alpha beta session legacy',
      kind: 'fact',
      scope: 'project',
      importance: 0.4,
      confidence: 0.6,
    });
    rawStmt(store)(
      "UPDATE memories SET scope = 'session', owner_session_id = NULL, data = json_set(json_remove(data, '$.ownerSessionId'), '$.scope', 'session') WHERE id = ?",
    ).run(legacy.id);

    const result = await store.unifiedSearchService(
      { text: 'alpha beta' },
      {
        suggest: 'always',
        excludeSessionScoped: true,
        sessionId: SESSION_A,
        includeAllSessions: true,
      },
    );

    // The policy holds on the primary rows…
    expect(result.hits.map((hit) => hit.id)).toContain(project.id);
    expect(result.hits.map((hit) => hit.id)).not.toContain(owned.id);
    expect(result.hits.map((hit) => hit.id)).not.toContain(legacy.id);
    // …and on the suggestions: the session rows must not re-enter.
    expect(result.suggestions.map((hit) => hit.id)).toContain(neighbor.id);
    expect(result.suggestions.map((hit) => hit.id)).not.toContain(owned.id);
    expect(result.suggestions.map((hit) => hit.id)).not.toContain(legacy.id);
  });

  it("applies the policy to the 'empty' suggestion mode as well", async () => {
    const store = trackStore(new SqliteSageStore({ projectRoot: tempDir }));
    await store.initialize();

    const owned = await store.rememberSage({
      text: 'alpha beta session secret',
      kind: 'fact',
      scope: 'session',
      ownerSessionId: SESSION_A,
      importance: 0.8,
      confidence: 0.8,
    });
    await store.rememberSage({
      text: 'alpha project note',
      kind: 'fact',
      scope: 'project',
      importance: 0.5,
      confidence: 0.7,
    });

    const result = await store.unifiedSearchService(
      { text: 'nomatch alpha' },
      { suggest: 'empty', excludeSessionScoped: true, sessionId: SESSION_A },
    );
    expect(result.hits).toEqual([]);
    expect(result.suggestions.map((hit) => hit.id)).not.toContain(owned.id);
  });

  it('CONTROL: without the policy the owning session still sees its own row', async () => {
    const store = trackStore(new SqliteSageStore({ projectRoot: tempDir }));
    await store.initialize();

    const owned = await store.rememberSage({
      text: 'alpha beta session visible',
      kind: 'fact',
      scope: 'session',
      ownerSessionId: SESSION_A,
      importance: 0.8,
      confidence: 0.8,
    });

    const result = await store.unifiedSearchService(
      { text: 'alpha beta' },
      { suggest: 'always', sessionId: SESSION_A },
    );
    expect(result.hits.map((hit) => hit.id)).toContain(owned.id);
  });

  it('CONTROL: an unrelated project neighbor still surfaces (suggestions not starved)', async () => {
    const store = trackStore(new SqliteSageStore({ projectRoot: tempDir }));
    await store.initialize();

    await store.rememberSage({
      text: 'alpha beta project hit',
      kind: 'fact',
      scope: 'project',
      importance: 0.9,
      confidence: 0.9,
    });
    const neighbor = await store.rememberSage({
      text: 'lone beta project neighbor',
      kind: 'fact',
      scope: 'project',
      importance: 0.5,
      confidence: 0.7,
    });

    const result = await store.unifiedSearchService(
      { text: 'alpha beta' },
      { suggest: 'always', excludeSessionScoped: true },
    );
    expect(result.suggestions.map((hit) => hit.id)).toEqual([neighbor.id]);
  });
});
