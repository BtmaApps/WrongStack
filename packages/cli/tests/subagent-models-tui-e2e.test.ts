// Opt-in PTY end-to-end regression for the interactive /subagent-models panel.
//
// Boots the real built CLI, submits the bare command through Ink's composer,
// and asserts that the panel opens instead of the command's text fallback.
// Requires built packages plus node-pty:
//   WSTACK_E2E=1 pnpm vitest run packages/cli/tests/subagent-models-tui-e2e.test.ts
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { DefaultSessionStore } from '@wrongstack/core/storage';
import { resolveWstackPaths } from '@wrongstack/core/utils';
import { afterEach, describe, expect, it } from 'vitest';
import { touchProjectInManifest } from '../src/services/project-manifest.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');
const ESC = String.fromCharCode(27);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function definedEnv(env: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

interface PtyModule {
  spawn(
    file: string,
    args: string[],
    opts: {
      name: string;
      cols: number;
      rows: number;
      cwd: string;
      env: Record<string, string | undefined>;
    },
  ): {
    write(data: string): void;
    resize(columns: number, rows: number): void;
    onData(callback: (data: string) => void): void;
    kill(): void;
  };
}

function loadNodePty(): PtyModule | null {
  try {
    const store = path.join(REPO_ROOT, 'node_modules', '.pnpm');
    const entry = fs.readdirSync(store).find((name) => name.startsWith('node-pty@'));
    if (!entry) return null;
    return createRequire(import.meta.url)(
      path.join(store, entry, 'node_modules', 'node-pty'),
    ) as PtyModule;
  } catch {
    return null;
  }
}

const pty = process.env['WSTACK_E2E'] === '1' ? loadNodePty() : null;
const runnable = pty !== null && fs.existsSync(CLI_ENTRY);

describe.skipIf(!runnable)('bare /subagent-models — PTY end-to-end', () => {
  let child: ReturnType<PtyModule['spawn']> | null = null;
  let home: string | undefined;
  let project: string | undefined;

  afterEach(async () => {
    try {
      // Let the real TUI take its normal rapid-Ctrl+C shutdown path first.
      // Killing the PTY outright leaves detached project helpers alive long
      // enough to keep SQLite/IPC files open on Windows, which turns a passed
      // interactive smoke into an EBUSY cleanup failure.
      child?.write('\x03\x03');
      await sleep(750);
      child?.kill();
    } catch {
      // Already exited.
    }
    child = null;
    // The real CLI starts project-local helper processes. Let the terminal
    // child begin its shutdown before removing its isolated HOME/project dirs.
    await sleep(750);
    await Promise.all([
      home
        ? fs.promises.rm(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
        : undefined,
      project
        ? fs.promises.rm(project, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
        : undefined,
    ]);
    home = undefined;
    project = undefined;
  });

  it('opens interactive panels and applies statusline line keys through a real PTY', async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'wstack-subagent-models-home-'));
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'wstack-subagent-models-project-'));
    execFileSync('git', ['init'], { cwd: project, stdio: 'ignore' });
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"subagent-models-e2e"}');
    fs.mkdirSync(path.join(home, '.wrongstack'), { recursive: true });
    fs.writeFileSync(
      path.join(home, '.wrongstack', 'config.json'),
      JSON.stringify({
        providers: {
          omniroute: {
            type: 'omniroute',
            family: 'openai-compatible',
            baseUrl: 'http://localhost:29999/v1',
            models: ['test-model'],
            apiKey: 'placeholder',
          },
        },
      }),
    );

    const targetRoot = path.join(home, 'switched-project');
    fs.mkdirSync(targetRoot);
    execFileSync('git', ['init'], { cwd: targetRoot, stdio: 'ignore' });
    // Seed before boot so the production catalog indexes the fixture on startup.
    const sessionPaths = resolveWstackPaths({
      projectRoot: targetRoot,
      globalRoot: path.join(home, '.wrongstack'),
    });
    const store = new DefaultSessionStore({
      dir: sessionPaths.projectSessions,
    });
    const saved = await store.create({
      id: 'pty-resume-proof',
      model: 'test-model',
      provider: 'omniroute',
    });
    await saved.append({
      type: 'user_input',
      ts: new Date().toISOString(),
      content: 'PTY saved question marker',
    });
    await saved.append({
      type: 'llm_response',
      ts: new Date().toISOString(),
      content: [{ type: 'text', text: 'PTY saved answer marker' }],
      stopReason: 'end_turn',
      usage: { input: 10, output: 10 },
      model: 'test-model',
      provider: 'omniroute',
    });
    await saved.append({
      type: 'session_end',
      ts: new Date().toISOString(),
      usage: { input: 10, output: 10 },
    });
    await saved.close();
    await store.dispose?.();

    child = (pty as PtyModule).spawn(
      process.execPath,
      [CLI_ENTRY, '--tui', '--provider', 'omniroute', '--model', 'test-model'],
      {
        name: 'xterm-256color',
        cols: 110,
        rows: 40,
        cwd: project,
        env: definedEnv({
          PATH: process.env['PATH'],
          Path: process.env['Path'],
          PATHEXT: process.env['PATHEXT'],
          SystemRoot: process.env['SystemRoot'],
          windir: process.env['windir'],
          ComSpec: process.env['ComSpec'],
          TEMP: process.env['TEMP'],
          TMP: process.env['TMP'],
          TMPDIR: process.env['TMPDIR'],
          SHELL: process.env['SHELL'],
          TERM: 'xterm-256color',
          USERPROFILE: home,
          HOME: home,
          WRONGSTACK_DISABLE_CONFIG_WATCH: '1',
          // This is a TUI paint/input smoke, not a daemon lifecycle test.
          // Keep its project state in-process so detached helper servers do
          // not outlive the PTY and lock temporary directories on Windows.
          WRONGSTACK_SAGE_INLINE: '1',
          WRONGSTACK_INDEX_INLINE: '1',
          WRONGSTACK_CHRONICLE_INLINE: '1',
          WRONGSTACK_KANBAN_SERVER: '0',
        }),
      },
    );

    let output = '';
    let answered = 0;
    child.onData((data) => {
      output += data;
      // A scratch project can trigger first-run setup prompts before the TUI
      // is mounted. Accept only the small, known set of prompts the test owns.
      if (answered < 4 && /\[Y\/n(\/q)?\]|\[y\/N(\/q)?\]/.test(data)) {
        answered += 1;
        child?.write('y\r');
      }
    });

    const expectSoon = async (needle: string, timeoutMs: number, from = 0): Promise<void> => {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        if (output.indexOf(needle, from) >= 0) return;
        await sleep(100);
      }
      expect.fail(`timeout waiting for "${needle}"; terminal tail:\n${output.slice(-2_000)}`);
    };
    const type = async (text: string): Promise<void> => {
      for (const character of text) {
        child?.write(character);
        await sleep(100);
      }
    };

    await expectSoon('Enter send · @ file · / commands', 90_000);

    const statuslineStart = output.length;
    await type('/statusline');
    child.write('\r');
    await expectSoon('STATUS LINE', 15_000, statuslineStart);
    await expectSoon('[1] 2 3 4', 15_000, statuslineStart);

    const lineMoveStart = output.length;
    child.write('3');
    await expectSoon('1 2 [3] 4', 15_000, lineMoveStart);

    const orderMoveStart = output.length;
    child.write(`${ESC}[1;2B`);
    await expectSoon('project → position 2 on line 3', 15_000, orderMoveStart);
    await sleep(500);
    const statuslineConfig = JSON.parse(
      fs.readFileSync(
        path.join(home, '.wrongstack', 'profiles', 'default', 'statusline.json'),
        'utf8',
      ),
    ) as { lines?: Record<string, number>; order?: string[] };
    expect(statuslineConfig.lines?.['project']).toBe(3);
    expect(statuslineConfig.order?.indexOf('project')).toBeGreaterThan(
      statuslineConfig.order?.indexOf('yolo') ?? -1,
    );
    child.write(ESC);
    await sleep(500);

    const commandStart = output.length;
    await type('/subagent-models');
    child.write('\r');

    await expectSoon('Subagent models (this session)', 15_000, commandStart);
    expect(output.slice(commandStart)).not.toContain('WrongStack — Subagent models');

    child.write(ESC);
    await sleep(500);
    await type('preserved-draft');
    const functionPanels = [
      ['OP', 'PROJECTS'],
      ['OQ', 'FLEET CONTROL'],
      ['OR', 'AGENTS'],
      ['OS', 'WORKTREES'],
      ['[15~', 'PLAN'],
      ['[17~', 'TODOS'],
      ['[18~', 'MESSAGE QUEUE'],
      ['[19~', 'PROCESSES'],
      ['[20~', 'GOAL'],
      ['[21~', 'SESSIONS'],
      ['[23~', 'COORDINATOR'],
      ['[24~', 'KANBAN'],
    ];
    for (const [columns, rows] of [
      [110, 40],
      [52, 16],
    ] as const) {
      child.resize(columns, rows);
      await sleep(300);
      for (const [sequence, title] of functionPanels) {
        const panelStart = output.length;
        child.write(`${ESC}${sequence}`);
        await expectSoon(title!, 10_000, panelStart);
        await sleep(150);
        child.write('z');
        await sleep(100);
        const closeStart = output.length;
        child.write(`${ESC}${sequence}`);
        await expectSoon('preserved-draft', 10_000, closeStart);
        expect(output.slice(closeStart)).not.toContain('preserved-draftz');
      }
    }
    child.write('\x15');
    await sleep(300);
    for (const [command, title] of [
      ['/model', 'Switch model'],
      ['/theme', 'TUI Theme'],
      ['/settings', 'Settings'],
      ['/resume', 'Resume Session'],
      ['/plugin', 'Plugin menu'],
      ['/mcp', 'MCP Servers'],
      ['/tools', 'Tools'],
      ['/mode', 'Mode Selection'],
      ['/brain', 'Brain'],
      ['/auth', 'API keys & sign-in'],
      ['/subagent-models', 'Subagent models'],
      ['/help', 'Help'],
      ['/prompts', 'Prompt library'],
      ['/skill', 'Skills'],
      // The needle must be panel text, not the slash-command description the
      // completion dropdown paints while the command is still being typed.
      ['/design', 'Design Studio · pick a kit'],
      ['/fallback', 'Fallback routing'],
      ['/tier', 'Model cost tiers'],
      ['/profile', 'Profiles'],
      ['/provider-status', 'Provider health'],
      ['/memory', 'Memory'],
      ['/worktree', 'Worktrees'],
      ['/git', 'Git'],
      ['/audit', 'Side Effects Audit'],
      ['/f12', 'KANBAN'],
    ] as const) {
      await type(command);
      // Search only what the submit paints. Command descriptions rendered by
      // the completion dropdown while typing can otherwise satisfy the wait
      // before the panel exists, leaking the next keystrokes into it.
      const pickerStart = output.length;
      child.write('\r');
      await expectSoon(title, 10_000, pickerStart);
      await sleep(200);
      const closeStart = output.length;
      child.write(ESC);
      await expectSoon('Enter send', 10_000, closeStart);
    }
    // This isolated host has no Shadow controller. The command must show its
    // text fallback instead of claiming a panel opened and returning nothing.
    const shadowStart = output.length;
    await type('/shadow');
    child.write('\r');
    await expectSoon('Stop with reason', 10_000, shadowStart);

    await touchProjectInManifest({
      projectRoot: targetRoot,
      globalConfigPath: path.join(home, '.wrongstack', 'config.json'),
      name: 'F1 switched target',
    });
    child.resize(110, 40);
    await sleep(300);
    child.write(`${ESC}OP`);
    await sleep(200);
    await type('F1 switched target');
    await sleep(200);
    const switchStart = output.length;
    child.write('\r');
    await expectSoon('Switched project: F1 switched target', 15000, switchStart);
    await sleep(300);
    const switchedFrame = stripVTControlCharacters(output.slice(switchStart));
    expect(switchedFrame).toMatch(/(?:workspace|cwd)[^\r\n]*switched-project/);
    expect(switchedFrame).not.toContain('Project switch failed');

    const menuStart = output.length;
    await type('/sessions');
    child.write('\r');
    await expectSoon('Resume Session', 10_000, menuStart);
    await expectSoon('PTY saved question marker', 10_000, menuStart);
    child.write(`${ESC}[B`);
    await sleep(100);
    const replayStart = output.length;
    child.write('\r');
    await expectSoon('Resumed session pty-resume-proof', 20_000, replayStart);
    const replay = stripVTControlCharacters(output.slice(replayStart));
    expect(replay).toContain('PTY saved question marker');
    expect(replay).toContain('PTY saved answer marker');
    expect(replay).not.toContain('Failed to resume');
    const reopenStart = output.length;
    await type('/sessions');
    child.write('\r');
    await expectSoon('Resume Session', 10_000, reopenStart);
  }, 150_000);
});
