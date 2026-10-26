import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteSageStore } from '../src/sqlite-store.js';

let root: string;
let store: SqliteSageStore;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'sage-find-file-limit-'));
  store = new SqliteSageStore({ projectRoot: root });
});

afterEach(async () => {
  store.close();
  await fs.rm(root, { recursive: true, force: true });
});

describe('findMemoriesForFile result limit', () => {
  it('applies one global cap across primary, symbol, and related buckets', async () => {
    await store.rememberSage({
      text: 'Primary file ownership fact',
      kind: 'file_note',
      scope: 'file',
      anchors: [{ type: 'file', path: 'src/target.ts' }],
    });
    await store.rememberSage({
      text: 'Symbol-specific implementation fact',
      kind: 'symbol_note',
      scope: 'symbol',
      anchors: [{ type: 'symbol', path: 'src/target.ts', symbol: 'runTarget' }],
    });
    await store.rememberSage({
      text: 'The target.ts module appears in this unrelated operational note.',
      kind: 'fact',
    });

    const result = await store.findMemoriesForFile('src/target.ts', { limit: 1 });
    expect(result.totalCount).toBe(1);
    expect(
      result.primaryMatches.length + result.symbolMatches.length + result.relatedMatches.length,
    ).toBe(1);
    expect(result.primaryMatches).toHaveLength(1);
  });
});

describe('findMemoriesForFile match strength', () => {
  it('prefers an exact file anchor over an earlier enclosing directory anchor', async () => {
    const memory = await store.rememberSage({
      text: 'Ownership rules for the target module and its folder',
      kind: 'file_note',
      anchors: [
        { type: 'directory', path: 'src' },
        { type: 'file', path: 'src/target.ts' },
      ],
    });
    const result = await store.findMemoriesForFile('src/target.ts');
    const match = result.primaryMatches.find((m) => m.memory.id === memory.id);
    expect(match?.matchedVia).toBe('anchor_file');
    expect(match?.matchStrength).toBe(0.9);
  });

  it('control: anchor order file-then-directory already resolves to the file', async () => {
    const memory = await store.rememberSage({
      text: 'Ownership rules for the target module and its folder too',
      kind: 'file_note',
      anchors: [
        { type: 'file', path: 'src/target.ts' },
        { type: 'directory', path: 'src' },
      ],
    });
    const result = await store.findMemoriesForFile('src/target.ts');
    const match = result.primaryMatches.find((m) => m.memory.id === memory.id);
    expect(match?.matchedVia).toBe('anchor_file');
  });
});
