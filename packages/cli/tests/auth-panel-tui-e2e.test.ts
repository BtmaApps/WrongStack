// Opt-in PTY end-to-end test for the interactive /auth panel.
//
// Boots the REAL built TUI (packages/cli/dist) inside a pseudo-terminal,
// types `/auth`, and walks the panel: list → provider detail (masked key,
// no plaintext leak) → local-server view → OAuth view → Ctrl+C cancel →
// reopen at the OAuth view via `/auth login`. This exercises the full
// wiring chain (slash command → onPanelOpen bridge → reducer → key router
// → CLI auth host) that unit tests can only cover in slices.
//
// Opt-in only — it spawns a real Node+Ink process and needs the dists
// built (`pnpm run build`) plus node-pty (hoisted via the webui package):
//   WSTACK_E2E=1 pnpm vitest run packages/cli/tests/auth-panel-tui-e2e.test.ts
import { execFileSync } from 'node:child_process';
import * as fsSync from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');

const e2eEnabled = process.env['WSTACK_E2E'] === '1';

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
    onData(cb: (d: string) => void): void;
    kill(): void;
  };
}

/**
 * node-pty is a dependency of @wrongstack/webui, not this package — resolve
 * it from the pnpm store at the repo root. Returns null when unavailable
 * (e.g. a filtered install), which skips the suite.
 */
function loadNodePty(): PtyModule | null {
  try {
    const store = path.join(REPO_ROOT, 'node_modules', '.pnpm');
    const entry = fsSync.readdirSync(store).find((name) => name.startsWith('node-pty@'));
    if (!entry) return null;
    const require = createRequire(import.meta.url);
    return require(path.join(store, entry, 'node_modules', 'node-pty')) as PtyModule;
  } catch {
    return null;
  }
}

const pty = e2eEnabled ? loadNodePty() : null;
const runnable = e2eEnabled && pty !== null && fsSync.existsSync(CLI_ENTRY);

