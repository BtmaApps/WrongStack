import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GradleAdapter } from '../../src/adapters/gradle.js';
import type { Workspace } from '../../src/types.js';

/**
 * The version catalog belongs to the ROOT build (`<root>/gradle/libs.versions.toml`,
 * next to `settings.gradle.kts`). The adapter used to probe only the workspace
 * root, and discovery hands every subproject (`app/`) its own workspace — so a
 * subproject's `implementation(libs.x)` resolved against no catalog and every
 * one of its dependencies silently vanished from the inventory.
 */

const temps: string[] = [];

afterEach(async () => {
  for (const dir of temps.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

async function write(file: string, body: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, 'utf8');
}

async function inventoryNames(projectRoot: string, relativeRoot: string): Promise<string[]> {
  const workspace: Workspace = {
    id: `ws-${relativeRoot}`,
    relativeRoot,
    ecosystem: 'gradle',
    manifests: [path.join(projectRoot, relativeRoot, 'build.gradle.kts')],
    lockfiles: [],
    confidence: 1,
    coverage: 'full',
  };
  const observations = await new GradleAdapter().inventory(workspace, { projectRoot });
  return observations.map((o) => `${o.name}@${o.requested}`);
}

const USES_GUAVA = 'dependencies {\n    implementation(libs.guava)\n}\n';

describe('GradleAdapter — root-build version catalog', () => {
  it('resolves a subproject `libs.*` alias against the root build catalog', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gradle-subproject-'));
    temps.push(root);
    await write(path.join(root, 'settings.gradle.kts'), 'include(":app")\n');
    await write(
      path.join(root, 'gradle', 'libs.versions.toml'),
      '[libraries]\nguava = "com.google.guava:guava:33.0.0-jre"\n',
    );
    await write(path.join(root, 'app', 'build.gradle.kts'), USES_GUAVA);
    await write(path.join(root, 'libs', 'core', 'build.gradle.kts'), USES_GUAVA);

    expect(await inventoryNames(root, 'app')).toEqual(['com.google.guava:guava@33.0.0-jre']);
    expect(await inventoryNames(root, path.join('libs', 'core'))).toEqual([
      'com.google.guava:guava@33.0.0-jre',
    ]);
  });

  it('does not borrow an outer catalog across a separate build or above the project root', async () => {
    const outer = await fs.mkdtemp(path.join(os.tmpdir(), 'gradle-subproject-'));
    temps.push(outer);
    await write(
      path.join(outer, 'gradle', 'libs.versions.toml'),
      '[libraries]\nguava = "com.google.guava:guava:1"\n',
    );
    await write(path.join(outer, 'settings.gradle'), '');
    await write(path.join(outer, 'tools', 'settings.gradle.kts'), '');
    await write(path.join(outer, 'tools', 'build.gradle.kts'), USES_GUAVA);
    expect(await inventoryNames(outer, 'tools')).toEqual([]);

    const project = path.join(outer, 'proj');
    await write(path.join(project, 'build.gradle.kts'), USES_GUAVA);
    expect(await inventoryNames(project, '.')).toEqual([]);
  });
});
