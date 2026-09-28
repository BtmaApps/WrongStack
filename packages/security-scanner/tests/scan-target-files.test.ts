/**
 * A scan reads only the files its skill targets. The per-stack lists left out
 * the stacks' own sources (`.tsx`/`.jsx`/`.mjs`/`.cjs`, Kotlin under Gradle, C
 * under CMake), a model-written list replaced the stack list outright, and a
 * project with two stacks was read as its first stack only — so a React
 * component, a Kotlin DAO or a Python service beside a Node toolchain was never
 * sent to the model. The provider here records which files each scan request
 * carried.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SecurityScannerOrchestrator } from '../src/orchestrator.js';
import { SecurityScanner } from '../src/scanner.js';
import { defaultSkillGenerator, SkillGenerator } from '../src/skill-generator.js';
import type { TechStackInfo } from '../src/types.js';

let root: string | undefined;
afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
  root = undefined;
});

async function project(files: Record<string, string>): Promise<string> {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'scan-targets-'));
  for (const [rel, body] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), body);
  }
  return root;
}

function recordingProvider(reply = 'no json') {
  const seen = new Set<string>();
  const provider = {
    id: 'fake',
    capabilities: {},
    complete: async (req: { messages: Array<{ content: unknown }> }) => {
      for (const m of String(req.messages[0]?.content ?? '').matchAll(/^=== (.+?) ===$/gm)) {
        seen.add(m[1] ?? '');
      }
      return {
        content: [{ type: 'text', text: reply }],
        stopReason: 'end_turn',
        usage: { input: 1, output: 1 },
      };
    },
  };
  return { provider, seen };
}

async function scanned(dir: string, reply?: string): Promise<string[]> {
  const { provider, seen } = recordingProvider(reply);
  await new SecurityScannerOrchestrator().run(provider as never, {
    projectRoot: dir,
    skipGitignore: true,
    reportOptions: { outputDir: '.sec-out' },
  });
  return [...seen].sort();
}

describe('security scan target files', () => {
  it('reads React components and ESM/CJS scripts of a Node project', async () => {
    const dir = await project({
      'package.json': '{"name":"app"}',
      'src/util.ts': 'export const x = 1;',
      'src/App.tsx': 'export const App = () => null;',
      'src/Legacy.jsx': 'export const L = () => null;',
      'scripts/deploy.mjs': 'export {};',
      'config/loader.cjs': 'module.exports = {};',
    });
    expect(await scanned(dir)).toEqual([
      'config/loader.cjs',
      'package.json',
      'scripts/deploy.mjs',
      'src/App.tsx',
      'src/Legacy.jsx',
      'src/util.ts',
    ]);
  });

  it('reads Kotlin under a Gradle build and C under CMake', async () => {
    const kotlin = await project({
      'build.gradle.kts': 'plugins {}',
      'src/main/kotlin/Db.kt': 'fun q() = 1',
    });
    expect(await scanned(kotlin)).toContain('src/main/kotlin/Db.kt');
    await fs.rm(kotlin, { recursive: true, force: true });

    const c = await project({
      'CMakeLists.txt': 'project(x C)',
      'src/main.c': 'int main(void){return 0;}',
      'src/main.h': 'int main(void);',
    });
    expect(await scanned(c)).toEqual(['CMakeLists.txt', 'src/main.c', 'src/main.h']);
  });

  it('reads every detected stack, not only the first', async () => {
    const dir = await project({
      'package.json': '{"name":"tooling"}',
      'requirements.txt': 'flask==3.0.0',
      'app/server.py': 'import os',
    });
    expect(await scanned(dir)).toEqual(['app/server.py', 'package.json', 'requirements.txt']);
  });

  it('keeps the stack list under a model-written target list', async () => {
    const dir = await project({ 'package.json': '{"name":"app"}' });
    const stack: TechStackInfo = {
      stack: 'nodejs',
      packageManager: 'npm',
      manifestFile: 'package.json',
      dependencies: [],
      projectPath: dir,
    };
    const { provider } = recordingProvider(
      JSON.stringify({ name: 'x', patterns: [], targetFiles: ['**/*.ts', 42, 'src/**'] }),
    );
    const skill = await defaultSkillGenerator.generateSkillLLM(
      provider as never,
      'm',
      dir,
      stack,
      new AbortController(),
    );
    expect(skill.metadata.targetFiles).toEqual(
      expect.arrayContaining(['**/*.ts', 'src/**', '**/*.tsx', '**/*.jsx', '**/*.mjs']),
    );
    expect(skill.metadata.targetFiles).not.toContain(42);
  });

  // The regex SecurityScanner (public API) reads and matches only the
  // extensions its patterns declare; the JS patterns said `.ts`/`.js`, so the
  // same eval line in any other JS/TS source form was never reported.
  it('regex scanner flags JS patterns in every JS/TS source form', async () => {
    const files = ['a.ts', 'b.js', 'c.tsx', 'd.jsx', 'e.mjs', 'f.cjs', 'g.mts', 'h.cts'];
    const dir = await project({
      'package.json': '{}',
      ...Object.fromEntries(files.map((f) => [f, 'export const run = (input) => eval(input);\n'])),
    });
    const stack: TechStackInfo = {
      stack: 'nodejs',
      packageManager: 'npm',
      manifestFile: 'package.json',
      dependencies: [],
      projectPath: dir,
    };
    const result = await new SecurityScanner().scan(
      dir,
      new SkillGenerator().generate(stack),
      stack,
    );
    const flagged = result.findings
      .filter((f) => f.patternId === 'eval-user-input')
      .map((f) => path.basename(f.file));
    expect([...new Set(flagged)].sort()).toEqual(files);
  });
});
