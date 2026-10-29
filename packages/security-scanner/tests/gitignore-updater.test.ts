import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultGitignoreUpdater, GitignoreUpdater } from '../src/gitignore-updater.js';
import type { GeneratedSkill, SecurityPattern } from '../src/types.js';

let tmp: string;
let gitignorePath: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gitignore-upd-'));
  gitignorePath = path.join(tmp, '.gitignore');
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('GitignoreUpdater', () => {
  it('exports a default singleton', () => {
    expect(defaultGitignoreUpdater).toBeInstanceOf(GitignoreUpdater);
  });

  it('creates a new .gitignore when one does not exist and lists every entry as added', async () => {
    const u = new GitignoreUpdater({
      gitignorePath,
      entries: ['security-reports/', 'security-reports/*'],
    });
    const result = await u.update();
    expect(result.added).toEqual(['security-reports/', 'security-reports/*']);
    expect(result.existing).toEqual([]);
    expect(result.errors).toEqual([]);
    const content = await fs.readFile(gitignorePath, 'utf8');
    expect(content).toContain('security-reports/');
    expect(content).toContain('security-reports/*');
  });

  it('appends missing entries to an existing .gitignore without duplicating', async () => {
    await fs.writeFile(gitignorePath, 'node_modules\n.env\n');
    const u = new GitignoreUpdater({
      gitignorePath,
      entries: ['node_modules', 'security-reports/'],
    });
    const result = await u.update();
    expect(result.added).toEqual(['security-reports/']);
    expect(result.existing).toEqual(['node_modules']);
    const content = await fs.readFile(gitignorePath, 'utf8');
    // Should appear exactly once
    expect(content.match(/node_modules/g)?.length).toBe(1);
    expect(content).toContain('security-reports/');
  });

  it('keeps CRLF line endings and separates from a last line without a newline', async () => {
    await fs.writeFile(gitignorePath, 'node_modules\r\n.env');
    const result = await new GitignoreUpdater({ gitignorePath, entries: ['out/'] }).update();
    expect(result.added).toEqual(['out/']);
    expect(await fs.readFile(gitignorePath, 'utf8')).toBe('node_modules\r\n.env\r\nout/\r\n');
  });

  it('separates an LF file whose last line has no newline', async () => {
    await fs.writeFile(gitignorePath, 'node_modules');
    await new GitignoreUpdater({ gitignorePath, entries: ['out/'] }).update();
    expect(await fs.readFile(gitignorePath, 'utf8')).toBe('node_modules\nout/\n');
  });

  it('does not rewrite the file when every entry is already present', async () => {
    await fs.writeFile(gitignorePath, 'foo\nbar\n');
    const u = new GitignoreUpdater({
      gitignorePath,
      entries: ['foo', 'bar'],
    });
    // Capture mtime before
    const before = (await fs.stat(gitignorePath)).mtimeMs;
    // Wait one tick so a write would change mtime
    await new Promise((r) => setTimeout(r, 10));
    const result = await u.update();
    expect(result.added).toEqual([]);
    expect(result.existing).toEqual(['foo', 'bar']);
    // File untouched
    const after = (await fs.stat(gitignorePath)).mtimeMs;
    expect(after).toBe(before);
  });

  it('records an error when reading .gitignore fails for non-ENOENT reasons', async () => {
    // Point to a directory path (not a file) — readFile fails with EISDIR / EACCES
    const u = new GitignoreUpdater({ gitignorePath: tmp, entries: ['x'] });
    const result = await u.update();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/Failed to update .gitignore/);
  });

  it('isEntryIgnored returns true when the entry is present', async () => {
    await fs.writeFile(gitignorePath, 'a\nb\nsecurity-reports/\n');
    const u = new GitignoreUpdater({ gitignorePath, entries: [] });
    expect(await u.isEntryIgnored('security-reports/')).toBe(true);
    expect(await u.isEntryIgnored('not-in-list')).toBe(false);
  });

  it('isEntryIgnored returns false when .gitignore does not exist', async () => {
    const u = new GitignoreUpdater({ gitignorePath, entries: [] });
    expect(await u.isEntryIgnored('anything')).toBe(false);
  });

  it('uses default entries when none are passed to the constructor', async () => {
    const u = new GitignoreUpdater({ gitignorePath });
    const result = await u.update();
    expect(result.added).toContain('security-reports/');
    expect(result.added).toContain('security-reports/*');
  });

  it('deduplicates and trims entries on initial creation and subsequent updates (F35)', async () => {
    const u = new GitignoreUpdater({
      gitignorePath,
      entries: [' security-reports/ ', 'security-reports/', 'security-reports/*', '   '],
    });
    const first = await u.update();
    expect(first.added).toEqual(['security-reports/', 'security-reports/*']);
    const second = await u.update();
    expect(second.added).toEqual([]);
    expect(await u.isEntryIgnored('  security-reports/  ')).toBe(true);
  });

  it('deduplicates options.entries on existing .gitignore and tolerates omitted pattern.fileExtensions in SecurityScanner (F774)', async () => {
    await fs.writeFile(gitignorePath, 'node_modules/\n', 'utf8');
    const u = new GitignoreUpdater({
      gitignorePath,
      entries: [
        'security-reports/',
        ' security-reports/ ',
        'security-reports/*',
        'security-reports/',
      ],
    });
    const result = await u.update();
    expect(result.added).toEqual(['security-reports/', 'security-reports/*']);
    expect(result.existing).toEqual([]);
    const content = await fs.readFile(gitignorePath, 'utf8');
    expect(content.split(/\r?\n/).filter((l) => l.trim() === 'security-reports/')).toHaveLength(1);

    const { SecurityScanner } = await import('../src/scanner.js');
    const sampleFile = path.join(tmp, 'sample.ts');
    await fs.writeFile(sampleFile, 'const secret = "CUSTOM_TOKEN_123456";\n', 'utf8');
    const scanner = new SecurityScanner();
    const scanResult = await scanner.scan(
      tmp,
      {
        name: 'custom-skill',
        description: 'test skill',
        patterns: [
          {
            id: 'custom-no-ext',
            name: 'Custom Token Without Extensions',
            category: 'secrets',
            patterns: [/CUSTOM_TOKEN_[0-9]{6}/g],
            severity: 'high',
            confidence: 'high',
            description: 'Custom token pattern with omitted fileExtensions',
            remediation: 'Rotate token',
            falsePositiveMarkers: [],
            // External patterns may omit this required field at runtime.
          } as unknown as SecurityPattern,
          {
            id: 'custom-ts-ext',
            name: 'Custom Token With TS Extension',
            category: 'secrets',
            patterns: [/CUSTOM_TOKEN_[0-9]{6}/g],
            fileExtensions: ['.ts'],
            severity: 'high',
            confidence: 'high',
            description: 'Custom token pattern with .ts fileExtensions',
            remediation: 'Rotate token',
            falsePositiveMarkers: [],
          },
        ],
        excludePatterns: [],
        severityThresholds: { blockOn: 'critical', warnOn: 'high' },
        metadata: {
          generatedAt: '2026-08-01T00:00:00.000Z',
          targetFiles: [],
          confidence: 1,
        },
      } as unknown as GeneratedSkill,
      {
        stack: 'nodejs',
        packageManager: 'npm',
        manifestFile: 'package.json',
        dependencies: [],
        projectPath: tmp,
      },
    );
    expect(scanResult.findings.some((f) => f.patternId === 'custom-no-ext')).toBe(true);
  });
});
