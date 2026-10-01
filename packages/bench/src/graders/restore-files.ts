import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Graders run in the agent's own workdir, so any file the agent could reach —
 * the test file, the checker script — holds whatever the agent left there.
 * Copy each listed file from the task template over the workdir copy when
 * they differ (or the workdir copy is gone), so grading uses the ORIGINAL.
 * Paths that are absolute or escape either root are skipped. Returns the
 * relative paths that were restored.
 */
export async function restoreFromTemplate(
  templateDir: string,
  workdir: string,
  relPaths: readonly string[],
): Promise<string[]> {
  const restored: string[] = [];
  for (const rel of relPaths) {
    const source = await inside(templateDir, rel);
    const target = await inside(workdir, rel);
    if (!source || !target) continue;
    let original: Buffer;
    try {
      original = await fs.readFile(source);
    } catch {
      continue; // not in the template: nothing to restore from
    }
    const current = await fs.readFile(target).catch(() => undefined);
    if (current?.equals(original)) continue;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, original);
    restored.push(rel);
  }
  return restored;
}

/** Grade-detail prefix naming the files {@link restoreFromTemplate} restored. */
export function restoredNote(restored: readonly string[], what: string): string {
  return restored.length > 0 ? `restored modified ${what}: ${restored.join(', ')}` : '';
}

/** `rel` resolved under `root`, or undefined when it is absolute or escapes. */
async function inside(root: string, rel: string): Promise<string | undefined> {
  if (path.isAbsolute(rel)) return undefined;
  const rootAbs = path.resolve(root);
  const target = path.resolve(rootAbs, rel);
  const relative = path.relative(rootAbs, target);
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return undefined;
  }
  const canonicalRoot = await fs.realpath(rootAbs).catch(() => undefined);
  if (!canonicalRoot) return undefined;
  for (let probe = target; ; probe = path.dirname(probe)) {
    let canonical: string;
    try {
      canonical = await fs.realpath(probe);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || probe === rootAbs) {
        return undefined;
      }
      const entry = await fs.lstat(probe).catch(() => undefined);
      if (entry?.isSymbolicLink()) return undefined;
      continue;
    }
    const resolved = path.resolve(canonical, path.relative(probe, target));
    const canonicalRelative = path.relative(canonicalRoot, resolved);
    if (
      canonicalRelative === '..' ||
      canonicalRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(canonicalRelative)
    ) {
      return undefined;
    }
    return target;
  }
}
