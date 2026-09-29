import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type PlannedChange,
  planSageConnect,
  planSageDisconnect,
  resolveSageLaunch,
  SAGE_CONNECT_TARGETS,
  type SageConnectGuide,
  type SageConnectTarget,
  setTomlMcpServer,
} from '../src/sage-connect.js';

const ROOT = path.resolve('/repo');
const guide: SageConnectGuide = {
  serverName: 'wrongstack-sage',
  skillName: 'wrongstack-sage-memory',
  skillDescription: 'Use SAGE: "recall" first.',
  skillBody: '# WrongStack SAGE memory\n\nRecall before editing.\n',
};
const launch = { command: 'wstack', args: ['sage', 'mcp', '--origin', 'x'] };

/** In-memory project: plan, apply, re-read. */
function project(initial: Record<string, string> = {}) {
  const files = new Map<string, string>(
    Object.entries(initial).map(([rel, content]) => [path.join(ROOT, rel), content]),
  );
  const read = (abs: string) => files.get(abs);
  const apply = (changes: PlannedChange[]) => {
    for (const c of changes) {
      if (c.action === 'delete') files.delete(c.path);
      else if (c.action === 'create' || c.action === 'update') files.set(c.path, c.content!);
    }
  };
  const get = (rel: string) => files.get(path.join(ROOT, rel));
  return { files, read, apply, get };
}

function connect(p: ReturnType<typeof project>, target: SageConnectTarget) {
  const plan = planSageConnect(target, { projectRoot: ROOT, launch, guide, read: p.read });
  p.apply(plan.changes);
  return plan;
}

describe('resolveSageLaunch', () => {
  it('uses bare wstack when it is a real executable', () => {
    const { launch: l, warning } = resolveSageLaunch('codex', {
      platform: 'linux',
      findOnPath: () => '/usr/local/bin/wstack',
    });
    expect(l).toEqual({ command: 'wstack', args: ['sage', 'mcp', '--origin', 'codex'] });
    expect(warning).toBeUndefined();
  });

  it('routes a Windows .cmd shim through cmd /c', () => {
    const { launch: l } = resolveSageLaunch('cursor', {
      platform: 'win32',
      findOnPath: () => 'C:\\npm\\wstack.cmd',
    });
    expect(l).toEqual({
      command: 'cmd',
      args: ['/c', 'wstack', 'sage', 'mcp', '--origin', 'cursor'],
    });
  });

  it('warns when the command is not on PATH', () => {
    const { warning } = resolveSageLaunch('antigravity', { findOnPath: () => null });
    expect(warning).toContain('not on PATH');
  });
});

describe('planSageConnect', () => {
  it('claude-code: .mcp.json entry + skill, keeping other servers', () => {
    const p = project({ '.mcp.json': JSON.stringify({ mcpServers: { other: { command: 'x' } } }) });
    const plan = connect(p, 'claude-code');

    expect(plan.changes.map((c) => c.action)).toEqual(['update', 'create']);
    expect(JSON.parse(p.get('.mcp.json')!)).toEqual({
      mcpServers: {
        other: { command: 'x' },
        'wrongstack-sage': { type: 'stdio', command: 'wstack', args: launch.args },
      },
    });
    const skill = p.get(path.join('.claude', 'skills', 'wrongstack-sage-memory', 'SKILL.md'))!;
    expect(skill).toMatch(
      /^---\nname: wrongstack-sage-memory\ndescription: "Use SAGE: \\"recall\\" first."\n---\n/,
    );
    expect(skill).toContain('Recall before editing.');
  });

  it('codex: owned TOML table next to existing config + .agents skill', () => {
    const p = project({
      '.codex/config.toml': 'model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "o"\n',
    });
    const plan = connect(p, 'codex');

    expect(p.get(path.join('.codex', 'config.toml'))).toBe(
      'model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "o"\n\n' +
        '[mcp_servers.wrongstack-sage]\ncommand = "wstack"\nargs = ["sage", "mcp", "--origin", "x"]\n',
    );
    expect(
      p.get(path.join('.agents', 'skills', 'wrongstack-sage-memory', 'SKILL.md')),
    ).toBeDefined();
    expect(plan.notes.join(' ')).toContain('trusted');
  });

  it('cursor: .cursor/mcp.json without a type key + an .mdc rule', () => {
    const p = project();
    connect(p, 'cursor');
    expect(
      JSON.parse(p.get(path.join('.cursor', 'mcp.json'))!).mcpServers['wrongstack-sage'],
    ).toEqual({
      command: 'wstack',
      args: launch.args,
    });
    expect(p.get(path.join('.cursor', 'rules', 'wrongstack-sage-memory.mdc'))).toContain(
      'alwaysApply: false',
    );
  });

  it('antigravity: .agents/mcp_config.json + the .agents skill shared with Codex', () => {
    const p = project();
    const plan = connect(p, 'antigravity');
    expect(JSON.parse(p.get(path.join('.agents', 'mcp_config.json'))!)).toEqual({
      mcpServers: { 'wrongstack-sage': { command: 'wstack', args: launch.args } },
    });
    expect(p.get(path.join('.agents', 'skills', 'wrongstack-sage-memory', 'SKILL.md'))).toContain(
      'name: wrongstack-sage-memory',
    );
    expect(plan.notes.join(' ')).toContain('~/.gemini/config/mcp_config.json');
  });

  it('is idempotent for every target', () => {
    for (const target of SAGE_CONNECT_TARGETS) {
      const p = project();
      connect(p, target);
      const again = connect(p, target);
      expect(again.changes.map((c) => c.action)).toEqual(['unchanged', 'unchanged']);
    }
  });

  it('refuses to rewrite a JSON file it cannot parse', () => {
    const p = project({ '.mcp.json': '{ broken' });
    expect(() => connect(p, 'claude-code')).toThrow('not valid JSON');
    expect(p.get('.mcp.json')).toBe('{ broken');
  });
});

