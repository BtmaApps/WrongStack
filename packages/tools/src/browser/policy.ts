import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveWstackPaths, updateJsonObjectFile } from '@wrongstack/core/utils';
import { parsePrivateOriginAllowlist } from './security.js';

const liveOrigins = new Map<string, string[]>();
function policyPath(root: string): string {
  return join(resolveWstackPaths({ projectRoot: resolve(root) }).projectDir, 'browser-policy.json');
}

export function browserPrivateOrigins(root: string): string[] {
  const key = resolve(root);
  let origins = liveOrigins.get(key);
  if (!origins) {
    let saved: unknown = {};
    try {
      saved = JSON.parse(readFileSync(policyPath(key), 'utf8').replace(/^\uFEFF/, ''));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (!saved || typeof saved !== 'object' || Array.isArray(saved))
      throw new Error('browser: invalid browser-policy.json');
    const stored = (saved as { privateOrigins?: unknown }).privateOrigins ?? [];
    if (!Array.isArray(stored) || stored.some((entry) => typeof entry !== 'string')) {
      throw new Error('browser: invalid privateOrigins in browser-policy.json');
    }
    origins = [
      ...new Set([
        ...parsePrivateOriginAllowlist(process.env['WRONGSTACK_BROWSER_PRIVATE_ORIGINS']),
        ...parsePrivateOriginAllowlist(stored.join(',')),
      ]),
    ];
    liveOrigins.set(key, origins);
  }
  return origins;
}

/** Explicit operator choice, scoped to one project and one exact origin. */
export async function setBrowserPrivateOrigin(
  root: string,
  raw: string,
  allow: boolean,
): Promise<string[]> {
  const [origin] = parsePrivateOriginAllowlist(raw);
  if (!origin || parsePrivateOriginAllowlist(raw).length !== 1)
    throw new Error('Expected one HTTP(S) origin, for example http://localhost:3000');
  const current = browserPrivateOrigins(root);
  let saved: string[] = [];
  await updateJsonObjectFile(policyPath(root), (config) => {
    const previous = config.privateOrigins ?? [];
    if (!Array.isArray(previous) || previous.some((entry) => typeof entry !== 'string'))
      throw new Error('browser: invalid privateOrigins in browser-policy.json');
    const origins = new Set(parsePrivateOriginAllowlist(previous.join(',')));
    if (allow) origins.add(origin);
    else origins.delete(origin);
    saved = [...origins];
    config.privateOrigins = saved;
  });
  current.splice(
    0,
    current.length,
    ...new Set([
      ...parsePrivateOriginAllowlist(process.env['WRONGSTACK_BROWSER_PRIVATE_ORIGINS']),
      ...saved,
    ]),
  );
  return [...current];
}
