import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

/** Opaque ownership of the profile file this runtime actually opened. Never expose its path. */
export function profileIdentity(configPath: string): { id: string; name: string } {
  if (!configPath.trim()) throw Error('Profile config identity is unavailable.');
  let canonical = resolve(configPath);
  try {
    canonical = realpathSync.native(canonical);
  } catch {
    /* A new profile may not have a file yet. */
  }
  if (process.platform === 'win32') canonical = canonical.toLowerCase();
  return {
    id: createHash('sha256').update(canonical).digest('hex'),
    name: basename(dirname(resolve(configPath))),
  };
}
