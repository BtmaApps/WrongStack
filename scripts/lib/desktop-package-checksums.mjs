import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const DESKTOP_CHECKSUM_MANIFEST = 'SHA256SUMS.txt';

const RELEASE_ASSET_PREFIX = 'wrongstack-desktop-';

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

/**
 * Write a deterministic checksum manifest for top-level publishable assets.
 * Electron Builder's diagnostic configuration stays local and is excluded.
 */
export async function writeDesktopChecksums(releaseDir) {
  const files = (await readdir(releaseDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.startsWith(RELEASE_ASSET_PREFIX))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, 'en'));

  const entries = [];
  for (const name of files) {
    entries.push({ name, sha256: await sha256File(join(releaseDir, name)) });
  }

  if (entries.length === 0) return entries;
  const body = `${entries.map(({ name, sha256 }) => `${sha256}  ${name}`).join('\n')}\n`;
  await writeFile(join(releaseDir, DESKTOP_CHECKSUM_MANIFEST), body, 'utf8');
  return entries;
}
