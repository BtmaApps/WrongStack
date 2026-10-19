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
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-sage-hub-'));
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

describe('graph traversal hub damping', () => {
  it('reports a reached hub but never walks through its neighbourhood', async () => {
    addEdge('mem:seed', 'mem:hub', 'same_topic');
    addEdge('mem:seed', 'mem:near', 'related_to');
    addEdge('mem:near', 'mem:far', 'related_to');
    for (let i = 0; i < 200; i++) addEdge(`mem:noise${i}`, 'mem:hub', 'same_topic');

    const edges = await store.traverseGraph(['mem:seed'], { maxDepth: 2, limit: 1000 });
    const nodes = new Set(edges.flatMap((edge) => [edge.from, edge.to]));

    expect(nodes.has('mem:hub')).toBe(true);
    expect(nodes.has('mem:far')).toBe(true);
    expect([...nodes].some((node) => node.startsWith('mem:noise'))).toBe(false);
  });

  it('keeps only the strongest edges of a hub that is itself a start', async () => {
    for (let i = 0; i < 150; i++) addEdge('mem:hubstart', `mem:leaf${i}`, 'related_to', i / 150);

    const edges = await store.traverseGraph(['mem:hubstart'], { maxDepth: 1, limit: 1000 });

    expect(edges).toHaveLength(GRAPH_HUB_DEGREE);
    expect(Math.min(...edges.map((edge) => edge.weight))).toBeGreaterThanOrEqual(
      (150 - GRAPH_HUB_DEGREE) / 150,
    );
  });
});
