import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { enrichConcepts, type SummarizerPort } from '../src/codebase-index/concept-enrichment.js';
import { discoverEntryPoints } from '../src/codebase-index/dead-code-scan.js';
import {
  buildWiringGraph,
  CONTRADICTED_VISIBILITY_WEIGHT,
} from '../src/codebase-index/graph-rank.js';
import { createImplicitVisibility } from '../src/codebase-index/graph-rank-pass.js';
import { IndexStore } from '../src/codebase-index/writer.js';

describe('rank visibility', () => {
  const edge = [{ fromId: 1, toId: 2, callType: 'call' }];
  const weightFor = (source: string, target: string, imports: string[]) =>
    buildWiringGraph(edge, {
      fileOf: new Map([
        [1, source],
        [2, target],
      ]),
      importsOf: new Map([[source, new Set(imports)]]),
      implicitlyVisible: createImplicitVisibility(),
    }).weights[0];

  it('gives same-package Go and Java references full weight', () => {
    expect(weightFor('/r/pkg/a.go', '/r/pkg/b.go', ['/r/other/x.go'])).toBe(1);
    expect(weightFor('/r/com/ex/A.java', '/r/com/ex/B.java', ['/r/com/lib/C.java'])).toBe(1);
  });

  it('treats any file of an imported Go package as visible', () => {
    expect(weightFor('/r/cmd/main.go', '/r/lib/strings.go', ['/r/lib/util.go'])).toBe(1);
  });

  it('still contradicts a TypeScript sibling that is not imported', () => {
    expect(weightFor('/r/src/a.ts', '/r/src/b.ts', ['/r/src/c.ts'])).toBe(
      CONTRADICTED_VISIBILITY_WEIGHT,
    );
  });
});

async function tempProject(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-edges-'));
  for (const [rel, text] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), text);
  }
  return root;
}

describe('dead-code entry-point discovery', () => {
  it('reads string and deeply nested exports', async () => {
    const root = await tempProject({
      'package.json': JSON.stringify({
        name: 'x',
        workspaces: { packages: ['packages/*'] },
      }),
      'packages/sugar/package.json': JSON.stringify({ name: 's', exports: './src/lib.ts' }),
      'packages/sugar/src/lib.ts': '',
      'packages/nested/package.json': JSON.stringify({
        name: 'n',
        exports: { '.': { import: { types: './types.ts', default: './main.ts' } } },
      }),
      'packages/nested/types.ts': '',
      'packages/nested/main.ts': '',
    });
    try {
      const entries = discoverEntryPoints(root, undefined).map((f) =>
        path.relative(root, f).split(path.sep).join('/'),
      );
      expect(entries).toEqual(
        expect.arrayContaining([
          'packages/sugar/src/lib.ts',
          'packages/nested/types.ts',
          'packages/nested/main.ts',
        ]),
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe('concept enrichment', () => {
  it('builds subsystems from every summary, passes the language, honours maxFiles 0', async () => {
    const root = await tempProject({
      'a.ts': 'export const a = 1;\n',
      'b.ts': 'export const b = 2;\n',
    });
    const indexDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-edges-idx-'));
    const store = new IndexStore(root, { indexDir });
    try {
      const files = ['a.ts', 'b.ts'].map((f) => path.join(root, f));
      for (const file of files) {
        store.upsertFile({
          file,
          lang: 'ts',
          mtimeMs: 1,
          symbolCount: 0,
          lastIndexed: 1,
          contentHash: `h-${path.basename(file)}`,
        });
      }
      store.setFilePackages(new Map(files.map((f) => [f, 'core'])));

      const languages: string[] = [];
      const port: SummarizerPort = {
        describeFile: async (input) => {
          languages.push(input.language);
          return { summary: `about ${input.file}` };
        },
        describeSubsystem: async (input) => ({ summary: `${input.name} (${input.files.length})` }),
      };
      const relativeOf = (f: string) => path.basename(f);

      const none = await enrichConcepts(store, port, relativeOf, { maxFiles: 0 });
      expect(none.summarised).toBe(0);

      // No rank pass ran, so file_rank is empty — subsystems must not depend on it.
      const result = await enrichConcepts(store, port, relativeOf, { subsystems: true });
      expect(result.summarised).toBe(2);
      expect(languages).toEqual(['ts', 'ts']);
      expect(result.subsystems).toBe(1);
      expect(store.getSubsystems()[0]?.memberFiles.sort()).toEqual(['a.ts', 'b.ts']);

      const nan = await enrichConcepts(store, port, relativeOf, {
        force: true,
        concurrency: Number.NaN,
      });
      expect(nan.summarised).toBe(2);
    } finally {
      store.close();
      await fs.rm(root, { recursive: true, force: true });
      await fs.rm(indexDir, { recursive: true, force: true });
    }
  });
});
