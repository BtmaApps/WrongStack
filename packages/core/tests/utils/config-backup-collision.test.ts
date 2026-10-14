import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { backupConfigFile, configHistoryDir } from '../../src/utils/config-backup.js';

let root: string | undefined;
afterEach(async () => {
  vi.useRealTimers();
  if (root) await fs.rm(root, { recursive: true, force: true });
});
it('retains repeated same-clock snapshots, compatible names and no-op empty/missing inputs', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'config-backup-collision-'));
  const file = path.join(root, 'profiles/default/config.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  for (let version = 0; version < 8; version++) {
    await fs.writeFile(file, JSON.stringify({ version }));
    await backupConfigFile(file, { globalRoot: root });
  }
  const directory = configHistoryDir(root);
  const files = (await fs.readdir(directory)).sort();
  expect(files).toHaveLength(8);
  for (const name of files)
    expect(name).toMatch(
      /^profiles-default-config-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}\.json$/,
    );
  const values = await Promise.all(
    files.map(
      async (name) => JSON.parse(await fs.readFile(path.join(directory, name), 'utf8')).version,
    ),
  );
  expect(values).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  await fs.writeFile(file, ' \n');
  await backupConfigFile(file, { globalRoot: root });
  await backupConfigFile(path.join(root, 'missing.json'), { globalRoot: root });
  expect(await fs.readdir(directory)).toHaveLength(8);
  expect(await fs.readFile(file, 'utf8')).toBe(' \n');
});
