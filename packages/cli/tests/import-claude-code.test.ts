import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type ClaudeCodeSources,
  planClaudeCodeImport,
  readClaudeCodeSources,
} from '../src/subcommands/handlers/import-claude-code.js';

const empty: ClaudeCodeSources = { settings: [], instructionFiles: [], skillDirs: [] };

describe('planClaudeCodeImport', () => {
  const projectRoot = path.resolve('/work/app');

  it('takes user, per-project and repository servers, most specific first', () => {
    const plan = planClaudeCodeImport({
      sources: {
        ...empty,
        userState: {
          mcpServers: { shared: { command: 'user-shared' }, mine: { command: 'm' } },
          projects: { [projectRoot]: { mcpServers: { shared: { command: 'project-local' } } } },
        },
        projectMcp: { mcpServers: { repo: { type: 'http', url: 'https://x/mcp' } } },
      },
      projectRoot,
      existingServers: {},
      overwrite: false,
      enableProjectServers: false,
    });
    const byName = Object.fromEntries(plan.mcp.map((c) => [c.name, c]));
    expect(byName['shared']).toMatchObject({
      source: 'claude-project-local',
      config: { command: 'project-local', transport: 'stdio' },
      enabled: true,
    });
    expect(byName['mine']).toMatchObject({ source: 'claude-user', action: 'add', enabled: true });
    expect(byName['repo']).toMatchObject({
      source: 'repository',
      config: { transport: 'streamable-http' },
      enabled: false,
    });
    expect(byName['repo']?.note).toMatch(/imported disabled/);
  });

  it('enables repository servers only when asked', () => {
    const plan = planClaudeCodeImport({
      sources: { ...empty, projectMcp: { mcpServers: { repo: { command: 'x' } } } },
      projectRoot,
      existingServers: {},
      overwrite: false,
      enableProjectServers: true,
    });
    expect(plan.mcp[0]).toMatchObject({ enabled: true });
    expect(plan.mcp[0]?.note).toBeUndefined();
  });

  it('skips existing names unless overwriting, and reports invalid entries', () => {
    const sources = {
      ...empty,
      userState: { mcpServers: { a: { command: 'x' }, bad: { type: 'ws' } } },
    };
    const skip = planClaudeCodeImport({
      sources,
      projectRoot,
      existingServers: { a: {} },
      overwrite: false,
      enableProjectServers: false,
    });
    expect(skip.mcp.map((c) => [c.name, c.action])).toEqual([
      ['a', 'skip-exists'],
      ['bad', 'skip-invalid'],
    ]);
    const over = planClaudeCodeImport({
      sources,
      projectRoot,
      existingServers: { a: {} },
      overwrite: true,
      enableProjectServers: false,
    });
    expect(over.mcp[0]).toMatchObject({ name: 'a', action: 'overwrite' });
  });

  it('reports what it does not translate', () => {
    const plan = planClaudeCodeImport({
      sources: {
        settings: [
          {
            file: 's.json',
            content: {
              hooks: { PreToolUse: [{}, {}] },
              permissions: { allow: ['Bash(git *)'], deny: ['Read(.env)'] },
            },
          },
        ],
        instructionFiles: ['/work/app/CLAUDE.md'],
        skillDirs: ['/work/app/.claude/skills'],
      },
      projectRoot,
      existingServers: {},
      overwrite: false,
      enableProjectServers: false,
    });
    expect(plan.mcp).toEqual([]);
    expect(plan.notes.join('\n')).toMatch(/Skills: .*already loaded in place/);
    expect(plan.notes.join('\n')).toMatch(/Hooks: 2 found — not imported/);
    expect(plan.notes.join('\n')).toMatch(/Permission rules: 2 found — not imported/);
    expect(plan.notes.join('\n')).toMatch(/CLAUDE\.md — not imported/);
  });
});

describe('readClaudeCodeSources', () => {
  let home: string;
  let project: string;
  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-home-'));
    project = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-proj-'));
  });
  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
    await fs.rm(project, { recursive: true, force: true });
  });

  it('reads the files that exist and ignores the rest', async () => {
    await fs.writeFile(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: {} }));
    await fs.writeFile(path.join(project, 'CLAUDE.md'), '# rules');
    await fs.mkdir(path.join(project, '.claude', 'skills'), { recursive: true });
    const sources = await readClaudeCodeSources(project, home);
    expect(sources.userState).toEqual({ mcpServers: {} });
    expect(sources.projectMcp).toBeUndefined();
    expect(sources.instructionFiles).toEqual([path.join(project, 'CLAUDE.md')]);
    expect(sources.skillDirs).toEqual([path.join(project, '.claude', 'skills')]);
  });

  it('fails loudly on a corrupt file instead of importing nothing', async () => {
    await fs.writeFile(path.join(project, '.mcp.json'), '{nope');
    await expect(readClaudeCodeSources(project, home)).rejects.toThrow(/not valid JSON/);
  });
});
