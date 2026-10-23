import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { readBunLock } from '../../../../scripts/lib/read-bun-lock.mjs';

const root = path.resolve(import.meta.dirname, '../../../..');
const advisory = 'GHSA-ch52-4w7c-c8xp';
const dependency = 'http-cache-semantics@4.3.0';
describe('cache security advisory is fixed by the resolved upstream version', () => {
  it('requires the fixed floor without an advisory exception or local patch', async () => {
    const workspace = parse(await readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8'));
    const lock = readBunLock(path.join(root, 'bun.lock'));
    expect(lock).toBeDefined();
    expect(workspace.overrides['http-cache-semantics']).toBe('>=4.3.0');
    expect(workspace.auditConfig.ignoreGhsas).not.toContain(advisory);
    expect(workspace.patchedDependencies?.[dependency]).toBeUndefined();
    expect(lock.patchedDependencies?.[dependency]).toBeUndefined();
    const snapshots = Object.values(lock.packages).filter((pkg) =>
      pkg[0].startsWith('http-cache-semantics@'),
    );
    expect(snapshots.length).toBeGreaterThan(0);
    for (const snapshot of snapshots) expect(snapshot[0]).toBe(dependency);
  });
  it('checks the actual downstream resolution used by Electron', () => {
    const require = createRequire(path.join(root, 'apps/desktop/package.json'));
    const builder = createRequire(require.resolve('electron-builder/package.json')).resolve(
      'app-builder-lib/package.json',
    );
    const get = createRequire(builder).resolve('@electron/get/package.json');
    const got = createRequire(get).resolve('got/package.json');
    const cache = createRequire(got).resolve('cacheable-request/package.json');
    const policy = createRequire(cache)('http-cache-semantics/package.json') as {
      version: string;
    };
    expect(policy.version).toBe('4.3.0');
  });
});
