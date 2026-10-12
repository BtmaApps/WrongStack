import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyWorkspaceEdit } from '../../src/tools/workspace-edit.js';
import { pathToUri } from '../../src/utils/uri.js';

/**
 * applyWorkspaceEdit rewrites each target whole from its decode. A legacy
 * single-byte file touched by a multi-file lsp_rename came back with U+FFFD
 * for every non-ASCII byte (ISO-8859-9 "ü" is the lone byte 0xFC).
 */
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

const renameOnSecondLine = [
  {
    range: { start: { line: 1, character: 9 }, end: { line: 1, character: 16 } },
    newText: 'newName',
  },
];
const source = (comment: Buffer) =>
  Buffer.concat([Buffer.from('// '), comment, Buffer.from('\nfunction oldName() {}\n')]);

describe('applyWorkspaceEdit source encoding', () => {
  it('refuses the whole edit when a target is not UTF-8 and writes nothing', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'plug-lsp-enc-'));
    tempDirs.push(root);
    const utf8 = source(Buffer.from('Güncel', 'utf8'));
    const legacy = source(Buffer.from('G\xfcncel', 'latin1'));
    const a = path.join(root, 'a.ts');
    const b = path.join(root, 'b.ts');
    await fs.writeFile(a, utf8);
    await fs.writeFile(b, legacy);
    const fileWritten = vi.fn(async () => undefined);

    await expect(
      applyWorkspaceEdit(
        { changes: { [pathToUri(a)]: renameOnSecondLine, [pathToUri(b)]: renameOnSecondLine } },
        { fileWritten } as never,
        root,
      ),
    ).rejects.toThrow(/not UTF-8 text/);
    expect(await fs.readFile(a)).toEqual(utf8);
    expect(await fs.readFile(b)).toEqual(legacy);
    expect(fileWritten).not.toHaveBeenCalled();
  });

  it('keeps a UTF-8 BOM byte for byte when applying an edit', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'plug-lsp-enc-'));
    tempDirs.push(root);
    const file = path.join(root, 'bom.ts');
    await fs.writeFile(
      file,
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), source(Buffer.from('Güncel', 'utf8'))]),
    );

    await applyWorkspaceEdit(
      { changes: { [pathToUri(file)]: renameOnSecondLine } },
      { fileWritten: vi.fn(async () => undefined) } as never,
      root,
    );
    expect(await fs.readFile(file, 'utf8')).toBe('﻿// Güncel\nfunction newName() {}\n');
  });
});
