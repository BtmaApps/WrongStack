import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { DefaultSkillLoader } from '../../core/src/execution/skill-loader.js';
import { SkillInstaller } from '../../core/src/skills/skill-installer.js';
import { resolveWstackPaths } from '../../core/src/utils/wstack-paths.js';
import { makeSkillTool } from '../../tools/src/skill.js';
import {
  handleSkillsCreate,
  handleSkillsEdit,
  handleSkillsExport,
} from '../src/server/skills-handlers.js';
import { readZipEntries } from '../src/server/zip.js';

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-roundtrip-'));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

function setup() {
  const paths = resolveWstackPaths({ projectRoot: root, userHome: path.join(root, 'home') });
  const loader = new DefaultSkillLoader({ paths, readClaudeSkills: false, foreignSources: false });
  const messages: Array<{
    payload: { success?: boolean; error?: string; zipBase64: string; skillCount: number };
  }> = [];
  const ws = { readyState: 1, send: (data: string) => messages.push(JSON.parse(data)) } as never;
  const ctx = { skillLoader: loader, skillInstaller: undefined, projectRoot: root };
  return { paths, loader, messages, ws, ctx };
}

it('exports and imports complete packages, preserving binary assets and executable instructions', async () => {
  const { paths, loader, messages, ws, ctx } = setup();
  const dir = path.join(paths.inProjectSkills, 'portable');
  await fs.mkdir(path.join(dir, 'scripts'), { recursive: true });
  await fs.mkdir(path.join(dir, 'assets'), { recursive: true });
  await fs.writeFile(
    path.join(dir, 'SKILL.md'),
    '---\nname: portable\ndescription: Run a script.\n---\nRun scripts/check.py',
  );
  await fs.writeFile(path.join(dir, 'scripts/check.py'), 'print("portable")');
  const binary = Buffer.from([0, 1, 255, 128]);
  await fs.writeFile(path.join(dir, 'assets/template.bin'), binary);
  await handleSkillsExport(ws, ctx);
  const payload = messages[0]!.payload;
  expect(payload.skillCount).toBe(1);
  const files = readZipEntries(Buffer.from(payload.zipBase64, 'base64'));
  expect(files.get('portable/assets/template.bin')).toEqual(binary);
  const extracted = path.join(root, 'extracted');
  for (const [name, bytes] of files) {
    const destination = path.join(extracted, name);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes);
  }
  const installer = new SkillInstaller({
    manifestPath: path.join(root, 'manifest.json'),
    projectSkillsDir: paths.inProjectSkills,
    globalSkillsDir: paths.globalSkills,
    projectHash: paths.projectHash,
    skillLoader: loader,
  });
  await loader.list();
  await installer.importFromDir(extracted);
  const result = await makeSkillTool(loader).execute(
    { name: 'portable', resource: 'scripts/check.py' },
    {} as never,
    { signal: new AbortController().signal },
  );
  expect(result.loadedResource?.content).toBe('print("portable")');
});

it('rejects invalid edits without losing the existing skill and rejects oversized create names', async () => {
  const { loader, messages, ws, ctx } = setup();
  await handleSkillsCreate(ws, ctx, {
    payload: { name: 'valid', description: 'Valid description', scope: 'project' },
  });
  expect(messages.at(-1)?.payload.success).toBe(true);
  const original = await loader.readBody('valid');
  await handleSkillsEdit(ws, ctx, { payload: { name: 'valid', body: '# No frontmatter' } });
  expect(messages.at(-1)?.payload.success).toBe(false);
  expect(await loader.readBody('valid')).toBe(original);
  await handleSkillsCreate(ws, ctx, {
    payload: { name: 'a'.repeat(65), description: 'Description', scope: 'project' },
  });
  expect(messages.at(-1)?.payload.success).toBe(false);
});

it('loads every character of long skill instructions through explicit continuation', async () => {
  const { paths, loader } = setup();
  const dir = path.join(paths.inProjectSkills, 'long');
  await fs.mkdir(dir, { recursive: true });
  const body = 'a'.repeat(16000) + '\nCritical final instruction.';
  await fs.writeFile(
    path.join(dir, 'SKILL.md'),
    `---\nname: long\ndescription: Long instructions\n---\n${body}`,
  );
  const tool = makeSkillTool(loader);
  const options = { signal: new AbortController().signal };
  const first = await tool.execute({ name: 'long' }, {} as never, options);
  expect(tool.serialize?.(first, {} as never)).toContain('offset: 16000');
  const last = await tool.execute({ name: 'long', offset: first.nextOffset }, {} as never, options);
  expect(first.body + last.body).toBe(body);
  expect(last.nextOffset).toBeUndefined();
});
