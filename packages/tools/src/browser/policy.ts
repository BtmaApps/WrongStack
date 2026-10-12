import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveWstackPaths, updateJsonObjectFile } from '@wrongstack/core/utils';
import { parsePrivateOriginAllowlist } from './security.js';

/**
 * One live array per project. Browser managers and the network proxy keep a
 * reference to it, so a refresh rewrites it in place instead of replacing it.
 * `stamp` is the policy file's mtime+size when it was last read: another
 * process (the TUI next to a WebUI host) may save an allowance, and an
 * in-memory copy that never re-read the file kept refusing it.
 */
const liveOrigins = new Map<string, { origins: string[]; stamp: string }>();
function policyPath(root: string): string {
  return join(resolveWstackPaths({ projectRoot: resolve(root) }).projectDir, 'browser-policy.json');
}

function policyStamp(path: string): string {
  try {
    const stat = statSync(path);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
    throw error;
  }
}

function readStoredOrigins(path: string): string[] {
  let saved: unknown = {};
  try {
    saved = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved))
    throw new Error('browser: invalid browser-policy.json');
  const stored = (saved as { privateOrigins?: unknown }).privateOrigins ?? [];
  if (!Array.isArray(stored) || stored.some((entry) => typeof entry !== 'string')) {
    throw new Error('browser: invalid privateOrigins in browser-policy.json');
  }
  return parsePrivateOriginAllowlist(stored.join(','));
}

function replaceOrigins(target: string[], stored: readonly string[]): void {
  target.splice(
    0,
    target.length,
    ...new Set([
      ...parsePrivateOriginAllowlist(process.env['WRONGSTACK_BROWSER_PRIVATE_ORIGINS']),
      ...stored,
    ]),
  );
}

export function browserPrivateOrigins(root: string): string[] {
  const key = resolve(root);
  const path = policyPath(key);
  const stamp = policyStamp(path);
  let live = liveOrigins.get(key);
  if (live?.stamp === stamp) return live.origins;
  const stored = readStoredOrigins(path);
  if (!live) {
    live = { origins: [], stamp };
    liveOrigins.set(key, live);
  }
  replaceOrigins(live.origins, stored);
  live.stamp = stamp;
  return live.origins;
}

/** Explicit operator choice, scoped to one project and one exact origin. */
export async function setBrowserPrivateOrigin(
  root: string,
  raw: string,
  allow: boolean,
): Promise<string[]> {
  const [origin] = parsePrivateOriginAllowlist(raw);
  if (!origin || parsePrivateOriginAllowlist(raw).length !== 1)
    throw new Error(
      'Expected one HTTP(S) origin, for example http://localhost:3000, or "loopback" for every local port',
    );
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
  replaceOrigins(current, saved);
  const live = liveOrigins.get(resolve(root));
  if (live) live.stamp = policyStamp(policyPath(root));
  return [...current];
}
