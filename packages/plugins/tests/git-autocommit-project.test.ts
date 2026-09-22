import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PluginAPI, Tool } from '@wrongstack/core/types';
import { expect, it } from 'vitest';
import plugin from '../src/git-autocommit/index.js';

it('commits the calling repository while preserving another staged file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'autocommit-project-'));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  let tool!: Tool;
  const api = {
    config: { extensions: {} },
    tools: {
      register: (value: Tool) => {
        tool = value;
      },
    },
    log: { info() {}, warn() {}, error() {} },
  } as unknown as PluginAPI;
  try {
    git('init', '-q');
    git('config', 'user.email', 'plugin-fixture@example.test');
    git('config', 'user.name', 'Plugin Fixture');
    git('config', 'commit.gpgsign', 'false');
    git('config', 'core.autocrlf', 'false');
    await mkdir(join(root, '.git', 'fixture-hooks'));
    git('config', 'core.hooksPath', join(root, '.git', 'fixture-hooks'));
    await writeFile(join(root, 'owned.ts'), 'original owned\n');
    await writeFile(join(root, 'foreign.ts'), 'original foreign\n');
    git('add', '--', 'owned.ts', 'foreign.ts');
    git('commit', '-qm', 'fixture baseline');
    await writeFile(join(root, 'owned.ts'), 'changed owned\n');
    await writeFile(join(root, 'foreign.ts'), 'changed foreign\n');
    git('add', '--', 'foreign.ts');
    await plugin.setup(api);
    expect(
      await tool.execute(
        { files: ['owned.ts'], type: 'fix', message: 'owned fixture' },
        { projectRoot: root } as never,
        { signal: new AbortController().signal },
      ),
    ).toMatchObject({ ok: true });
    expect(git('diff', 'HEAD~', 'HEAD', '--name-only')).toBe('owned.ts');
    expect(git('diff', '--cached', '--name-only')).toBe('foreign.ts');
    expect(git('show', 'HEAD:foreign.ts')).toBe('original foreign');
    expect(git('show', 'HEAD:owned.ts')).toBe('changed owned');
  } finally {
    await plugin.teardown?.(api);
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
}, 20000);
