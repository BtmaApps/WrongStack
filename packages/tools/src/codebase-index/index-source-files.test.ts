import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from 'vitest';
import { loadGitignoreMatcher } from './gitignore.js';
import { findSourceFiles } from './index-source-files.js';

test('Git discovery excludes tracked ignored source while keeping normal source', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-index-gitignore-'));
  try {
    execFileSync('git', ['init', '-q', root]);
    await fs.mkdir(path.join(root, 'generated'));
    await fs.writeFile(path.join(root, '.gitignore'), 'generated/\n');
    await fs.writeFile(path.join(root, 'generated', 'hidden.ts'), 'export const hidden = 1;\n');
    await fs.writeFile(path.join(root, 'visible.ts'), 'export const visible = 1;\n');
    execFileSync('git', ['-C', root, 'add', '.gitignore', 'visible.ts']);
    execFileSync('git', ['-C', root, 'add', '-f', 'generated/hidden.ts']);

    const result = await findSourceFiles(root, [], await loadGitignoreMatcher(root));
    expect(result.complete).toBe(true);
    expect(result.snapshotKey).toBeDefined();
    expect(
      result.files.map((file) => path.relative(root, file).replace(/\\/g, '/')).sort(),
    ).toEqual(['visible.ts']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
