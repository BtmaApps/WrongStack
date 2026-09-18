import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { SKILL_LIMITS } from './limits.js';

/** Collect a portable skill package, without following directory links or escaping its root. */
export async function collectSkillFiles(root: string): Promise<string[]> {
  const realRoot = await fs.realpath(root);
  const files: string[] = [];
  let totalBytes = 0;
  async function walk(dir: string): Promise<void> {
    const entries = (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      if (['.git', 'node_modules', 'dist', 'build'].includes(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(file);
        continue;
      }
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;
      const realFile = await fs.realpath(file);
      if (!realFile.startsWith(realRoot + path.sep))
        throw new Error(`Skill resource escapes its directory: ${entry.name}`);
      const stat = await fs.stat(realFile);
      if (!stat.isFile()) continue;
      if (stat.size > SKILL_LIMITS.MAX_SKILL_FILE_SIZE)
        throw new Error(`Skill file ${entry.name} is too large`);
      totalBytes += stat.size;
      if (totalBytes > SKILL_LIMITS.MAX_UNCOMPRESSED_TARBALL_SIZE)
        throw new Error('Skill package is too large');
      files.push(path.relative(root, file));
    }
  }
  await walk(root);
  return files;
}

/** Stage a complete package before replacing its previous working directory. */
export async function replaceSkillDirectory(
  source: string,
  target: string,
  files: string[],
  link = false,
): Promise<void> {
  const parent = path.dirname(target);
  await fs.mkdir(parent, { recursive: true });
  const stage = await fs.mkdtemp(path.join(parent, '.skill-stage-'));
  const backup = `${stage}-previous`;
  let backedUp = false;
  try {
    let linked = false;
    if (link) {
      await fs.rmdir(stage);
      try {
        await fs.symlink(
          path.resolve(source),
          stage,
          process.platform === 'win32' ? 'junction' : 'dir',
        );
        linked = true;
      } catch {
        await fs.mkdir(stage);
      }
    }
    for (const file of linked ? [] : files) {
      const output = path.resolve(stage, file);
      if (!output.startsWith(path.resolve(stage) + path.sep))
        throw new Error('Skill file escapes staging directory');
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.copyFile(path.join(source, file), output);
    }
    try {
      await fs.rename(target, backup);
      backedUp = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    try {
      await fs.rename(stage, target);
    } catch (error) {
      if (backedUp) await fs.rename(backup, target);
      throw error;
    }
    if (backedUp) await fs.rm(backup, { recursive: true, force: true });
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}
