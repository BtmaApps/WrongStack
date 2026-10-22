/**
 * Regression (F529): touchProjectInManifest read projects.json with a bare
 * JSON.parse and its `forWrite` guard only rethrew errors carrying an errno
 * code. A BOM-saved manifest (a SyntaxError, no code) read as empty and the
 * write-back erased every other registered project.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadManifest, touchProjectInManifest } from '../src/server/projects-manifest.js';

let home: string;
let configPath: string;
let manifestPath: string;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'webui-projects-bom-'));
  configPath = path.join(home, 'config.json');
  manifestPath = path.join(home, 'projects.json');
});
afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true });
});

describe('touchProjectInManifest', () => {
  it('keeps other projects when projects.json has a BOM', async () => {
    const other = { name: 'other', root: path.join(home, 'other'), slug: 'other' };
    await fs.writeFile(manifestPath, `﻿${JSON.stringify({ projects: [other] })}`);
    await touchProjectInManifest({ projectRoot: path.join(home, 'current') }, configPath);
    const names = (await loadManifest(configPath)).projects.map((p) => p.name).sort();
    expect(names).toEqual(['current', 'other']);
  });

  it('refuses to rewrite an unparseable manifest', async () => {
    await fs.writeFile(manifestPath, '{ "projects": [');
    await expect(
      touchProjectInManifest({ projectRoot: path.join(home, 'current') }, configPath),
    ).rejects.toThrow();
    expect(await fs.readFile(manifestPath, 'utf8')).toBe('{ "projects": [');
  });
});
