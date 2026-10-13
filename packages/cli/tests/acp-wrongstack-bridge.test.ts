import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SubagentRunContext, TaskSpec } from '@wrongstack/core/types';
import { describe, expect, it } from 'vitest';
import {
  bridgeNote,
  installedBridgeAgents,
  onPath,
  wrongstackBridgeSetup,
  wstackLaunch,
} from '../src/fleet/acp-wrongstack-bridge.js';

const ROOT = '/work/project';
const task: TaskSpec = { id: 't-42', description: 'fix the flaky test' };
const ctx = {
  subagentId: 'claude-code',
  config: { id: 'claude-code', name: 'Claude worker', role: 'reviewer' },
  sessionId: 'sess-1',
} as unknown as SubagentRunContext;

/** The `wstack` argv after the launcher prefix (binary path / CLI entry). */
function wstackArgs(server: { args: string[] }): string[] {
  const at = server.args.indexOf('mcp');
  return server.args.slice(at);
}

describe('wrongstackBridgeSetup', () => {
  it('applies to claude-code by default, by catalog or registry id, and to nothing else', () => {
    expect(wrongstackBridgeSetup('claude-code', ROOT, undefined)).toBeTypeOf('function');
    expect(wrongstackBridgeSetup('claude-acp', ROOT, undefined)).toBeTypeOf('function');
    expect(wrongstackBridgeSetup('codex-cli', ROOT, undefined)).toBeUndefined();
  });

  it('is turned off by an empty agent or server list', () => {
    expect(wrongstackBridgeSetup('claude-code', ROOT, { agents: [] })).toBeUndefined();
    expect(wrongstackBridgeSetup('claude-code', ROOT, { servers: [] })).toBeUndefined();
    expect(wrongstackBridgeSetup('codex-cli', ROOT, { agents: ['codex-cli'] })).toBeTypeOf(
      'function',
    );
  });

  it('launches each default server through `wstack mcp serve` bound to the project', () => {
    const setup = wrongstackBridgeSetup('claude-code', ROOT, undefined)!(task, ctx);
    const servers = setup.mcpServers as { name: string; args: string[]; env: unknown[] }[];
    const byName = (name: string) => servers.find((s) => s.name === name)!;
    expect(servers.map((s) => s.name)).toEqual([
      'wrongstack-index',
      'wrongstack-sage',
      'wrongstack-mailbox',
      'wrongstack-kanban',
    ]);
    for (const s of servers) {
      expect(wstackArgs(s).slice(0, 2)).toEqual(['mcp', 'serve']);
      expect(wstackArgs(s)).toContain(`--project-root=${ROOT}`);
      expect(s.env).toEqual([]);
    }
    const mailbox = wstackArgs(byName('wrongstack-mailbox'));
    expect(mailbox).toEqual([
      'mcp',
      'serve',
      'mailbox',
      `--project-root=${ROOT}`,
      '--actor=claude-code',
      '--name=Claude worker',
      '--role=reviewer',
      '--session-id=sess-1',
      // A switch must come last: the global parser reads a following word as its value.
      '--writable',
    ]);
    expect(wstackArgs(byName('wrongstack-sage'))).toContain('--origin=claude-code');
    expect(wstackArgs(byName('wrongstack-kanban')).at(-1)).toBe('--writable');
    // The index is read-only for workers (no rebuild tool) but kept fresh,
    // since the worker edits files outside WrongStack.
    expect(wstackArgs(byName('wrongstack-index'))).not.toContain('--writable');
    expect(wstackArgs(byName('wrongstack-index')).at(-1)).toBe('--watch');
  });

  it('steers code navigation to the index over grep', () => {
    const note = bridgeNote(['codebase-index']);
    expect(note).toMatch(/Prefer it over grep\/glob/);
    for (const tool of [
      'codebase_search',
      'codebase_incoming_calls',
      'codebase_read_symbol',
      'codebase_skeleton',
      'codebase_impact_analysis',
    ]) {
      expect(note).toContain(tool);
    }
  });

  it('appends the same note for every task and worker, so the prompt cache holds', () => {
    const bridge = wrongstackBridgeSetup('claude-code', ROOT, undefined)!;
    const other = { ...ctx, subagentId: 'w-other' } as unknown as SubagentRunContext;
    const noteFor = (t: TaskSpec, c: SubagentRunContext) =>
      (bridge(t, c).meta as { systemPrompt: { append: string } }).systemPrompt.append;
    const note = noteFor(task, ctx);
    expect(noteFor({ id: 't-99', description: 'other work' }, other)).toBe(note);
    expect(note).not.toContain('t-42');
    expect(note).not.toContain('claude-code');
    // The worker's identity still reaches the mailbox, through its server.
    const mailbox = (bridge(task, other).mcpServers as { name: string; args: string[] }[]).find(
      (s) => s.name === 'wrongstack-mailbox',
    )!;
    expect(mailbox.args).toContain('--actor=w-other');
  });

  it('appends a note naming only the attached servers, keeping the agent identity', () => {
    const setup = wrongstackBridgeSetup('claude-code', ROOT, { servers: ['mailbox'] })!(task, ctx);
    const append = (setup.meta as { systemPrompt: { append: string } }).systemPrompt.append;
    expect(append).toContain('wrongstack-mailbox');
    expect(append).toContain('"@session"');
    expect(append).not.toContain('wrongstack-sage');
    expect(append).not.toMatch(/You are (Claude Code|WrongStack)\b/);
    // The preset is kept: only `append` is sent, never a replacement prompt.
    expect(Object.keys(setup.meta as object)).toEqual(['systemPrompt']);
    expect(Object.keys((setup.meta as { systemPrompt: object }).systemPrompt)).toEqual(['append']);
  });

  it('tells a delegated worker how WrongStack steers it, and only then', () => {
    expect(bridgeNote(['mailbox'])).toContain('"[WrongStack <kind> from <agent>]"');
    expect(bridgeNote(['mailbox'], false)).not.toContain('[WrongStack');
  });

  it('sends mail to "all" when no WrongStack session delegated the task', () => {
    const { sessionId: _drop, ...rest } = ctx as unknown as Record<string, unknown>;
    const setup = wrongstackBridgeSetup('claude-code', ROOT, undefined)!(
      task,
      rest as unknown as SubagentRunContext,
    );
    const append = (setup.meta as { systemPrompt: { append: string } }).systemPrompt.append;
    expect(append).toContain('"all"');
    expect(append).not.toContain('@session');
    const mailbox = (setup.mcpServers as { name: string; args: string[] }[]).find(
      (s) => s.name === 'wrongstack-mailbox',
    )!;
    expect(mailbox.args.some((a) => a.startsWith('--session-id'))).toBe(false);
  });

  it('dedupes servers and ignores unknown names from config', () => {
    const setup = wrongstackBridgeSetup('claude-code', ROOT, {
      servers: ['kanban', 'kanban', 'nope' as never, 'codebase-index'],
    })!(task, ctx);
    expect((setup.mcpServers as { name: string }[]).map((s) => s.name)).toEqual([
      'wrongstack-kanban',
      'wrongstack-index',
    ]);
    expect(bridgeNote(['codebase-index'])).toContain('wrongstack-index');
  });
});

