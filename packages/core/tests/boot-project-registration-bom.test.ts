/**
 * Regression (F527): registerProjectInManifest runs on every boot and used to
 * treat a BOM-saved ~/.wrongstack/projects.json (which the /project picker
 * reads fine) as malformed — rewriting it with only the booting project and
 * erasing every other registered one.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerProjectInManifest } from '../src/boot-project-registration.js';
import type { WstackPaths } from '../src/utils/wstack-paths.js';

let globalRoot: string;

beforeEach(async () => {
  globalRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-projects-bom-'));
});
afterEach(async () => {
  await fs.rm(globalRoot, { recursive: true, force: true });
});

async function registeredNames(): Promise<string[]> {
  const raw = await fs.readFile(path.join(globalRoot, 'projects.json'), 'utf8');
  const manifest = JSON.parse(raw.replace(/^﻿/, '')) as { projects: Array<{ name: string }> };
  return manifest.projects.map((project) => project.name).sort();
}

describe('registerProjectInManifest with a BOM-saved projects.json', () => {
  it('keeps every other registered project', async () => {
    const other = { name: 'other', root: path.join(globalRoot, 'other'), slug: 'other' };
    await fs.writeFile(
      path.join(globalRoot, 'projects.json'),
      `﻿${JSON.stringify({ projects: [other] })}`,
    );
    const paths = { globalRoot, projectSlug: 'current' } as unknown as WstackPaths;
    await registerProjectInManifest(paths, path.join(globalRoot, 'current'));
    await registerProjectInManifest(paths, path.join(globalRoot, 'current'));
    expect(await registeredNames()).toEqual(['current', 'other']);
  });
});
