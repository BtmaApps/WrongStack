/**
 * The doctor's hub check and the graph traversal's hub damping must describe
 * the SAME set of nodes.
 *
 * Both shipped in the same commit, and the commit says it plainly: "nodes
 * above GRAPH_HUB_DEGREE (64) are REPORTED but not expanded". The report and
 * the expansion are therefore meant to describe the same set - and they did
 * not:
 *
 *   - the doctor counted a node's degree over the SOFT relations only
 *     (`same_topic`, `related_to`);
 *   - the traversal bucketed a frontier node by ALL of its incident rows.
 *
 * So a node whose degree comes from STRUCTURAL edges (`about_file`,
 * `about_symbol`, ...) was damped by the traversal - every edge of it was
 * dropped and the memories behind it silently vanished - while the doctor
 * reported "Graph hub nodes: none".
 *
 * See: packages/sage/src/sqlite-store-graph-traverse.ts
 *       packages/sage/src/sqlite-store-doctor.ts
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteSageStore } from '../src/sqlite-store.js';
import { GRAPH_HUB_DEGREE } from '../src/sqlite-store-graph-traverse.js';

let directory: string;
let store: SqliteSageStore;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-sage-hub-doctor-'));
  store = new SqliteSageStore({ projectRoot: directory });
  await store.initialize();
});

afterEach(async () => {
  store.close();
  await fs.rm(directory, { recursive: true, force: true });
});

function addEdge(from: string, to: string, relation: string, weight = 1): void {
  (store as unknown as { db: DatabaseSync }).db
    .prepare(
      'INSERT INTO edges (from_node, to_node, relation, weight, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(from, to, relation, weight, '2026-07-19T00:00:00.000Z');
}

/** A path that REACHES the hub (it is not a start). */
function reachHub(): void {
  addEdge('mem:seed', 'mem:bridge', 'related_to');
  addEdge('mem:bridge', 'file:hub', 'related_to');
}

/**
 * Did the traversal DROP the hub's edges? The edges have to still be in the
 * store for the answer to mean anything - a node that is simply not
 * connected any more was not "damped", it was removed.
 */
async function damped(prefix: string): Promise<boolean> {
  const db = (
    store as unknown as {
      db: { prepare: (sql: string) => { get: (...args: unknown[]) => { n: number } } };
    }
  ).db;
  const stored = db
    .prepare('SELECT COUNT(*) AS n FROM edges WHERE from_node LIKE ? OR to_node LIKE ?')
    .get(`${prefix}%`, `${prefix}%`);
  if (stored.n === 0) return false;
  const edges = await store.traverseGraph(['mem:seed'], { maxDepth: 3, limit: 1000 });
  const nodes = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  return ![...nodes].some((node) => node.startsWith(prefix));
}

/** How many hubs does the doctor report? */
async function reportedHubs(): Promise<number> {
  const report = await store.doctor();
  return report.checks.find((check) => check.id === 'graph-hubs')?.count ?? 0;
}

describe('graph hub check vs. graph hub damping', () => {
  it('agrees on a structural hub', async () => {
    // 65 memories anchored to the same file node: structural evidence, not
    // graph noise.
    for (let i = 0; i < 65; i += 1) addEdge(`mem:about${i}`, 'file:hub', 'about_file');
    reachHub();

    const wasDamped = await damped('mem:about');
    const hubs = await reportedHubs();

    expect(wasDamped).toBe(hubs > 0);
  });

  it('keeps a structural hub’s evidence reachable', async () => {
    for (let i = 0; i < 65; i += 1) addEdge(`mem:about${i}`, 'file:hub', 'about_file');
    reachHub();

    const edges = await store.traverseGraph(['mem:seed'], { maxDepth: 3, limit: 1000 });
    const nodes = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
    expect([...nodes].some((node) => node.startsWith('mem:about'))).toBe(true);
  });

  it('still damps a soft hub - the flooding protection is intact', async () => {
    for (let i = 0; i < 200; i += 1) addEdge(`mem:noise${i}`, 'file:hub', 'same_topic');
    reachHub();

    expect(await reportedHubs()).toBe(1);
    expect(await damped('mem:noise')).toBe(true);
  });

  it('treats the degree limit exactly: at the limit is not a hub, one past it is', async () => {
    // `reachHub` adds one more soft edge (mem:bridge -> file:hub), so the
    // hub carries GRAPH_HUB_DEGREE soft edges in total here.
    for (let i = 0; i < GRAPH_HUB_DEGREE - 1; i += 1) {
      addEdge(`mem:soft${i}`, 'file:hub', 'same_topic');
    }
    reachHub();

    expect(await reportedHubs()).toBe(0);
    expect(await damped('mem:soft')).toBe(false);

    addEdge(`mem:soft${GRAPH_HUB_DEGREE}`, 'file:hub', 'same_topic');
    expect(await reportedHubs()).toBe(1);
    expect(await damped('mem:soft')).toBe(true);
  });
});
