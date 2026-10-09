/**
 * `launch.rememberStartupChoices` (TUI Settings → "Reuse startup choices").
 * On (the default), the boot gates take the saved system-prompt variant and
 * mode/YOLO/autonomy without asking "Continue with these?"; off restores the
 * questions. First run still has nothing to reuse, and a diverging CLI flag
 * still opens the individual prompts.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSystemPromptMenu } from '../src/boot/system-prompt-menu.js';
import { shouldReuseStartupChoices } from '../src/boot-provider-selection.js';
import type { ReadlineInputReader } from '../src/input-reader.js';
import {
  type LaunchModeChoices,
  persistLaunchChoices,
  promptStopAskingStartupQuestions,
  runLaunchPrompts,
} from '../src/pre-launch/launch-prompts.js';
import type { TerminalRenderer } from '../src/renderer.js';

function fakeIo(answers: string[]) {
  let i = 0;
  const reader = {
    readLine: vi.fn(async (_prompt: string, opts?: { defaultAnswer?: string }) => {
      return answers[i++] ?? opts?.defaultAnswer ?? '';
    }),
  } as unknown as ReadlineInputReader;
  const renderer = { write: vi.fn(), writeError: vi.fn() } as unknown as TerminalRenderer;
  return { reader, renderer };
}

const LAST: LaunchModeChoices = { mode: 'repl', yolo: false, autonomy: 'off' };

describe('shouldReuseStartupChoices', () => {
  it('defaults to on when unset', () => {
    expect(shouldReuseStartupChoices({})).toBe(true);
    expect(shouldReuseStartupChoices({ launch: { mode: 'tui' } })).toBe(true);
  });

  it('is off only for an explicit false', () => {
    expect(shouldReuseStartupChoices({ launch: { rememberStartupChoices: false } })).toBe(false);
    expect(shouldReuseStartupChoices({ launch: { rememberStartupChoices: true } })).toBe(true);
  });
});

describe('runLaunchPrompts — reuseLast', () => {
  it('returns the saved choices without asking', async () => {
    const { reader, renderer } = fakeIo(['n']);
    const result = await runLaunchPrompts({ renderer, reader, lastChoices: LAST, reuseLast: true });
    expect(result).toEqual(LAST);
    expect(reader.readLine).not.toHaveBeenCalled();
  });

  it('still asks the Continue question when reuse is off', async () => {
    const { reader, renderer } = fakeIo(['y']);
    const result = await runLaunchPrompts({
      renderer,
      reader,
      lastChoices: LAST,
      reuseLast: false,
    });
    expect(result).toEqual(LAST);
    expect(reader.readLine).toHaveBeenCalledTimes(1);
  });

  it('a CLI flag that diverges from the saved value still opens the prompts', async () => {
    // mode pinned to tui (saved: repl) → override path asks YOLO + autonomy.
    const { reader, renderer } = fakeIo(['y', 'y']);
    const result = await runLaunchPrompts({
      renderer,
      reader,
      modePinned: 'tui',
      lastChoices: LAST,
      reuseLast: true,
    });
    expect(result).toEqual({ mode: 'tui', yolo: true, autonomy: 'auto' });
    expect(reader.readLine).toHaveBeenCalledTimes(2);
  });

  it('has nothing to reuse on first run and applies defaults', async () => {
    const { reader, renderer } = fakeIo([]);
    const result = await runLaunchPrompts({ renderer, reader, reuseLast: true });
    expect(result).toEqual({ mode: 'tui', yolo: true, autonomy: 'auto' });
    expect(reader.readLine).not.toHaveBeenCalled();
  });
});

describe('runSystemPromptMenu — reuseLast', () => {
  const paths = { globalDir: '/nonexistent/global', projectDir: '/nonexistent/project' };

  it('returns the saved variant without asking', async () => {
    const { reader, renderer } = fakeIo(['n']);
    const variant = await runSystemPromptMenu({
      renderer,
      reader,
      paths,
      lastVariant: 'pro',
      reuseLast: true,
    });
    expect(variant).toBe('pro');
    expect(reader.readLine).not.toHaveBeenCalled();
  });

  it('keeps the saved variant outside a project instead of swapping to Scout', async () => {
    const { reader, renderer } = fakeIo([]);
    const variant = await runSystemPromptMenu({
      renderer,
      reader,
      paths,
      lastVariant: 'lite',
      suggestScout: true,
      reuseLast: true,
    });
    expect(variant).toBe('lite');
    expect(reader.readLine).not.toHaveBeenCalled();
  });
});

describe('promptStopAskingStartupQuestions', () => {
  it('defaults to keep asking on Enter / timeout', async () => {
    const { reader, renderer } = fakeIo([]);
    expect(await promptStopAskingStartupQuestions({ renderer, reader })).toBe(false);
  });

  it('returns true for y / yes', async () => {
    for (const a of ['y', 'YES']) {
      const { reader, renderer } = fakeIo([a]);
      expect(await promptStopAskingStartupQuestions({ renderer, reader })).toBe(true);
    }
  });
});

describe('persistLaunchChoices keeps the rest of the launch block', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-startup-reuse-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('does not erase rememberStartupChoices or menuChoice', async () => {
    const configPath = path.join(dir, 'config.json');
    await fs.writeFile(
      configPath,
      JSON.stringify({
        launch: { mode: 'tui', rememberStartupChoices: false, menuChoice: { mode: 'tui-repl' } },
      }),
    );
    await persistLaunchChoices(configPath, LAST);
    const parsed = JSON.parse(await fs.readFile(configPath, 'utf8')) as {
      yolo: boolean;
      launch: Record<string, unknown>;
    };
    expect(parsed.yolo).toBe(false);
    expect(parsed.launch).toEqual({
      mode: 'repl',
      autonomy: 'off',
      rememberStartupChoices: false,
      menuChoice: { mode: 'tui-repl' },
    });
  });

  it('writes rememberStartupChoices when the stop-asking answer was yes', async () => {
    const configPath = path.join(dir, 'config.json');
    await fs.writeFile(configPath, JSON.stringify({ launch: { rememberStartupChoices: false } }));
    await persistLaunchChoices(configPath, LAST, { rememberStartupChoices: true });
    const parsed = JSON.parse(await fs.readFile(configPath, 'utf8')) as {
      launch: Record<string, unknown>;
    };
    expect(parsed.launch.rememberStartupChoices).toBe(true);
  });
});
