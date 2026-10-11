import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { globTool } from '../src/glob.js';
import { mkSandbox, type Sandbox } from './fixtures.js';

let sandbox: Sandbox;
beforeEach(async () => {
  sandbox = await mkSandbox();
  await fs.mkdir(path.join(sandbox.dir, 'z-target'));
  await fs.writeFile(path.join(sandbox.dir, 'control.txt'), 'control');
  await fs.writeFile(path.join(sandbox.dir, 'z-target', 'needle.txt'), 'target');
  await fs.symlink(
    path.join(sandbox.dir, 'z-target'),
    path.join(sandbox.dir, 'a-alias'),
    'junction',
  );
});
afterEach(async () => {
  await sandbox.cleanup();
});

async function names(pattern: string) {
  const result = await globTool.execute({ pattern }, sandbox.ctx, {
    signal: new AbortController().signal,
  });
  expect(result.truncated).toBe(false);
  return result.files.map((name) => name.replaceAll('\\', '/')).sort();
}

describe('glob matches distinct logical paths to the same directory', () => {
  it('keeps both the real and alias paths instead of depending on walk order', async () => {
    expect(await names('**/*.txt')).toEqual([
      'a-alias/needle.txt',
      'control.txt',
      'z-target/needle.txt',
    ]);
  });

  it.each(['a-alias', 'z-target'])('matches an explicitly named %s path', async (directory) => {
    expect(await names(`${directory}/*.txt`)).toEqual([`${directory}/needle.txt`]);
  });

  it('does not lose an ordinary neighboring match', async () => {
    expect(await names('control.txt')).toEqual(['control.txt']);
  });

  it('prunes ancestor cycles without discarding sibling aliases', async () => {
    await fs.symlink(sandbox.dir, path.join(sandbox.dir, 'return-root'), 'junction');
    await fs.symlink(
      path.join(sandbox.dir, 'z-target'),
      path.join(sandbox.dir, 'z-target', 'self'),
      'junction',
    );
    expect(await names('**/*.txt')).toEqual([
      'a-alias/needle.txt',
      'control.txt',
      'z-target/needle.txt',
    ]);
  });
});
