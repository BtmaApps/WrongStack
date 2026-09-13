import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAgentsCommand } from '../../src/slash-commands/agents.js';

/**
 * `/agents` as registered by the slash-command index (agents.ts). The older
 * spawn-agents.ts variant has its own test; this one had none.
 */

interface SessionStub {
  subagentId: string;
  agentName: string;
  status: string;
  task?: string;
}

function monitorStub(sessions: SessionStub[] = [], transcript: unknown[] = []) {
  let streamEnabled = false;
  return {
    get streamEnabled() {
      return streamEnabled;
    },
    setStreamEnabled: vi.fn((on: boolean) => {
      streamEnabled = on;
    }),
    getAllSessions: vi.fn(() => sessions),
    getTranscript: vi.fn(() => transcript),
  };
}

async function run(opts: Record<string, unknown>, args: string): Promise<string> {
  const res = (await buildAgentsCommand(opts as never).run(args, {} as never)) as {
    message: string;
  };
  return res.message;
}

describe('/agents', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-agents-cmd-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('advertises only the chat verbosities the command accepts', () => {
    const { description } = buildAgentsCommand({} as never);
    expect(description).toContain('chat off|full|status');
    expect(description).not.toContain('compact');
  });

  describe('panel shortcut', () => {
    it('opens the TUI monitor for bare and list invocations when the panel accepts', async () => {
      const current = vi.fn(() => true);
      expect(await run({ onPanelOpen: { current } }, '')).toBe('');
      expect(await run({ onPanelOpen: { current } }, '  list  ')).toBe('');
      expect(current).toHaveBeenCalledWith('toggleAgentsMonitor');
    });

    it('falls through to text output when the panel declines', async () => {
      const current = vi.fn(() => false);
      expect(await run({ onPanelOpen: { current } }, 'list')).toBe('No agent monitor active.');
    });

    it('does not open the panel for other subcommands', async () => {
      const current = vi.fn(() => true);
      await run({ onPanelOpen: { current } }, 'help');
      expect(current).not.toHaveBeenCalled();
    });
  });

  it('uses the legacy onAgents callback for bare and legacy invocations', async () => {
    expect(await run({ onAgents: () => 'legacy view' }, '')).toBe('legacy view');
    expect(await run({ onAgents: () => 'legacy view' }, 'LEGACY')).toBe('legacy view');
    expect(await run({}, '')).toBe('Use `/agents list` or `/agents help`.');
  });

  it('prints help', async () => {
    expect(await run({}, 'help')).toContain('Subagent Monitoring');
  });

  it('reports stream state from status, preferring the monitor', async () => {
    const monitor = monitorStub();
    expect(await run({ agentMonitor: monitor }, 'status')).toContain('**OFF**');
    expect(await run({ onAgents: () => 'fallback' }, 'status')).toBe('fallback');
    expect(await run({}, 'status')).toBe('No agent monitor active.');
  });

  describe('stream', () => {
    it('requires a monitor', async () => {
      expect(await run({}, 'stream on')).toContain('Start a fleet first');
    });

    it('toggles the stream and reports status case-insensitively', async () => {
      const monitor = monitorStub();
      expect(await run({ agentMonitor: monitor }, 'stream ON')).toContain('enabled');
      expect(monitor.setStreamEnabled).toHaveBeenLastCalledWith(true);
      expect(await run({ agentMonitor: monitor }, 'stream status')).toContain('**ON**');
      expect(await run({ agentMonitor: monitor }, 'stream off')).toContain('disabled');
      expect(monitor.setStreamEnabled).toHaveBeenLastCalledWith(false);
      expect(await run({ agentMonitor: monitor }, 'stream')).toBe(
        'Usage: `/agents stream on|off|status`',
      );
    });
  });

  describe('chat', () => {
    it('reports status (default off) without a controller', async () => {
      expect(await run({}, 'chat')).toContain('Fleet chat is **off**');
      expect(await run({ fleetStreamController: { mode: 'full' } }, 'chat status')).toContain(
        'Every subagent tool call',
      );
    });

    it.each(['compact', 'on', 'verbose'])('rejects unsupported verbosity %j', async (mode) => {
      const setMode = vi.fn();
      expect(await run({ fleetStreamController: { mode: 'off', setMode } }, `chat ${mode}`)).toBe(
        'Usage: `/agents chat off|full|status`',
      );
      expect(setMode).not.toHaveBeenCalled();
    });

    it('sets the mode without persisting when config paths are absent', async () => {
      const setMode = vi.fn();
      expect(await run({ fleetStreamController: { mode: 'off', setMode } }, 'chat FULL')).toContain(
        'Fleet chat → **full**',
      );
      expect(setMode).toHaveBeenCalledWith('full');
    });

    it('persists the choice into the active profile config', async () => {
      const cfg: Record<string, unknown> = { activeProfile: 'work' };
      const configStore = {
        get: () => cfg,
        update: vi.fn((patch: Record<string, unknown>) => Object.assign(cfg, patch)),
      };
      const profileConfig = (name: string) => path.join(dir, `${name}.config.json`);
      const setMode = vi.fn();
      const message = await run(
        {
          fleetStreamController: { mode: 'full', setMode },
          configStore,
          paths: { profileConfig, inProjectConfig: path.join(dir, 'project', 'config.json') },
        },
        'chat off',
      );
      expect(message).toContain('Fleet chat → **off**');
      const written = JSON.parse(await fs.readFile(profileConfig('work'), 'utf8'));
      expect(written.autonomy.fleetChatVerbosity).toBe('off');
      expect((cfg['autonomy'] as Record<string, unknown>)['fleetChatVerbosity']).toBe('off');
    });

    it('persists to the default profile when none is active and works without a controller', async () => {
      const cfg: Record<string, unknown> = {};
      const profileConfig = (name: string) => path.join(dir, `${name}.config.json`);
      await run(
        {
          configStore: {
            get: () => cfg,
            update: (p: Record<string, unknown>) => Object.assign(cfg, p),
          },
          paths: { profileConfig },
        },
        'chat full',
      );
      const written = JSON.parse(await fs.readFile(profileConfig('default'), 'utf8'));
      expect(written.autonomy.fleetChatVerbosity).toBe('full');
    });
  });

  describe('list', () => {
    it('reports an empty fleet', async () => {
      expect(await run({ agentMonitor: monitorStub() }, 'list')).toBe(
        'No subagents have been spawned yet.',
      );
    });

    it('formats known sessions with status icons, truncated ids and tasks', async () => {
      const monitor = monitorStub([
        {
          subagentId: 'abcdefghijklmnop',
          agentName: 'Scout',
          status: 'running',
          task: 'x'.repeat(100),
        },
        { subagentId: 'short', agentName: 'Odd', status: 'mystery' },
      ]);
      const out = await run({ agentMonitor: monitor }, 'list');
      const lines = out.split('\n');
      expect(lines[0]).toBe('**Known subagents (2)**');
      expect(lines[2]).toBe(`🟢 **Scout** (\`abcdefghijkl…\`) _running_ — ${'x'.repeat(80)}`);
      expect(lines[3]).toBe('⚪ **Odd** (`short…`) _mystery_');
    });
  });

  describe('show', () => {
    const sessions: SessionStub[] = [
      { subagentId: 'sub-alpha-1', agentName: 'Reviewer', status: 'completed' },
      { subagentId: 'sub-beta-2', agentName: 'Builder Bot', status: 'failed' },
    ];

    it('requires a monitor and an id', async () => {
      expect(await run({}, 'show x')).toBe('No agent monitor active.');
      expect(await run({ agentMonitor: monitorStub(sessions) }, 'show')).toContain(
        'Usage: `/agents show <subagentId>`',
      );
    });

    it('matches by id prefix before falling back to a case-insensitive name match', async () => {
      const transcript = [
        { kind: 'tool_use', iteration: 1, content: 'read_file' },
        { kind: 'unknown', iteration: 2, content: 'y'.repeat(250) },
      ];
      const monitor = monitorStub(sessions, transcript);
      const byId = await run({ agentMonitor: monitor }, 'show sub-beta');
      expect(monitor.getTranscript).toHaveBeenLastCalledWith('sub-beta-2', 30);
      expect(byId).toContain('**📋 Builder Bot** (`sub-beta-2`) — _failed_ — last 2 entries');
      expect(byId).toContain('🔧 [#1] read_file');
      expect(byId).toContain(` [#2] ${'y'.repeat(200)}`);
      expect(byId).not.toContain('y'.repeat(201));

      await run({ agentMonitor: monitor }, 'show builder bot');
      expect(monitor.getTranscript).toHaveBeenLastCalledWith('sub-beta-2', 30);
    });

    it('reports no match and an empty transcript', async () => {
      expect(await run({ agentMonitor: monitorStub(sessions) }, 'show ghost')).toContain(
        'No subagent matched "ghost"',
      );
      expect(await run({ agentMonitor: monitorStub(sessions, []) }, 'show reviewer')).toBe(
        'No transcript entries for Reviewer.',
      );
    });
  });

  it('rejects unknown subcommands', async () => {
    expect(await run({}, 'frobnicate')).toBe(
      'Unknown subcommand "frobnicate". Try: chat, stream, list, show',
    );
  });
});
