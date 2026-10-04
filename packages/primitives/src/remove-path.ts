import * as fs from 'node:fs';
import * as path from 'node:path';

export interface RemovePathSyncOptions {
  readonly recursive?: boolean | undefined;
  readonly force?: boolean | undefined;
}

function pathExists(target: string): boolean {
  try {
    fs.lstatSync(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function assertSameDirectory(target: string, expected: fs.Stats): void {
  const current = fs.lstatSync(target);
  if (
    !current.isDirectory() ||
    current.isSymbolicLink() ||
    current.dev !== expected.dev ||
    current.ino !== expected.ino
  ) {
    throw new Error(`Path changed during recursive removal: ${target}`);
  }
}

function removeWithUnlinkRmdir(target: string): void {
  const info = fs.lstatSync(target);
  if (info.isDirectory()) {
    const entries = fs.readdirSync(target);
    // Readdir follows a path that may have been replaced by a symlink or
    // junction after lstat. Fence the traversal to the directory identity we
    // observed before reading its children.
    assertSameDirectory(target, info);
    for (const entry of entries) {
      assertSameDirectory(target, info);
      removeWithUnlinkRmdir(path.join(target, entry));
    }
    assertSameDirectory(target, info);
    fs.rmdirSync(target);
  } else {
    fs.unlinkSync(target);
  }
}

/**
 * `fs.rmSync` that actually removes the path.
 *
 * Node 24's native `rmSync` (verified on v24.13.0, win32) returns without
 * removing anything — and without throwing — when the path has a non-ASCII
 * segment (`C:\Users\Çağrı\…`, `D:\Projeler\Çalışma\…`), so every caller
 * believes the delete happened. When the path survives `rmSync`, this
 * removes it with `unlink`/`rmdir`, which are not affected. Same options and
 * errors as `rmSync` otherwise.
 */
export function removePathSync(target: string, options: RemovePathSyncOptions = {}): void {
  fs.rmSync(target, options);
  if (!pathExists(target)) return;
  if (options.recursive !== true && fs.lstatSync(target).isDirectory()) return;
  removeWithUnlinkRmdir(target);
}
