import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BoundedMap,
  clearLocalBinCache,
  resolveNodeBin,
  runRunnerCommand,
} from '../src/runtime/index.js';

const directories: string[] = [];

afterEach(async () => {
  clearLocalBinCache();
  for (const directory of directories.splice(0)) {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

describe('runtime helper contracts', () => {
  it('keeps the hard bound when undefined is a valid map key', () => {
    const map = new BoundedMap<string | undefined, number>({ max: 1 });

    map.set(undefined, 1);
    map.set('newest', 2);

    expect(map.size).toBe(1);
    expect(map.has(undefined)).toBe(false);
    expect(map.get('newest')).toBe(2);
    expect(map.evictionCount).toBe(1);
  });

  it('resolves a relative runner cwd against the declared project root', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-sdk-runner-'));
    directories.push(root);
    const relativeCwd = 'nested-workspace';
    const expectedCwd = path.join(root, relativeCwd);
    await fs.mkdir(expectedCwd);

    const result = await runRunnerCommand(
      [process.execPath, '-e', 'process.stdout.write(process.cwd())'],
      { cwd: relativeCwd, projectRoot: root, timeoutMs: 5_000 },
    );

    expect(result).toMatchObject({ code: 0, timedOut: false, spawnError: false });
    expect(path.resolve(result.stdout)).toBe(path.resolve(expectedCwd));
  });

  it('rejects package bin entries that do not resolve to a file inside the package', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-sdk-bin-'));
    directories.push(root);
    const packageRoot = path.join(root, 'node_modules', 'sdk-bin-fixture');
    await fs.mkdir(packageRoot, { recursive: true });
    await fs.writeFile(path.join(root, 'package.json'), '{}');
    await fs.writeFile(
      path.join(packageRoot, 'package.json'),
      JSON.stringify({ name: 'sdk-bin-fixture', bin: { fixture: 'missing.js' } }),
    );

    expect(resolveNodeBin('sdk-bin-fixture', 'fixture', root)).toBeNull();

    const outside = path.join(root, 'outside-bin');
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, 'runner.js'), 'process.stdout.write("escaped")');
    const linkedBin = path.join(packageRoot, 'linked-bin');
    try {
      await fs.symlink(outside, linkedBin, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      return;
    }
    await fs.writeFile(
      path.join(packageRoot, 'package.json'),
      JSON.stringify({ name: 'sdk-bin-fixture', bin: { fixture: 'linked-bin/runner.js' } }),
    );
    clearLocalBinCache();

    expect(resolveNodeBin('sdk-bin-fixture', 'fixture', root)).toBeNull();
  });
});
