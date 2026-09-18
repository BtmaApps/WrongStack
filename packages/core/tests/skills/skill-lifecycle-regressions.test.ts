import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildProgressiveSkillManifestText } from '../../src/core/system-prompt-skill-bodies.js';
import { DefaultSkillLoader } from '../../src/execution/skill-loader.js';
import { buildSkillCommand, buildSkillGeneratorCommand } from '../../src/plugins/skills-plugin.js';
import { parseSkillFrontmatter, validateSkillDocument } from '../../src/skills/frontmatter.js';
import { createSkillsShAdapter } from '../../src/skills/registry/skills-sh-adapter.js';
import { generateSkillSkeleton } from '../../src/skills/skill-generator.js';
import { resolveWstackPaths } from '../../src/utils/wstack-paths.js';

let root: string;
let loader: DefaultSkillLoader;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-lifecycle-'));
  loader = new DefaultSkillLoader({
    paths: resolveWstackPaths({ projectRoot: root, userHome: path.join(root, 'home') }),
    readClaudeSkills: false,
    foreignSources: false,
  });
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('skill lifecycle audit regressions', () => {
  it('offers explicit use and reload without confusing a preview with activation', async () => {
    await buildSkillGeneratorCommand(loader).run('skeleton explicit --desc test', {
      projectRoot: root,
    } as never);
    const command = buildSkillCommand(loader);
    const result = await command.run('use explicit Review invoices', {} as never);
    expect(result?.runText).toContain('Load the explicit skill');
    expect(result?.runText).toContain('Review invoices');
    expect((await command.run('explicit', {} as never))?.runText).toBeUndefined();
    expect((await command.run('reload', {} as never))?.message).toContain('Reloaded 1 skills');
  });
  it('validates every bundled skill against the authoring contract', async () => {
    const bundled = path.resolve('packages/core/skills');
    const failures: string[] = [];
    for (const entry of await fs.readdir(bundled, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const raw = await fs.readFile(path.join(bundled, entry.name, 'SKILL.md'), 'utf8');
      failures.push(
        ...validateSkillDocument(raw, entry.name).map((error) => `${entry.name}: ${error}`),
      );
    }
    expect(failures).toEqual([]);
  });

  it('rejects malformed YAML, wrong field types, missing descriptions and mismatched names', () => {
    for (const frontmatter of [
      'name: demo\ndescription: [wrong]',
      'name: demo\nname: other\ndescription: d',
      'name: demo',
      'name: other\ndescription: d',
      `name: demo\ndescription: ${'a'.repeat(1025)}`,
      'name: demo\ndescription: d\nmetadata: [wrong]',
    ]) {
      expect(
        validateSkillDocument(`---\n${frontmatter}\n---\nBody`, 'demo').length,
      ).toBeGreaterThan(0);
    }
  });
  it('creates, discovers, validates and overwrites a skill in the same session', async () => {
    const command = buildSkillGeneratorCommand(loader);
    const ctx = { projectRoot: root } as never;
    await loader.list();
    await command.run('skeleton lifecycle --desc initial', ctx);
    expect(await loader.find('lifecycle')).toBeDefined();
    expect((await command.run('validate lifecycle', ctx))?.message).not.toContain('Collisions');
    await command.run('skeleton lifecycle --desc updated --force', ctx);
    expect(await loader.readBody('lifecycle')).toContain('updated');
  });

  it('preserves paragraphs when creating a draft from a prompt', async () => {
    await buildSkillGeneratorCommand(loader).run(
      'from-prompt # Invoice Review\n\nInspect invoices.\n\nKeep this paragraph.',
      { projectRoot: root } as never,
    );
    loader.invalidateCache();
    expect(await loader.readBody('invoice-review')).toContain(
      'Inspect invoices.\n\nKeep this paragraph.',
    );
  });

  it('preserves a quoted CLI description instead of saving only its first word', async () => {
    await buildSkillGeneratorCommand(loader).run(
      'skeleton quoted --desc "Use when reviewing invoices."',
      { projectRoot: root } as never,
    );
    expect((await loader.find('quoted'))?.description).toBe('Use when reviewing invoices.');
  });

  it('preserves multiline descriptions in generated YAML', () => {
    const raw = generateSkillSkeleton({
      name: 'multiline',
      description: 'First line\nSecond line',
    });
    expect(parseSkillFrontmatter(raw).description).toBe('First line\nSecond line');
  });

  it('parses standard YAML comments, chomping, quotes and flow metadata', () => {
    const fm = parseSkillFrontmatter(
      '---\nname: example # comment\ndescription: >-\n  First line\n  Second line\nmetadata: {author: "A", version: "1.0"}\nlicense: "a\\nb"\n---\nBody',
    );
    expect(fm.name).toBe('example');
    expect(fm.description).toBe('First line Second line');
    expect(fm.metadata).toEqual({ author: 'A', version: '1.0' });
    expect(fm.license).toBe('a\nb');
  });

  it('discloses the entire description including a later activation sentence', async () => {
    const dir = path.join(root, '.wrongstack/skills/invoices');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'SKILL.md'),
      '---\nname: invoices\ndescription: Extract PDFs. Use when asked about invoices.\n---\nBody',
    );
    expect(await buildProgressiveSkillManifestText(loader)).toContain(
      'Use when asked about invoices.',
    );
  });

  it('understands the live skills.sh search contract', async () => {
    let url = '';
    const adapter = createSkillsShAdapter({
      fetcher: async (value) => {
        url = value;
        return {
          query: 'react',
          skills: [
            {
              id: 'vercel-labs/agent-skills/vercel-react-best-practices',
              skillId: 'vercel-react-best-practices',
              name: 'vercel-react-best-practices',
              installs: 724480,
              source: 'vercel-labs/agent-skills',
            },
          ],
          count: 1,
        };
      },
    });
    const result = await adapter.search('react');
    expect(new URL(url).pathname).toBe('/api/search');
    expect(new URL(url).searchParams.get('q')).toBe('react');
    expect(result.results[0]?.installRef).toContain('vercel-labs/agent-skills');
    expect(result.results[0]?.name).toBe('vercel-react-best-practices');
  });
});
