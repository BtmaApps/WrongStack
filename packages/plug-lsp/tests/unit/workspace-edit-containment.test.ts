import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyWorkspaceEdit } from '../../src/tools/workspace-edit.js';
import { pathToUri } from '../../src/utils/uri.js';

/**
 * applyWorkspaceEdit wrote a server-provided WorkspaceEdit to any absolute
 * path it named — a misbehaving or hostile language server could rewrite
 * files outside the project through a single lsp_rename (audit 2026-09-15).
 */
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

const replaceFirstWord = (newText: string) => [
  { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText },
];

describe('applyWorkspaceEdit project-root containment', () => {
  it('refuses the whole edit when any target is outside the root and writes nothing', async () => {
    const root = await tempDir('plug-lsp-root-');
    const outsideDir = await tempDir('plug-lsp-outside-');
    const inside = path.join(root, 'a.ts');
    const outside = path.join(outsideDir, 'victim.ts');
    await fs.writeFile(inside, 'alpha;\n');
    await fs.writeFile(outside, 'alpha;\n');
    const fileWritten = vi.fn(async () => undefined);

    await expect(
      applyWorkspaceEdit(
        {
          changes: {
            [pathToUri(inside)]: replaceFirstWord('omega'),
            [pathToUri(outside)]: replaceFirstWord('owned'),
          },
        },
        { fileWritten } as never,
        root,
      ),
    ).rejects.toThrow(/outside the project root/);

    expect(await fs.readFile(inside, 'utf8')).toBe('alpha;\n');
    expect(await fs.readFile(outside, 'utf8')).toBe('alpha;\n');
    expect(fileWritten).not.toHaveBeenCalled();
  });

  it('refuses a target that escapes the root through a symlink', async () => {
    const root = await tempDir('plug-lsp-root-');
    const outsideDir = await tempDir('plug-lsp-outside-');
    const outside = path.join(outsideDir, 'victim.ts');
    await fs.writeFile(outside, 'alpha;\n');
    const link = path.join(root, 'linked.ts');
    try {
      await fs.symlink(outside, link, 'file');
    } catch {
      // Creating symlinks needs elevated rights on some Windows setups.
      return;
    }

    await expect(
      applyWorkspaceEdit(
        { changes: { [pathToUri(link)]: replaceFirstWord('owned') } },
        { fileWritten: vi.fn() } as never,
        root,
      ),
    ).rejects.toThrow(/outside the project root/);
    expect(await fs.readFile(outside, 'utf8')).toBe('alpha;\n');
  });

  it('still applies an edit confined to the root', async () => {
    const root = await tempDir('plug-lsp-root-');
    await fs.mkdir(path.join(root, 'src'));
    const file = path.join(root, 'src', 'b.ts');
    await fs.writeFile(file, 'alpha;\n');

    const result = await applyWorkspaceEdit(
      { changes: { [pathToUri(file)]: replaceFirstWord('omega') } },
      { fileWritten: vi.fn(async () => undefined) } as never,
      root,
    );
    expect(result).toEqual({ files: [file], edits: 1 });
    expect(await fs.readFile(file, 'utf8')).toBe('omega;\n');
  });
});
