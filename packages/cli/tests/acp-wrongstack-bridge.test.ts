import type { SubagentRunContext, TaskSpec } from '@wrongstack/core/types';
import { describe, expect, it } from 'vitest';
import {
  bridgeNote,
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
    expect(servers.map((s) => s.name)).toEqual([
      'wrongstack-sage',
      'wrongstack-mailbox',
      'wrongstack-kanban',
    ]);
    for (const s of servers) {
      expect(wstackArgs(s).slice(0, 2)).toEqual(['mcp', 'serve']);
      expect(wstackArgs(s)).toContain(`--project-root=${ROOT}`);
      expect(s.env).toEqual([]);
    }
    const mailbox = wstackArgs(servers[1]!);
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
    expect(wstackArgs(servers[0]!)).toContain('--origin=claude-code');
    expect(wstackArgs(servers[2]!).at(-1)).toBe('--writable');
  });

  it('appends a note naming only the attached servers, keeping the agent identity', () => {
    const setup = wrongstackBridgeSetup('claude-code', ROOT, { servers: ['mailbox'] })!(task, ctx);
    const append = (setup.meta as { systemPrompt: { append: string } }).systemPrompt.append;
    expect(append).toContain('task t-42');
    expect(append).toContain('wrongstack-mailbox');
    expect(append).toContain('"@session"');
    expect(append).not.toContain('wrongstack-sage');
    expect(append).not.toMatch(/You are (Claude Code|WrongStack)\b/);
    // The preset is kept: only `append` is sent, never a replacement prompt.
    expect(Object.keys(setup.meta as object)).toEqual(['systemPrompt']);
    expect(Object.keys((setup.meta as { systemPrompt: object }).systemPrompt)).toEqual(['append']);
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
    const mailbox = (setup.mcpServers as { name: string; args: string[] }[])[1]!;
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
    expect(bridgeNote(['codebase-index'], 'w', 't')).toContain('wrongstack-index');
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
