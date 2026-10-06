import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GradleAdapter } from '../src/adapters/gradle.js';
import type { DependencyObservation, Workspace } from '../src/types.js';

/**
 * `parseGradleManifest` collects the same dependency through two syntaxes — a
 * literal coordinate (`implementation("g:a:1.0")`) and a version-catalog alias
 * (`implementation(libs.x)`) — and BOTH collectors must recognise the SAME set
 * of Gradle configurations.
 *
 * They used to spell that list out inline in two regex literals, and drifted:
 * `coordinateRegex` carried `annotationProcessor` while `aliasRegex` did not.
 * The catalog form of an annotation processor was therefore collected by
 * NEITHER collector and vanished from the inventory — and with it from every
 * purl OSV advisory query. `scopeForConfiguration` had mapped
 * `annotationProcessor` to `'build'` all along, so the omission was drift, not
 * a decision.
 *
 * Both collectors are now built from one `GRADLE_CONFIGURATIONS` list.
 */

const temps: string[] = [];

afterEach(async () => {
  for (const dir of temps.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

const CATALOG = `[versions]
autoValue = "1.10.4"

[libraries]
google-auto-value = { module = "com.google.auto.value:auto-value", version.ref = "autoValue" }
google-auto-value-annotations = { module = "com.google.auto.value:auto-value-annotations", version.ref = "autoValue" }
guava = { module = "com.google.guava:guava", version = "31.1-jre" }
`;

async function inventory(manifestBody: string): Promise<readonly DependencyObservation[]> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gradle-alias-'));
  temps.push(dir);

  await fs.mkdir(path.join(dir, 'gradle'), { recursive: true });
  await fs.writeFile(path.join(dir, 'gradle', 'libs.versions.toml'), CATALOG, 'utf8');
  await fs.writeFile(path.join(dir, 'build.gradle.kts'), manifestBody, 'utf8');

  const workspace: Workspace = {
    id: 'ws-test',
    relativeRoot: '.',
    ecosystem: 'gradle',
    manifests: [path.join(dir, 'build.gradle.kts')],
    lockfiles: [],
    confidence: 1,
    coverage: 'full',
  };
  return new GradleAdapter().inventory(workspace, { projectRoot: dir });
}

const row = (rows: readonly DependencyObservation[], name: string) =>
  rows.find((r) => r.name === name);

describe('gradle version-catalog aliases across every recognised configuration', () => {
  // The regression: the catalog alias form of an annotation processor.
  it('inventories annotationProcessor(libs.x) as scope=build', async () => {
    const rows = await inventory(
      ['dependencies {', '  annotationProcessor(libs.google.auto.value.annotations)', '}'].join(
        '\n',
      ),
    );

    const found = row(rows, 'com.google.auto.value:auto-value-annotations');
    expect(found).toBeDefined();
    expect(found?.scope).toBe('build');
    expect(found?.requested).toBe('1.10.4');
  });

  // The alias form must sit ALONGSIDE the literal-coordinate form of the same
  // configuration, proving both collectors now agree on the list.
  it('inventories the alias and literal forms of annotationProcessor together', async () => {
    const rows = await inventory(
      [
        'dependencies {',
        '  annotationProcessor(libs.google.auto.value.annotations)',
        '  annotationProcessor("com.google.auto.value:auto-value:1.10.4")',
        '}',
      ].join('\n'),
    );

    const aliasRow = row(rows, 'com.google.auto.value:auto-value-annotations');
    const literalRow = row(rows, 'com.google.auto.value:auto-value');

    expect(aliasRow).toBeDefined();
    expect(literalRow).toBeDefined();
    expect(aliasRow?.scope).toBe('build');
    expect(literalRow?.scope).toBe('build');
  });

  // Regression guard on the configuration list itself: every entry must be
  // collectable in BOTH syntaxes, so the two collectors can never drift again.
  it.each([
    ['implementation', 'runtime'],
    ['api', 'runtime'],
    ['compileOnly', 'build'],
    ['runtimeOnly', 'runtime'],
    ['testImplementation', 'development'],
    ['testRuntimeOnly', 'development'],
    ['annotationProcessor', 'build'],
  ])('collects %s in both alias and literal form as scope=%s', async (configuration, scope) => {
    const aliasManifest = ['dependencies {', `  ${configuration}(libs.guava)`, '}'].join('\n');
    const literalManifest = [
      'dependencies {',
      `  ${configuration}("com.google.guava:guava:31.1-jre")`,
      '}',
    ].join('\n');

    const aliasRows = await inventory(aliasManifest);
    const literalRows = await inventory(literalManifest);

    expect(row(aliasRows, 'com.google.guava:guava')?.scope).toBe(scope);
    expect(row(literalRows, 'com.google.guava:guava')?.scope).toBe(scope);
  });

  // Control: the Groovy parenthesis-free alias spelling still resolves.
  it('collects the parenthesis-free alias spelling', async () => {
    const rows = await inventory(['dependencies {', '  implementation libs.guava', '}'].join('\n'));
    expect(row(rows, 'com.google.guava:guava')?.scope).toBe('runtime');
  });
});