describe('installedBridgeAgents', () => {
  const claudeOnPath = (c: string) => c === 'claude';

  it('lists the default worker when its CLI is on PATH, and nothing otherwise', () => {
    expect(installedBridgeAgents(undefined, claudeOnPath)).toEqual(['claude-code']);
    expect(installedBridgeAgents(undefined, () => false)).toEqual([]);
  });

  it('accepts registry ids, user-configured commands, and honours an off switch', () => {
    expect(installedBridgeAgents({ bridge: { agents: ['claude-acp'] } }, claudeOnPath)).toEqual([
      'claude-code',
    ]);
    expect(
      installedBridgeAgents(
        { agents: { 'codex-cli': { command: 'my-codex' } }, bridge: { agents: ['codex-cli'] } },
        () => false,
      ),
    ).toEqual(['codex-cli']);
    expect(installedBridgeAgents({ bridge: { servers: [] } }, claudeOnPath)).toEqual([]);
    expect(installedBridgeAgents({ bridge: { agents: [] } }, claudeOnPath)).toEqual([]);
  });
});

describe('onPath', () => {
  it('finds a command through PATH and PATHEXT', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ws-onpath-'));
    try {
      writeFileSync(join(dir, 'fakeagent.CMD'), '');
      expect(onPath('fakeagent', { PATH: dir, PATHEXT: '.EXE;.CMD' }, 'win32')).toBe(true);
      expect(onPath('fakeagent', { PATH: dir }, 'linux')).toBe(false);
      expect(onPath('missing', { PATH: dir, PATHEXT: '.CMD' }, 'win32')).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('wstackLaunch', () => {
  it('re-runs the current CLI entry under the same runtime', () => {
    expect(wstackLaunch(['mcp'], '/opt/wrongstack/dist/index.js')).toEqual({
      command: process.execPath,
      args: ['/opt/wrongstack/dist/index.js', 'mcp'],
    });
  });

  it('falls back to wstack on PATH when the entry is not the CLI', () => {
    expect(wstackLaunch(['mcp'], '/usr/lib/vitest/runner.mjs')).toEqual({
      command: 'wstack',
      args: ['mcp'],
    });
  });
});
