import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getSageSurface, SqliteMemoryPort } from '../src/memory-port.js';
import { importLegacyFilesIntoStore } from '../src/project-server-legacy-import.js';

let projectRoot: string | undefined;
let outsideDir: string | undefined;
let port: SqliteMemoryPort | undefined;

afterEach(async () => {
  try {
    await port?.dispose();
  } catch {
    // Best effort; assertions are the result signal.
  }
  if (projectRoot) await fs.rm(projectRoot, { recursive: true, force: true });
  if (outsideDir) await fs.rm(outsideDir, { recursive: true, force: true });
  projectRoot = undefined;
  outsideDir = undefined;
  port = undefined;
});

describe('inline SAGE legacy import containment', () => {
  it('accepts an inside file when the project root is a symlink or junction', async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sage-import-real-project-'));
    outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sage-import-root-alias-'));
    const linkedRoot = path.join(outsideDir, 'linked-project');
    await fs.symlink(projectRoot, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
    await fs.writeFile(
      path.join(projectRoot, 'inside.md'),
      '- Imported through root alias\n',
      'utf8',
    );

    port = new SqliteMemoryPort({ projectRoot: linkedRoot });
    const surface = getSageSurface(port)!;
    await expect(surface.importLegacy!([path.join(linkedRoot, 'inside.md')])).resolves.toEqual({
      imported: 1,
      skipped: 0,
      files: 1,
    });

    const importLegacy = async (raw: string) => ({
      imported: raw.includes('Imported through root alias') ? 1 : 0,
      skipped: 0,
      files: 0,
    });
    await expect(
      importLegacyFilesIntoStore(linkedRoot, { importLegacy } as never, [
        path.join(linkedRoot, 'inside.md'),
      ]),
    ).resolves.toEqual({ imported: 1, skipped: 0, files: 1 });
  });

  it('rejects an outside file while accepting an inside control file', async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sage-import-project-'));
    outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sage-import-outside-'));
    const inside = path.join(projectRoot, 'inside-memories.md');
    const outside = path.join(outsideDir, 'outside-memories.md');
    await fs.writeFile(inside, '# Memories\n- [project] Inside control memory\n', 'utf8');
    await fs.writeFile(outside, '# Memories\n- [project] Outside secret memory\n', 'utf8');

    port = new SqliteMemoryPort({ projectRoot });
    const surface = getSageSurface(port)!;

    await expect(surface.importLegacy!([outside])).rejects.toThrow(/inside the project root/i);
    await expect(surface.importLegacy!([inside])).resolves.toEqual(
      expect.objectContaining({ files: 1, imported: 1 }),
    );
  });
});
