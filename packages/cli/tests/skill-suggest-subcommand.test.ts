import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../src/arg-parser.js';
import { skillSuggestCmd } from '../src/subcommands/handlers/skill-suggest.js';

/**
 * Invoke the handler the way the CLI actually does.
 *
 * `boot` runs `parseArgs` FIRST: flags land in `deps.flags` and only
 * positionals reach `args`. Calling the handler with a raw argv array tested a
 * code path production never takes — the first real `--eval` run printed usage
 * and exited 1, and every test here was green.
 */
async function invoke(
  argv: string[],
  deps: Parameters<typeof skillSuggestCmd>[1],
): Promise<number> {
  const { flags, positional } = parseArgs(['skill-suggest', ...argv]);
  (deps as { flags: Record<string, string | boolean> }).flags = flags;
  return skillSuggestCmd(positional.slice(1), deps);
}

/**
 * The handler builds its own suggester from config, so the seam under test is
 * the TypeSafe HTTP call. Stubbing `fetch` exercises the real client, the real
 * two-pass suggester and the real rendering — everything except the network.
 */
const ROSTER = [
  { name: 'git-flow', description: 'Branching and release flow', trigger: 'cutting a release' },
  { name: 'design-craft', description: 'Visual design guidance', trigger: 'building a UI' },
  { name: 'debugging', description: 'Root-cause a failure', trigger: 'chasing a bug' },
];

function skillLoader() {
  return {
    list: async () => ROSTER.map((s) => ({ ...s, path: `/${s.name}/SKILL.md`, source: 'bundled' })),
    listEntries: async () =>
      ROSTER.map((s) => ({
        name: s.name,
        trigger: s.trigger,
        scope: [],
        source: 'bundled',
        path: `/${s.name}/SKILL.md`,
      })),
    find: async () => undefined,
    manifestText: async () => '',
    readBody: async (name: string) => `# ${name}\n\nBody for ${name}.`,
    readSaveBody: async (name: string) => `# ${name}`,
    invalidateCache: () => {},
  };
}

function fakeDeps(overrides: Record<string, unknown> = {}) {
  const lines: string[] = [];
  const deps = {
    config: { features: { skills: true }, skills: {} },
    renderer: {
      write: (text: string) => {
        lines.push(text.replace(/\n$/, ''));
      },
      writeError: vi.fn(),
      writeInfo: vi.fn(),
      writeWarning: vi.fn(),
    },
    reader: { readLine: vi.fn() },
    skillLoader: skillLoader(),
    modelsRegistry: {},
    vault: {},
    paths: { globalConfig: '/tmp/cfg.json', profileConfig: () => '/tmp/cfg.json' },
    cwd: os.tmpdir(),
    projectRoot: os.tmpdir(),
    userHome: os.tmpdir(),
    flags: {},
    ...overrides,
  } as never as Parameters<typeof skillSuggestCmd>[1];
  return { deps, output: () => lines.join('\n') };
}

/**
 * Stub the endpoint by REQUEST SHAPE, not call order.
 *
 * An eval runs cases concurrently, so the two passes of different cases
 * interleave and a call-ordered queue hands pass 1 a pass-2 body. Pass 1 is the
 * request carrying `gate::` questions; everything else is a rerank.
 */
