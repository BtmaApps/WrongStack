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
import { afterEach, describe, expect, it } from 'vitest';

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
    ] as const) {
      const pickerStart = output.length;
      await type(command);
      child.write('\r');
      await expectSoon(title, 10_000, pickerStart);
      await sleep(200);
      const closeStart = output.length;
      child.write(ESC);
      await expectSoon('Enter send', 10_000, closeStart);
    }
  }, 120_000);
});