describe('planSageDisconnect', () => {
  it('round-trips every target back to the original files', () => {
    const initial = {
      '.mcp.json': `${JSON.stringify({ mcpServers: { other: { command: 'x' } } }, null, 2)}\n`,
      '.codex/config.toml': 'model = "gpt-5"\n',
      '.agents/mcp_config.json': `${JSON.stringify({ mcpServers: { other: { command: 'y' } } }, null, 2)}\n`,
    };
    for (const target of SAGE_CONNECT_TARGETS) {
      const p = project(initial);
      const before = new Map(p.files);
      connect(p, target);
      p.apply(planSageDisconnect(target, { projectRoot: ROOT, guide, read: p.read }).changes);
      expect(new Map(p.files)).toEqual(before);
    }
  });

  it('leaves a hand-edited skill file in place', () => {
    const p = project();
    connect(p, 'claude-code');
    const skillRel = path.join('.claude', 'skills', 'wrongstack-sage-memory', 'SKILL.md');
    p.files.set(path.join(ROOT, skillRel), '---\nname: mine\n---\nMy own notes.\n');

    const plan = planSageDisconnect('claude-code', { projectRoot: ROOT, guide, read: p.read });
    p.apply(plan.changes);
    expect(p.get(skillRel)).toBe('---\nname: mine\n---\nMy own notes.\n');
    expect(p.get('.mcp.json')).toBeUndefined();
  });

  it('reports nothing to do when never connected', () => {
    const p = project();
    const plan = planSageDisconnect('antigravity', { projectRoot: ROOT, guide, read: p.read });
    expect(plan.changes).toEqual([]);
  });

  it('keeps the shared .agents skill while the other of Codex/Antigravity is connected', () => {
    const skillRel = path.join('.agents', 'skills', 'wrongstack-sage-memory', 'SKILL.md');
    const p = project();
    connect(p, 'codex');
    connect(p, 'antigravity');

    const first = planSageDisconnect('codex', { projectRoot: ROOT, guide, read: p.read });
    p.apply(first.changes);
    expect(first.changes.find((c) => c.path.endsWith('SKILL.md'))?.summary).toContain(
      'still used by antigravity',
    );
    expect(p.get(skillRel)).toBeDefined();

    p.apply(planSageDisconnect('antigravity', { projectRoot: ROOT, guide, read: p.read }).changes);
    expect(p.get(skillRel)).toBeUndefined();
  });
});

describe('TOML edits', () => {
  it('replaces an existing owned table, including its sub-tables and quoted form', () => {
    const before =
      '[mcp_servers."wrongstack-sage"]\ncommand = "old"\n\n[mcp_servers.wrongstack-sage.env]\nA = "1"\n\n[other]\nk = 1\n';
    expect(setTomlMcpServer(before, 'wrongstack-sage', launch)).toBe(
      '[other]\nk = 1\n\n[mcp_servers.wrongstack-sage]\ncommand = "wstack"\nargs = ["sage", "mcp", "--origin", "x"]\n',
    );
  });
});