const ESC = String.fromCharCode(27);
const CTRL_C = String.fromCharCode(3);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!runnable)('interactive /auth panel — PTY end-to-end', () => {
  let child: ReturnType<PtyModule['spawn']> | null = null;

  afterEach(() => {
    try {
      child?.kill();
    } catch {
      /* already gone */
    }
    child = null;
  });

  it('opens, navigates every view, survives Ctrl+C, and never leaks the key', async () => {
    // Isolated HOME so the spawned TUI reads a scratch ~/.wrongstack and
    // can never touch the developer's real config or session registry.
    const home = fsSync.mkdtempSync(path.join(os.tmpdir(), 'wstack-e2e-home-'));
    const proj = fsSync.mkdtempSync(path.join(os.tmpdir(), 'wstack-e2e-proj-'));
    execFileSync('git', ['init'], { cwd: proj, stdio: 'ignore' });
    fsSync.writeFileSync(
      path.join(proj, 'package.json'),
      JSON.stringify({ name: 'e2e-scratch', version: '0.0.0' }),
    );
    fsSync.mkdirSync(path.join(home, '.wrongstack'), { recursive: true });
    const PLAINTEXT_KEY = 'sk-fake-e2e-key-123456';
    fsSync.writeFileSync(
      path.join(home, '.wrongstack', 'config.json'),
      JSON.stringify({
        providers: {
          omniroute: {
            type: 'omniroute',
            family: 'openai-compatible',
            baseUrl: 'http://localhost:29999/v1',
            models: ['test-model'],
            apiKeys: [
              { label: 'default', apiKey: PLAINTEXT_KEY, createdAt: '2026-01-01T00:00:00.000Z' },
            ],
            activeKey: 'default',
          },
        },
      }),
    );

    // Whitelisted environment: vitest's own env (VITEST*, NODE_OPTIONS,
    // worker vars, any WRONGSTACK_* the harness sets) must not leak into
    // the spawned TUI — inheriting it makes boot behave differently than a
    // real terminal. Keep only what Node + git need on each platform.
    const cleanEnv: Record<string, string | undefined> = {
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
    };
    child = (pty as PtyModule).spawn(
      process.execPath,
      [CLI_ENTRY, '--tui', '--provider', 'omniroute', '--model', 'test-model'],
      {
        name: 'xterm-256color',
        cols: 110,
        rows: 40,
        cwd: proj,
        env: cleanEnv,
      },
    );

    let buf = '';
    let answered = 0;
    child.onData((d) => {
      buf += d;
      // Auto-answer any boot confirmation prompts (scratch dir, git, …).
      if (answered < 4 && /\[Y\/n(\/q)?\]|\[y\/N(\/q)?\]/.test(d)) {
        answered += 1;
        child?.write('y\r');
      }
    });

    const expectSoon = async (
      needle: string,
      timeoutMs: number,
      label: string,
      from = 0,
    ): Promise<void> => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (buf.indexOf(needle, from) !== -1) return;
        await sleep(250);
      }
      // Include the terminal tail so a failure is diagnosable from CI logs.
      const tail = buf
        .slice(-2_000)
        // eslint-disable-next-line no-control-regex
        .replace(new RegExp(`${ESC}\\[[0-9;?]*[a-zA-Z]`, 'g'), '')
        .replace(new RegExp(`${ESC}\\][^\\u0007]*(\\u0007|${ESC}\\\\)`, 'g'), '');
      expect.fail(`timeout waiting for "${needle}" (${label}); terminal tail:\n${tail}`);
    };
    // Type slash commands per-key: a single multi-char write is treated as a
    // bracketed paste by the input layer and never dispatches.
    const type = async (text: string) => {
      for (const ch of text) {
        child?.write(ch);
        await sleep(100);
      }
    };

    await expectSoon('Enter send', 90_000, 'TUI input ready');
    await sleep(3_000);

    // /auth → list view.
    await type('/auth');
    await sleep(500);
    child.write('\r');
    await expectSoon('API keys & sign-in', 20_000, 'panel title');
    await expectSoon('omniroute', 10_000, 'provider row');
    await expectSoon('Sign in with provider OAuth', 5_000, 'oauth action row');

    // Enter → provider detail with the masked key; the plaintext must
    // never appear anywhere in the terminal stream.
    child.write('\r');
    await expectSoon('Provider — omniroute', 10_000, 'provider detail');
    await expectSoon('sk-f', 5_000, 'masked key row');

    // Esc → list; ↓↓ → "Add local server"; Enter.
    child.write(ESC);
    await sleep(600);
    let mark = buf.length;
    child.write(`${ESC}[B`);
    await sleep(200);
    child.write(`${ESC}[B`);
    await sleep(300);
    child.write('\r');
    await expectSoon('Add local server', 10_000, 'local view', mark);
    await expectSoon('OmniRoute', 5_000, 'local preset', mark);

    // Esc → list; ↓×4 → OAuth; Enter.
    child.write(ESC);
    await sleep(600);
    mark = buf.length;
    for (let i = 0; i < 4; i++) {
      child.write(`${ESC}[B`);
      await sleep(150);
    }
    child.write('\r');
    await expectSoon('Sign in with OAuth', 10_000, 'oauth view', mark);
    await expectSoon('ChatGPT', 5_000, 'chatgpt option', mark);

    // Ctrl+C with the panel open — cancels the panel, the TUI stays alive.
    mark = buf.length;
    child.write(CTRL_C);
    await expectSoon('Auth panel cancelled.', 10_000, 'ctrl+c cancel', mark);
    await sleep(1_000);
    await expectSoon('Enter send', 10_000, 'alive after ctrl+c', mark);

    // /auth login → straight to the OAuth view.
    mark = buf.length;
    await type('/auth login');
    await sleep(500);
    child.write('\r');
    await expectSoon('Sign in with OAuth', 15_000, 'reopen at oauth', mark);

    expect(buf.includes(PLAINTEXT_KEY), 'plaintext key leaked to terminal').toBe(false);
  }, 240_000);
});
