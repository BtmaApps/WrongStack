import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { collectSkillFiles, replaceSkillDirectory } from '../../src/skills/skill-files.js';

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-package-'));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

it('leaves the working package intact when copying the replacement fails', async () => {
  const source = path.join(root, 'source');
  const target = path.join(root, 'target');
  await fs.mkdir(source);
  await fs.mkdir(target);
  await fs.writeFile(path.join(source, 'SKILL.md'), 'replacement');
  await fs.writeFile(path.join(target, 'SKILL.md'), 'working');
  await expect(
    replaceSkillDirectory(source, target, ['SKILL.md', 'missing.txt']),
  ).rejects.toThrow();
  expect(await fs.readFile(path.join(target, 'SKILL.md'), 'utf8')).toBe('working');
  expect((await fs.readdir(root)).filter((name) => name.startsWith('.skill-stage'))).toEqual([]);
});

it('links whole packages so resource containment still resolves to the source root', async () => {
  const source = path.join(root, 'source');
  const target = path.join(root, 'target');
  await fs.mkdir(path.join(source, 'scripts'), { recursive: true });
  await fs.writeFile(path.join(source, 'SKILL.md'), 'instructions');
  await fs.writeFile(path.join(source, 'scripts/check.py'), 'print(1)');
  await fs.writeFile(path.join(source, 'scripts/.schema.json'), '{}');
  await replaceSkillDirectory(source, target, await collectSkillFiles(source), true);
  expect((await collectSkillFiles(target)).map((file) => file.split(path.sep).join('/'))).toContain(
    'scripts/check.py',
  );
  expect(await fs.readFile(path.join(target, 'scripts/check.py'), 'utf8')).toBe('print(1)');
  expect(await fs.readFile(path.join(target, 'scripts/.schema.json'), 'utf8')).toBe('{}');
});
