// Durable regression: `walk` / `listResources` must not enumerate files whose
// realpath escapes the skill directory. `loadResource` already enforces this
// via WS-048 (realpath containment on the resolved path); the listing path
// must mirror that boundary so the resource listing — which flows through
// `serialize` into the model-facing tool output and the session log — does
// not disclose names or sizes of files under an attacker-chosen external
// directory.
//
// Created in proof-driven-bug-hunter round r29-skill-listing-symlink-disclosure.
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeSkillTool } from '../src/skill.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-listing-symlink-'));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
});

async function linkDir(src: string, dst: string): Promise<'symlink' | 'junction' | undefined> {
  try {
    await fs.symlink(src, dst, 'dir');
    return 'symlink';
  } catch {
    const { execSync } = await import('node:child_process');
    try {
      execSync(`cmd /c mklink /J "${dst}" "${src}"`, { stdio: 'ignore' });
      return 'junction';
    } catch {
      return undefined;
    }
  }
}

async function findListingLeaks(
  resourcePaths: { path: string }[],
  skillDir: string,
  rootReal: string,
): Promise<string[]> {
  const leaks: string[] = [];
  for (const r of resourcePaths) {
    const abs = path.resolve(skillDir, r.path);
    let realAbs: string;
    try {
      realAbs = await fs.realpath(abs);
    } catch {
      continue;
    }
    if (realAbs !== rootReal && !realAbs.startsWith(rootReal + path.sep)) {
      leaks.push(`${r.path} -> ${realAbs}`);
    }
  }
  return leaks;
}

async function buildTool(skillDir: string) {
  return makeSkillTool({
    list: async () => [
      {
        name: 'myskill',
        description: 'd',
        path: path.join(skillDir, 'SKILL.md'),
        source: 'project' as const,
      },
    ],
    listEntries: async () => [],
    find: async (n: string) =>
      n === 'myskill'
        ? {
            name: 'myskill',
            description: 'd',
            path: path.join(skillDir, 'SKILL.md'),
            source: 'project' as const,
          }
        : undefined,
    manifestText: async () => '',
    readBody: async (n: string) =>
      n === 'myskill' ? '---\nname: myskill\ndescription: d\n---\nbody' : '',
    readSaveBody: async () => '',
    invalidateCache: () => undefined,
  } as never);
}

describe('makeSkillTool — resource listing containment', () => {
  it('does not enumerate files whose realpath escapes the skill directory', async () => {
    const skillDir = path.join(tmp, 'myskill');
    await fs.mkdir(skillDir, { recursive: true });

    const secretDir = path.join(tmp, 'SECRETS');
    await fs.mkdir(path.join(secretDir, 'sub'), { recursive: true });
    await fs.writeFile(path.join(secretDir, 'api_key.txt'), 'AKIA-PLACEHOLDER');
    await fs.writeFile(path.join(secretDir, 'sub', 'inner.md'), '# secret inner');

    const linkKind = await linkDir(secretDir, path.join(skillDir, 'escape'));
    if (!linkKind) {
      // No privilege to create a symlink or junction — the listing path is
      // never exercised in this environment, so there is nothing to prove.
      return;
    }

    const tool = await buildTool(skillDir);
    const out = await tool.execute({ name: 'myskill' }, {} as never, {
      signal: new AbortController().signal,
    });

    const rootReal = await fs.realpath(skillDir);
    const leaks = await findListingLeaks(out.resources, skillDir, rootReal);
    expect(leaks, `listing leaked external paths: ${leaks.join(', ')}`).toEqual([]);
  });

  it('still enumerates files inside the skill directory (control)', async () => {
    const skillDir = path.join(tmp, 'myskill');
    await fs.mkdir(path.join(skillDir, 'scripts'), { recursive: true });
    await fs.mkdir(path.join(skillDir, 'references'), { recursive: true });
    await fs.writeFile(path.join(skillDir, 'scripts', 'extract.py'), 'print(1)');
    await fs.writeFile(path.join(skillDir, 'references', 'REF.md'), '# ref');

    const tool = await buildTool(skillDir);
    const out = await tool.execute({ name: 'myskill' }, {} as never, {
      signal: new AbortController().signal,
    });

    const paths = out.resources.map((r) => r.path).sort();
    expect(paths).toEqual(['references/REF.md', 'scripts/extract.py']);
  });
});
