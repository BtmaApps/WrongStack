// Opt-in PTY end-to-end regression for the settings-picker cursor restore.
//
// Boots the real built CLI twice in one sandboxed profile:
//   Phase A — open /settings, navigate ↓ to field 39 ("Show model
//             reasoning"), press → to toggle; the auto-save must persist
//             autonomy.lastSettingsField=39 + showModelReasoning=true.
//   Phase B — relaunch, open /settings; the picker must restore the cursor
//             to field 39 (rendered cursor line + value), proven decisively
//             by one more ↓+→ persisting lastSettingsField=40 (a broken
//             restore would start at field 0 and persist 1 instead).
// Global-scope picker saves land in the ACTIVE PROFILE's config
// (~/.wrongstack/profiles/<name>/config.json), not the top-level global
// config — the poll below watches all candidates.
//
// Contract: packages/tui/src/reducers/settings-panel.ts settingsOpen restore
// ("a non-zero persisted value (loaded from disk) takes priority on a fresh
// open") + the adapter's four-part persistence of lastSettingsField
// (packages/cli/src/boot/tui-settings-adapter.ts).
//
// Requires built packages plus node-pty:
//   WSTACK_E2E=1 pnpm vitest run packages/cli/tests/settings-cursor-restore-tui-e2e.test.ts
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js');
const ESC = String.fromCharCode(27);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Field indexes in the picker row order (packages/tui/src/components/
// settings-picker-constants.ts SETTINGS_FIELD_LABELS). 39 and 40 are benign
// toggles/cycles; 1 is where ↓ lands if the cursor did NOT restore.
const TARGET_FIELD = 39;
const NEXT_FIELD = 40;
const BROKEN_FIELD = 1;

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

interface SpawnedTui {
  proc: ReturnType<PtyModule['spawn']>;
  getOutput(): string;
}

describe.skipIf(!runnable)('settings cursor restore — PTY end-to-end', () => {
  let child: SpawnedTui | null = null;
  let home: string | undefined;
  let project: string | undefined;
  let globalConfigPath = '';

  const sandboxConfigCandidates = (): string[] => {
    const profilesDir = path.join(home!, '.wrongstack', 'profiles');
    const profileConfigs = fs.existsSync(profilesDir)
      ? fs
          .readdirSync(profilesDir)
          .filter((entry) => fs.statSync(path.join(profilesDir, entry)).isDirectory())
          .map((entry) => path.join(profilesDir, entry, 'config.json'))
      : [];
    return [globalConfigPath, ...profileConfigs, path.join(project!, '.wrongstack', 'config.json')];
  };

  const readPersistedAutonomy = (): { autonomy: Record<string, unknown>; file: string } => {
    for (const candidate of sandboxConfigCandidates()) {
      try {
        const cfg = JSON.parse(fs.readFileSync(candidate, 'utf8')) as {
          autonomy?: Record<string, unknown>;
        };
        if (cfg.autonomy && Object.keys(cfg.autonomy).length > 0) {
          return { autonomy: cfg.autonomy, file: candidate };
        }
      } catch {
        // Missing/unreadable candidate — try the next.
      }
    }
    return { autonomy: {}, file: '(none)' };
  };

  afterEach(async () => {
    try {
      // Normal rapid-Ctrl+C shutdown first; killing the PTY outright leaves
      // detached project helpers holding temp files on Windows (see the
      // subagent-models harness note).
      child?.proc.write('\x03\x03');
      await sleep(750);
      child?.proc.kill();
    } catch {
      // Already exited.
    }
    child = null;
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
    globalConfigPath = '';
  });

  const spawnTui = (): SpawnedTui => {
    const proc = (pty as PtyModule).spawn(
      process.execPath,
      [CLI_ENTRY, '--tui', '--provider', 'omniroute', '--model', 'test-model'],
      {
        name: 'xterm-256color',
        cols: 110,
        rows: 40,
        cwd: project!,
        env: definedEnv({
          PATH: process.env['PATH'],
          Path: process.env['Path'],
          PATHEXT: process.env['PATHEXT'],
          SystemRoot: process.env['SystemRoot'],
          windir: process.env['windir'],
          ComSpec: process.env['ComSpec'],
          TEMP: process.env['TEMP'],
          TMP: process.env['TMP'],
          TERM: 'xterm-256color',
          USERPROFILE: home!,
          HOME: home!,
          WRONGSTACK_DISABLE_CONFIG_WATCH: '1',
          WRONGSTACK_SAGE_INLINE: '1',
          WRONGSTACK_INDEX_INLINE: '1',
          WRONGSTACK_CHRONICLE_INLINE: '1',
          WRONGSTACK_KANBAN_SERVER: '0',
        }),
      },
    );
    let output = '';
    let answered = 0;
    proc.onData((data) => {
      output += data;
      // Accept only the small, known set of first-run setup prompts.
      if (answered < 4 && /\[Y\/n(\/q)?\]|\[y\/N(\/q)?\]/.test(data)) {
        answered += 1;
        proc.write('y\r');
      }
    });
    return { proc, getOutput: () => output };
  };

  const expectSoon = async (needle: string, timeoutMs: number, from = 0): Promise<void> => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (child!.getOutput().indexOf(needle, from) >= 0) return;
      await sleep(100);
    }
    expect.fail(
      `timeout waiting for "${needle}"; terminal tail:\n${stripVTControlCharacters(child!.getOutput().slice(-2_500))}`,
    );
  };

  const type = async (text: string): Promise<void> => {
    for (const character of text) {
      child!.proc.write(character);
      await sleep(90);
    }
  };

  const pollAutonomy = async (
    predicate: (autonomy: Record<string, unknown>) => boolean,
    timeoutMs: number,
    label: string,
  ): Promise<{ autonomy: Record<string, unknown>; file: string }> => {
    const started = Date.now();
    let last = { autonomy: {}, file: '(none)' };
    while (Date.now() - started < timeoutMs) {
      last = readPersistedAutonomy();
      if (predicate(last.autonomy)) return last;
      await sleep(150);
    }
    expect.fail(`timeout waiting for ${label}; last persisted autonomy: ${JSON.stringify(last)}`);
  };

  const shutdown = async (): Promise<void> => {
    child!.proc.write('\x03\x03');
    await sleep(750);
    child!.proc.kill();
    await sleep(750);
    child = null;
  };

  const bootAndOpenSettings = async (tag: string, openNeedle: string): Promise<void> => {
    child = spawnTui();
    await expectSoon('Enter send · @ file · / commands', 90_000);
    const cmdStart = child.getOutput().length;
    await type('/settings');
    child.proc.write('\r');
    await expectSoon(openNeedle, 20_000, cmdStart);
    console.log(`[${tag}] settings picker open`);
  };

  it('restores the last-edited settings field across a TUI restart', async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'wstack-cursor-restore-home-'));
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'wstack-cursor-restore-project-'));
    globalConfigPath = path.join(home, '.wrongstack', 'config.json');
    execFileSync('git', ['init'], { cwd: project, stdio: 'ignore' });
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"cursor-restore-e2e"}');
    fs.mkdirSync(path.join(home, '.wrongstack'), { recursive: true });
    fs.writeFileSync(
      globalConfigPath,
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

    // ── Phase A: toggle a value on field 39, expect the snapshot persisted ──
    await bootAndOpenSettings('A', 'Default autonomy mode');
    for (let index = 0; index < TARGET_FIELD; index++) {
      child!.proc.write(`${ESC}[B`);
      await sleep(110);
    }
    child!.proc.write(`${ESC}[C`);
    const persistedA = await pollAutonomy(
      (autonomy) =>
        autonomy['lastSettingsField'] === TARGET_FIELD && autonomy['showModelReasoning'] === true,
      20_000,
      `autonomy.lastSettingsField===${TARGET_FIELD} && showModelReasoning===true after the phase-A toggle`,
    );
    console.log(`[A] persisted to ${persistedA.file}`);

    await shutdown();

    // ── Phase B: relaunch; the cursor must land back on field 39 ──
    await bootAndOpenSettings('B', 'fields below');
    // The restored cursor scrolls the viewport so field 39 is on screen with
    // its persisted value ("on"); a broken restore would show field 0 rows.
    const openFrame = stripVTControlCharacters(child!.getOutput().slice(-4_500));
    expect(openFrame, 'expected the picker to open scrolled to the restored field 39').toContain(
      '› Show model reasoning',
    );

    // Decisive probe: ↓+→ must persist lastSettingsField=40 (cursor was on
    // 39). A broken restore (cursor at 0) would persist 1 — poll for either
    // so the failure output names which one happened.
    child!.proc.write(`${ESC}[B`);
    await sleep(300);
    child!.proc.write(`${ESC}[C`);
    const persistedB = await pollAutonomy(
      (autonomy) =>
        autonomy['lastSettingsField'] === NEXT_FIELD ||
        autonomy['lastSettingsField'] === BROKEN_FIELD,
      20_000,
      `autonomy.lastSettingsField to become ${NEXT_FIELD} (restored) or ${BROKEN_FIELD} (broken)`,
    );
    expect(
      persistedB.autonomy['lastSettingsField'],
      `expected the ↓+→ probe to persist lastSettingsField=${NEXT_FIELD} (restore worked); ` +
        `got ${String(persistedB.autonomy['lastSettingsField'])} — ${BROKEN_FIELD} would mean the cursor did not restore`,
    ).toBe(NEXT_FIELD);
    expect(persistedB.autonomy['showAgentSwarmPanel']).toBe('sidebar');
  }, 240_000);
});
