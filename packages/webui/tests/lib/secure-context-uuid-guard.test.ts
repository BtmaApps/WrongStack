import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #415: `crypto.randomUUID` only exists in secure contexts. The WebUI is
 * routinely opened over plain HTTP from a LAN address, where a direct call
 * throws and unmounts the view (the Goal panel went blank on Start Goal).
 * Every id must come from `safeId()` in `src/lib/utils.ts`. The protocol
 * package is bundled into the WebUI too, so it is held to the same rule.
 */
const SRC = join(__dirname, '..', '..', 'src');
const PROTOCOL_SRC = join(__dirname, '..', '..', '..', 'webui-protocol', 'src');
const ALLOWED = new Set(['lib/utils.ts']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('secure-context-only crypto.randomUUID', () => {
  it('is called only through safeId()', () => {
    const offenders = sourceFiles(SRC)
      .map((path) => relative(SRC, path).replaceAll('\\', '/'))
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) => /\brandomUUID\b/.test(readFileSync(join(SRC, rel), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('is never called by the bundled webui-protocol package', () => {
    const offenders = sourceFiles(PROTOCOL_SRC)
      .filter((path) => /\brandomUUID\b/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(PROTOCOL_SRC, path).replaceAll('\\', '/'));
    expect(offenders).toEqual([]);
  });
});