function stubTypeSafe(wide: unknown, rerank?: unknown): ReturnType<typeof vi.fn> {
  const impl = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { questions: Record<string, unknown> };
    const isWide = Object.keys(body.questions).some((id) => id.startsWith('gate::'));
    return new Response(JSON.stringify(isWide ? wide : (rerank ?? wide)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', impl);
  return impl;
}

function widePass(gate: number, probabilities: Record<string, number>): unknown {
  const top = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  return {
    answers: {
      which: { type: 'choice', choice: top, probabilities, confidence: 0.8 },
      'gate::acts_on_user_system': { type: 'noul', noul: gate },
      'gate::would_follow_documented_procedure': { type: 'noul', noul: gate },
      'gate::prose_suffices': { type: 'noul', noul: 1 - gate },
    },
    usage: { input_tokens: 10, output_tokens: 2 },
  };
}

function rerankPass(winner: string, fits: Record<string, number>): unknown {
  const answers: Record<string, unknown> = {
    which: {
      type: 'choice',
      choice: winner,
      probabilities: Object.fromEntries(
        Object.keys(fits).map((n) => [n, 1 / Object.keys(fits).length]),
      ),
      confidence: 0.7,
    },
  };
  for (const [name, value] of Object.entries(fits)) {
    answers[`fits::${name}`] = { type: 'noul', noul: value };
  }
  return { answers, usage: { input_tokens: 10, output_tokens: 2 } };
}

beforeEach(() => {
  vi.stubEnv('TYPESAFE_API_KEY', 'sk-test');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('wstack skill-suggest', () => {
  it('prints usage and fails when given nothing to do', async () => {
    const { deps, output } = fakeDeps();
    expect(await invoke([], deps)).toBe(1);
    expect(output()).toContain('wstack skill-suggest');
  });

  it('refuses without an API key instead of silently doing nothing', async () => {
    // The live middleware stays quiet here on purpose; a command the user
    // typed has to say why it did not run.
    vi.stubEnv('TYPESAFE_API_KEY', '');
    const { deps, output } = fakeDeps();
    expect(await invoke(['cut a release branch'], deps)).toBe(1);
    expect(output()).toContain('TYPESAFE_API_KEY');
  });

  it('previews a suggestion with both passes and their numbers', async () => {
    stubTypeSafe(
      widePass(0.8, { 'git-flow': 0.7, 'design-craft': 0.2, debugging: 0.1 }),
      rerankPass('git-flow', { 'git-flow': 0.75, 'design-craft': 0.1, debugging: 0.05 }),
    );
    const { deps, output } = fakeDeps();

    expect(await invoke(['cut a release branch for 1.2.0'], deps)).toBe(0);

    const text = output();
    expect(text).toContain('gate');
    expect(text).toContain('pass 1');
    expect(text).toContain('pass 2');
    expect(text).toContain('suggests');
    expect(text).toContain('git-flow');
  });

  it('shows the number a gate-rejected turn stopped at, not just that it stopped', async () => {
    stubTypeSafe(widePass(0.05, { debugging: 0.6, 'git-flow': 0.4 }));
    const { deps, output } = fakeDeps();

    expect(await invoke(['explain what a monad is'], deps)).toBe(0);

    const text = output();
    expect(text).toContain('suggests nothing');
    expect(text).toMatch(/gate \d+% below \d+%/);
  });

  it('reports a transport failure rather than reporting "nothing fits"', async () => {
    // The live path collapses these into the same outcome by design. Telling
    // them apart is the reason the preview exists.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    const { deps, output } = fakeDeps();

    expect(await invoke(['cut a release branch'], deps)).toBe(1);
    expect(output()).toContain('failed');
  });

  describe('--eval', () => {
    let dir: string;
    beforeEach(async () => {
      dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-skill-eval-'));
    });
    afterEach(async () => {
      await fs.rm(dir, { recursive: true, force: true });
    });

    async function writeCases(lines: string[]): Promise<string> {
      const file = path.join(dir, 'cases.jsonl');
      await fs.writeFile(file, lines.join('\n'), 'utf8');
      return file;
    }

    it('scores a labeled set and separates the three error rates', async () => {
      stubTypeSafe(
        widePass(0.9, { 'git-flow': 0.8, debugging: 0.2 }),
        rerankPass('git-flow', { 'git-flow': 0.8, debugging: 0.1 }),
      );
      const file = await writeCases([
        '{"text": "cut a release branch for 1.2.0", "gold": "git-flow"}',
        '{"text": "restyle the settings page header", "gold": "design-craft"}',
      ]);
      const { deps, output } = fakeDeps();

      expect(await invoke(['--eval', file], deps)).toBe(0);

      const text = output();
      expect(text).toContain('correct');
      expect(text).toContain('wrong suggestion');
      expect(text).toContain('suggested nothing');
      // Every case gets the same stubbed answer, so the design request is a
      // wrong suggestion and shows up in the worst-cases list.
      expect(text).toContain('worst cases');
      expect(text).toContain('wanted design-craft');
    });

    it('warns about gold labels the roster no longer has', async () => {
      stubTypeSafe(widePass(0.05, { 'git-flow': 1 }));
      const file = await writeCases(['{"text": "do the thing", "gold": "renamed-away"}']);
      const { deps, output } = fakeDeps();

      await invoke(['--eval', file], deps);

      expect(output()).toContain('renamed-away');
      expect(output()).toContain('never be scored correct');
    });

    it('reports malformed lines instead of quietly shrinking the denominator', async () => {
      stubTypeSafe(widePass(0.05, { 'git-flow': 1 }));
      const file = await writeCases([
        '{"text": "fine", "gold": "git-flow"}',
        '{ this is not json }',
      ]);
      const { deps, output } = fakeDeps();

      await invoke(['--eval', file], deps);
      expect(output()).toContain('line 2');
    });

    it('fails clearly when the file cannot be read', async () => {
      const { deps, output } = fakeDeps();
      expect(await invoke(['--eval', path.join(dir, 'missing.jsonl')], deps)).toBe(1);
      expect(output()).toContain('cannot read');
    });

    it('--sweep prints a threshold table and says what the numbers are not', async () => {
      stubTypeSafe(
        widePass(0.9, { 'git-flow': 0.8, debugging: 0.2 }),
        rerankPass('git-flow', { 'git-flow': 0.8, debugging: 0.1 }),
      );
      const file = await writeCases([
        '{"text": "cut a release branch for 1.2.0", "gold": "git-flow"}',
        '{"text": "explain what a monad is"}',
      ]);
      const { deps, output } = fakeDeps();

      expect(await invoke(['--eval', file, '--sweep'], deps)).toBe(0);

      const text = output();
      expect(text).toContain('threshold sweep');
      expect(text).toContain('needless');
      // The honesty line: these score the suggester, not what the agent loads.
      expect(text).toContain('not what the agent then loads');
    });
  });
});
