import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SpecStore } from '../src/spec-store.js';
import { TaskGraphStore } from '../src/task-graph-store.js';

// The stores' id containment used a bare `rel.startsWith('..')`, which
// misread the LEGAL single-segment id `..hidden` as a traversal and refused
// it. Canonical predicate: rel === '..' || rel.startsWith('..' + sep) ||
// isAbsolute(rel), on top of the stores' own no-separator id rule.
describe('dot-prefixed single-segment ids are valid store ids', () => {
  let baseDir: string;
  let specs: SpecStore;
  let graphs: TaskGraphStore;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-sdd-dotdot-'));
    specs = new SpecStore({ baseDir: path.join(baseDir, 'specs') });
    graphs = new TaskGraphStore({ baseDir: path.join(baseDir, 'graphs') });
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it('SpecStore.load accepts the ..-prefixed id and still rejects traversal', async () => {
    await expect(specs.load('..hidden')).resolves.toBeNull();
    await expect(specs.load('../evil')).rejects.toThrow(/Invalid spec id/);
  });

  it('TaskGraphStore.load accepts the ..-prefixed id; traversal ids never leak on read', async () => {
    await expect(graphs.load('..hidden')).resolves.toBeNull();
    // TaskGraphStore.load swallows containment errors to null on the read
    // path (missing == invalid == unreadable — safe, no outside read); the
    // throwing boundary is save(), whose filePath call is awaited outside
    // its catch.
    await expect(graphs.load('../evil')).resolves.toBeNull();
  });
});
