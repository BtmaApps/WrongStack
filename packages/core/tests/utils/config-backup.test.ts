import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupConfigFile, configHistoryDir, configSlug } from '../../src/utils/config-backup.js';

describe('config-backup', () => {
  let tmpDir: string;
  let globalRoot: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-backup-test-'));
    globalRoot = path.join(tmpDir, '.wrongstack');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('configSlug', () => {
    it('derives slug for top-level config.json', () => {
      const p = path.join(globalRoot, 'config.json');
      expect(configSlug(p, globalRoot)).toBe('config');
    });

    it('derives slug for profile config.json', () => {
      const p = path.join(globalRoot, 'profiles', 'work', 'config.json');
      expect(configSlug(p, globalRoot)).toBe('profiles-work-config');
    });

    it('sanitizes Windows drive letters and colons across drives', () => {
      const slug = configSlug(
        'D:\\Codebox\\PROJECTS\\.wrongstack\\config.json',
        'C:\\Users\\admin\\.wrongstack',
      );
      expect(slug).not.toContain(':');
      expect(slug).not.toContain('\\');
      expect(slug).not.toContain('/');
    });
  });

  describe('backupConfigFile', () => {
    it('creates a backup of an existing config file', async () => {
      const configFile = path.join(globalRoot, 'config.json');
      await fs.mkdir(globalRoot, { recursive: true });
      await fs.writeFile(configFile, JSON.stringify({ model: 'claude-3-5-sonnet' }));

      await backupConfigFile(configFile, { globalRoot });

      const historyDir = configHistoryDir(globalRoot);
      const files = await fs.readdir(historyDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^config-\d{4}-\d{2}-\d{2}T.*\.json$/);

      const content = await fs.readFile(path.join(historyDir, files[0]!), 'utf8');
      expect(JSON.parse(content)).toEqual({ model: 'claude-3-5-sonnet' });
    });

    it('silently ignores missing or empty files', async () => {
      const nonExistent = path.join(globalRoot, 'does-not-exist.json');
      await backupConfigFile(nonExistent, { globalRoot });

      const historyDir = configHistoryDir(globalRoot);
      await expect(fs.readdir(historyDir)).rejects.toThrow();
    });
  });

  describe('backupConfigFile with an invalid globalRoot', () => {
    it('skips the backup instead of writing a CWD-relative config-history dir', async () => {
      const configFile = path.join(tmpDir, 'orphan-config.json');
      await fs.writeFile(configFile, JSON.stringify({ models: { doomed: {} } }, null, 2));

      // Regression: configHistoryDir('' | undefined) used to return the
      // CWD-relative './config-history', littering the working directory —
      // leaked snapshots were even committed into the repo. Whatever the
      // runner's cwd is, it must stay untouched: a best-effort backup that
      // cannot be placed under a valid global root is skipped.
      const cwdHistoryDir = path.resolve(process.cwd(), 'config-history');
      const before = (await fs.readdir(cwdHistoryDir).catch(() => null))?.length ?? -1;

      const missingRoot = {} as Parameters<typeof backupConfigFile>[1];
      await backupConfigFile(configFile, { globalRoot: undefined as unknown as string });
      await backupConfigFile(configFile, missingRoot);
      await backupConfigFile(configFile, { globalRoot: '' });

      if (before === -1) {
        await expect(fs.readdir(cwdHistoryDir)).rejects.toThrow();
      } else {
        expect((await fs.readdir(cwdHistoryDir)).length).toBe(before);
      }
    });

    it('still writes the backup when globalRoot is a valid absolute path', async () => {
      const configFile = path.join(tmpDir, 'orphan-config.json');
      await fs.writeFile(configFile, JSON.stringify({ cloudSync: { url: 'https://portal.test' } }));

      await backupConfigFile(configFile, { globalRoot: tmpDir });

      const files = await fs.readdir(path.join(tmpDir, 'config-history'));
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^orphan-config-.*\.json$/);
    });
  });
});
