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

function removeWithUnlinkRmdir(target: string): void {
  if (fs.lstatSync(target).isDirectory()) {
    for (const entry of fs.readdirSync(target)) removeWithUnlinkRmdir(path.join(target, entry));
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
