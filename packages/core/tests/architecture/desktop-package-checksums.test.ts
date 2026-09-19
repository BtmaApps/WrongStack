import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DESKTOP_CHECKSUM_MANIFEST,
  writeDesktopChecksums,
} from '../../../../scripts/lib/desktop-package-checksums.mjs';

const scratchDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    scratchDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('Desktop release checksum manifest', () => {
  it('hashes publishable files deterministically and excludes builder internals', async () => {
    const releaseDir = await mkdtemp(join(tmpdir(), 'wrongstack-desktop-checksums-'));
    scratchDirs.push(releaseDir);
    await Promise.all([
      writeFile(join(releaseDir, 'wrongstack-desktop-portable.exe'), 'portable'),
      writeFile(join(releaseDir, 'wrongstack-desktop-setup.exe.blockmap'), 'blockmap'),
      writeFile(join(releaseDir, 'latest.yml'), 'metadata'),
      writeFile(join(releaseDir, 'builder-debug.yml'), 'debug'),
      writeFile(join(releaseDir, 'builder-effective-config.yaml'), 'config'),
      mkdir(join(releaseDir, 'win-unpacked')),
    ]);

    const entries = await writeDesktopChecksums(releaseDir);

    expect(entries).toEqual([
      { name: 'wrongstack-desktop-portable.exe', sha256: sha256('portable') },
      { name: 'wrongstack-desktop-setup.exe.blockmap', sha256: sha256('blockmap') },
    ]);
    await expect(readFile(join(releaseDir, DESKTOP_CHECKSUM_MANIFEST), 'utf8')).resolves.toBe(
      `${sha256('portable')}  wrongstack-desktop-portable.exe\n${sha256('blockmap')}  wrongstack-desktop-setup.exe.blockmap\n`,
    );

    await expect(writeDesktopChecksums(releaseDir)).resolves.toEqual(entries);
  });

  it('keeps Desktop workflow upload and release verification on the package-owned manifest', async () => {
    const [desktopWorkflow, releaseWorkflow] = await Promise.all([
      readFile('.github/workflows/desktop.yml', 'utf8'),
      readFile('.github/workflows/release.yml', 'utf8'),
    ]);

    expect(desktopWorkflow).toContain('.temp_files/package-desktop-stage/release/');
    expect(desktopWorkflow).not.toContain('apps/desktop/.package-stage/release/');
    expect(desktopWorkflow).toContain('include-hidden-files: true');
    expect(desktopWorkflow).toContain(
      '.temp_files/package-desktop-stage/release/wrongstack-desktop-*',
    );
    expect(desktopWorkflow).not.toContain('wrongstack-desktop-*.exe');
    expect(desktopWorkflow).toContain("DESKTOP-SHA256SUMS-'+process.env.DESKTOP_MATRIX_OS");
    expect(releaseWorkflow).toContain('cat DESKTOP-SHA256SUMS-*');
    expect(releaseWorkflow).toContain('sha256sum --check DESKTOP-SHA256SUMS');
    expect(releaseWorkflow).not.toContain('sha256sum wrongstack-desktop-*');
  });

  it('does not create an empty manifest for a directory-only package', async () => {
    const releaseDir = await mkdtemp(join(tmpdir(), 'wrongstack-desktop-checksums-empty-'));
    scratchDirs.push(releaseDir);
    await mkdir(join(releaseDir, 'win-unpacked'));

    await expect(writeDesktopChecksums(releaseDir)).resolves.toEqual([]);
    await expect(readFile(join(releaseDir, DESKTOP_CHECKSUM_MANIFEST), 'utf8')).rejects.toThrow();
  });
});
