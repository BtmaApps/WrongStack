/**
 * Path-contained, size-bounded legacy JSONL import for the SAGE project
 * server's `importLegacyFiles` operation.
 */
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import type { CompleteSageStore } from './project-server-options.js';
import type { SageServerOperations } from './project-server-protocol.js';

const MAX_LEGACY_IMPORT_BYTES = 5 * 1024 * 1024;

export async function importLegacyFilesIntoStore(
  projectRoot: string,
  store: CompleteSageStore,
  files: string[],
): Promise<SageServerOperations['importLegacyFiles']['result']> {
  const result = { imported: 0, skipped: 0, files: 0 };
  let totalBytes = 0;
  for (const file of files) {
    // Path containment: every imported file must live under `projectRoot`.
    // This closes the threat where a same-UID caller invokes
    // `importLegacyFiles(['/etc/passwd'])` or `['~/.ssh/id_rsa'])`. Files
    // that legitimately live outside the project (e.g. a cross-project
    // migration export staged in /tmp) require the operator to first copy
    // them into the project boundary — explicit and reversible.
    //
    // Defense-in-depth: `path.resolve()` only normalises lexically and
    // does NOT resolve symlinks. A symlink inside `projectRoot` that
    // points outside it would pass the lexical check and then be read
    // by `fsPromises.readFile()` (which follows symlinks), so we
    // resolve to the real path first and check containment on that.
    const resolved = await fsPromises.realpath(file);
    const rel = path.relative(projectRoot, resolved);
    // Canonical escape test: `..hidden` is a legal in-root first segment; a
    // bare startsWith('..') would misread it as an escape.
    if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
      throw new Error(`importLegacyFiles: file path must stay inside the project root: ${file}`);
    }
    const stat = await fsPromises.stat(resolved);
    totalBytes += stat.size;
    if (totalBytes > MAX_LEGACY_IMPORT_BYTES) {
      throw new Error(`Legacy memory import exceeds ${MAX_LEGACY_IMPORT_BYTES} bytes`);
    }
    const raw = await fsPromises.readFile(resolved, 'utf8');
    const imported = await store.importLegacy(raw);
    result.imported += imported.imported;
    result.skipped += imported.skipped;
    result.files += 1;
  }
  return result;
}
