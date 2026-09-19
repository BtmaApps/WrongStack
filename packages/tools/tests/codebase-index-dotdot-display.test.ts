import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runIndexer, writeAtlas } from '../src/codebase-index/index.js';
import { IndexStore, indexStorePool } from '../src/codebase-index/writer.js';

/**
 * Display paths for in-root files whose FIRST segment starts with `..` (a
 * legal directory name, e.g. `..configs`) must stay relative: the bare
 * startsWith('..') fallback misread them as parent traversals and rendered
 * the absolute path. Real escapes (../outside, the bare `..`) keep falling
 * back — covered by the canonical-predicate unit shape in plug-lsp
 * runtime.test.ts and by the strictly preserved fallback conditions here.
 */

let tmpDir: string;
let indexDir: string;
let store: IndexStore | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-dotdot-display-'));
  indexDir = path.join(tmpDir, '.idx');
});

afterEach(async () => {
  store?.close();
  indexStorePool.evict(tmpDir, indexDir);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function write(rel: string, body: string): Promise<void> {
  const full = path.join(tmpDir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body, 'utf8');
}

describe('codebase-index display paths vs in-root ..-prefixed names', () => {
  it('renders an in-root ..-prefixed file as relative in the written atlas', async () => {
    await write(
      'src/kernel.ts',
      'export function buildWidget(id: string): string {\n  return id;\n}\n',
    );
    // An import edge gives the reference graph a rank for both files: the
    // atlas document projects RANKED files only, and an edgeless fixture has
    // none.
    await write(
      '..configs/set.ts',
      "import { buildWidget } from '../src/kernel.js';\nexport function render(id: string): string {\n  return buildWidget(id);\n}\n",
    );
    await runIndexer(undefined as never, { projectRoot: tmpDir, indexDir });
    store = new IndexStore(tmpDir, { indexDir });

    const written = await writeAtlas(store, tmpDir);
    // written.dir is the RELATIVE display location (.wrongstack/atlas);
    // resolve it against the fixture root to read what was actually written.
    // The markdown renders only the ranked head; atlas.json lists every
    // indexed file with its display path.
    const jsonName = written.files.find(
      (name) => name.endsWith('.json') && !name.includes('manifest'),
    );
    expect(jsonName).toBeDefined();
    const atlas = JSON.parse(
      await fs.readFile(path.resolve(tmpDir, written.dir, jsonName ?? ''), 'utf8'),
    ) as { files: Array<{ path: string }> };
    const paths = atlas.files.map((entry) => entry.path);

    // Control: a normal in-root file renders relative.
    expect(paths).toContain('src/kernel.ts');
    // The delta: the ..-prefixed in-root file renders as a relative path,
    // not as the absolute fallback.
    expect(paths).toContain('..configs/set.ts');
    // Both fixture files are in-root, so every display path must be relative.
    expect(paths.every((entry) => !path.isAbsolute(entry))).toBe(true);
  });
});
