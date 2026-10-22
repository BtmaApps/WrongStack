import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// While `/project add` creates the new project's data directory, another
// session registers its own project. The add must not save a manifest it
// loaded before that registration.
const g = vi.hoisted(() => ({
  duringMkdir: undefined as undefined | (() => Promise<unknown>),
  marker: '',
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  const mkdir = (async (...args: Parameters<typeof real.mkdir>) => {
    const step = g.duringMkdir;
    if (step && g.marker && String(args[0]).includes(g.marker)) {
      g.duringMkdir = undefined;
      await step();
    }
    return real.mkdir(...args);
  }) as typeof real.mkdir;
  return { ...real, mkdir, default: { ...real, mkdir } };
});

const { buildProjectCommand } = await import('../src/slash-commands/project.js');
const { generateSlug, touchProjectInManifest } = await import(
  '../src/services/project-manifest.js'
);

describe('/project add with a concurrent registration', () => {
  it('keeps the project another session registered meanwhile', async () => {
    const globalRoot = join(mkdtempSync(join(tmpdir(), 'wstack-project-add-')), '.wrongstack');
    const globalConfig = join(globalRoot, 'config.json');
    const seed = mkdtempSync(join(tmpdir(), 'wstack-project-seed-'));
    const added = mkdtempSync(join(tmpdir(), 'wstack-project-added-'));
    const other = mkdtempSync(join(tmpdir(), 'wstack-project-other-'));
    await touchProjectInManifest({ projectRoot: seed, globalConfigPath: globalConfig });

    g.marker = generateSlug(added);
    g.duringMkdir = () =>
      touchProjectInManifest({ projectRoot: other, globalConfigPath: globalConfig });
    await buildProjectCommand({ paths: { globalConfig } } as never).run(`add ${added}`, {
      projectRoot: seed,
      cwd: seed,
    } as never);

    const roots = (
      JSON.parse(readFileSync(join(globalRoot, 'projects.json'), 'utf8')) as {
        projects: Array<{ root: string }>;
      }
    ).projects.map((p) => p.root);
    expect(roots).toEqual(expect.arrayContaining([seed, added, other]));
  });
});
