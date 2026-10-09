import * as realFs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Two processes (the CLI-embedded WebUI routes and the standalone webui-server)
 * install skills into one installed-skills.json. Two store instances stand in
 * for them. The first manifest read waits one macrotask turn while the other
 * install is in flight, so an unguarded read-modify-write reads the same list
 * twice and the later write drops an entry.
 */
const gate = vi.hoisted(() => ({ target: '', reads: 0, inFlight: 0 }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: async (...args: unknown[]) => {
      if (gate.target && path.resolve(String(args[0])) === gate.target) {
        gate.reads++;
        if (gate.reads === 1 && gate.inFlight > 1) {
          await new Promise((resolve) => setImmediate(resolve));
        }
      }
      return (actual.readFile as (...a: unknown[]) => Promise<unknown>)(...args);
    },
  };
});

const { SkillManifestStore } = await import('../../src/skills/manifest-store.js');

let tmp = '';
afterEach(async () => {
  gate.target = '';
  if (tmp) await realFs.rm(tmp, { recursive: true, force: true });
});

const entry = (name: string) => ({
  name,
  source: `github:acme/${name}`,
  ref: 'main',
  scope: 'user' as const,
  installedAt: '2026-10-09T00:00:00.000Z',
  files: [`skills/${name}/SKILL.md`],
});

describe('SkillManifestStore — two processes', () => {
  it('records both of two overlapping installs', async () => {
    tmp = await realFs.mkdtemp(path.join(os.tmpdir(), 'manifest-race-'));
    const file = path.join(tmp, 'installed-skills.json');
    await realFs.writeFile(file, JSON.stringify({ skills: [entry('alpha')] }));
    gate.target = path.resolve(file);
    gate.reads = 0;
    gate.inFlight = 2;

    await Promise.all([
      new SkillManifestStore(file).addEntry(entry('beta')),
      new SkillManifestStore(file).addEntry(entry('gamma')),
    ]);

    const names = JSON.parse(await realFs.readFile(file, 'utf8'))
      .skills.map((s: { name: string }) => s.name)
      .sort();
    expect(names).toEqual(['alpha', 'beta', 'gamma']);
  });
});
