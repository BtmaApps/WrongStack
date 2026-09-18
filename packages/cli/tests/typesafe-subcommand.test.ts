/**
 * `wstack typesafe` — the account surface.
 *
 * The behaviour that matters is the reporting: `status` has to distinguish "no
 * account" from "an account was asked for and does not work", and `test` has to
 * turn each HTTP status into advice a user can act on. Everything else in the
 * system is built to swallow these failures.
 */

import * as os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../src/arg-parser.js';
import * as configUtils from '../src/provider-config-utils.js';
import { typesafeCmd } from '../src/subcommands/handlers/typesafe.js';

async function invoke(
  argv: string[],
  deps: Parameters<typeof typesafeCmd>[1],
): Promise<{ code: number }> {
  const { flags, positional } = parseArgs(['typesafe', ...argv]);
  (deps as { flags: Record<string, string | boolean> }).flags = flags;
  return { code: await typesafeCmd(positional.slice(1), deps) };
}

function fakeDeps(config: Record<string, unknown> = {}) {
  const lines: string[] = [];
  const deps = {
    config: { features: {}, ...config },
    renderer: {
      write: (text: string) => lines.push(text.replace(/\n$/, '')),
      writeError: vi.fn(),
      writeInfo: vi.fn(),
      writeWarning: vi.fn(),
    },
    reader: { readSecret: vi.fn(async () => '') },
    modelsRegistry: {},
    vault: {},
    paths: { globalConfig: '/tmp/cfg.json', profileConfig: () => '/tmp/cfg.json' },
    cwd: os.tmpdir(),
    projectRoot: os.tmpdir(),
    userHome: os.tmpdir(),
    flags: {},
  } as never as Parameters<typeof typesafeCmd>[1];
  return { deps, output: () => lines.join('\n') };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env['TYPESAFE_API_KEY'];
  delete process.env['OPENROUTER_API_KEY'];
});

describe('wstack typesafe status', () => {
  it('exits 0 with no account when nothing asks for one', async () => {
    // Having no TypeSafe account is an ordinary state, not a problem.
    const { deps, output } = fakeDeps();
    const { code } = await invoke([], deps);
    expect(code).toBe(0);
    expect(output()).toContain('none enabled');
  });

  it('exits 1 when a feature is on and the account is missing', async () => {
    const { deps, output } = fakeDeps({ skills: { suggest: { enabled: true } } });
    const { code } = await invoke(['status'], deps);
    expect(code).toBe(1);
    expect(output()).toContain('skills.suggest');
    expect(output()).toContain('wstack typesafe login');
  });

  it('shows the OpenRouter route and never prints the key', async () => {
    process.env['OPENROUTER_API_KEY'] = 'sk-or-supersecret';
    const { deps, output } = fakeDeps({ typesafe: { route: 'openrouter' } });
    await invoke([], deps);
    expect(output()).toContain('openrouter.ai/api/alpha/decisions');
    expect(output()).toContain('~typesafe/jev-latest');
    expect(output()).not.toContain('supersecret');
  });
});

describe('wstack typesafe test', () => {
  it('reports the answer, the model that answered and the cost', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              model: 'jev-1.13.0',
              answers: { reachable: { type: 'noul', noul: 0.98 } },
              usage: { input_tokens: 24, output_tokens: 0 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );
    const { deps, output } = fakeDeps({ typesafe: { apiKey: 'k' } });
    const { code } = await invoke(['test'], deps);
    expect(code).toBe(0);
    expect(output()).toContain('jev-1.13.0');
    expect(output()).toContain('24 input tokens');
  });

  it('turns a 401 into advice rather than a stack trace', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 401 })),
    );
    const { deps, output } = fakeDeps({ typesafe: { apiKey: 'bad' } });
    const { code } = await invoke(['test'], deps);
    expect(code).toBe(1);
    expect(output()).toContain('rejected the key');
  });

  it('says a rate limit is not a credential problem', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('slow down', { status: 429 })),
    );
    const { deps, output } = fakeDeps({ typesafe: { apiKey: 'k', requestTimeoutMs: 500 } });
    const { code } = await invoke(['test'], deps);
    expect(code).toBe(1);
    expect(output()).toContain('key is probably fine');
  });

  it('fails a 200 whose body is missing the answer we asked for', async () => {
    // Exactly the case the client swallows on a live turn, by design.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ answers: {}, usage: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const { deps, output } = fakeDeps({ typesafe: { apiKey: 'k' } });
    const { code } = await invoke(['test'], deps);
    expect(code).toBe(1);
    expect(output()).toContain('malformed');
  });

  it('refuses without an account instead of calling anything', async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal('fetch', fetchImpl);
    const { deps, output } = fakeDeps();
    const { code } = await invoke(['test'], deps);
    expect(code).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(output()).toContain('TYPESAFE_API_KEY');
  });
});

describe('wstack typesafe login', () => {
  it('drops the previous host and model when explicitly switching routes', async () => {
    const saved = {
      typesafe: {
        route: 'custom',
        endpoint: 'https://old-proxy.test/decisions',
        model: 'jev-1.13.0',
        apiKey: 'old',
        requestTimeoutMs: 900,
      },
    };
    vi.spyOn(configUtils, 'mutateConfigProviders').mockImplementation(
      async (_path, _vault, mutate) => {
        mutate({}, saved);
      },
    );
    const { deps } = fakeDeps(saved);
    const { code } = await invoke(['login', '--route', 'openrouter', '--key', 'new'], deps);
    expect(code).toBe(0);
    expect(saved.typesafe).toEqual({ route: 'openrouter', apiKey: 'new', requestTimeoutMs: 900 });
  });

  it('keeps endpoint and model when rotating the key without changing route', async () => {
    const saved = {
      typesafe: {
        route: 'custom',
        endpoint: 'https://proxy.test/decisions',
        model: 'jev-1.13.0',
        apiKey: 'old',
      },
    };
    vi.spyOn(configUtils, 'mutateConfigProviders').mockImplementation(
      async (_path, _vault, mutate) => {
        mutate({}, saved);
      },
    );
    const { deps } = fakeDeps(saved);
    expect((await invoke(['login', '--key', 'new'], deps)).code).toBe(0);
    expect(saved.typesafe).toEqual({
      route: 'custom',
      endpoint: 'https://proxy.test/decisions',
      model: 'jev-1.13.0',
      apiKey: 'new',
    });
  });

  it('refuses a custom route without an endpoint before asking for a key', async () => {
    const mutate = vi.spyOn(configUtils, 'mutateConfigProviders').mockResolvedValue();
    const { deps, output } = fakeDeps();
    expect((await invoke(['login', '--route', 'custom'], deps)).code).toBe(1);
    expect(deps.reader.readSecret).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
    expect(output()).toContain('--endpoint');
  });

  it('accepts an explicit endpoint and model for a custom route', async () => {
    const saved: Record<string, unknown> = {};
    vi.spyOn(configUtils, 'mutateConfigProviders').mockImplementation(
      async (_path, _vault, mutate) => {
        mutate({}, saved);
      },
    );
    const { deps } = fakeDeps();
    expect(
      (
        await invoke(
          [
            'login',
            '--route',
            'custom',
            '--endpoint',
            'https://proxy.test/decisions',
            '--model',
            'jev-1.13.0',
            '--key',
            'new',
          ],
          deps,
        )
      ).code,
    ).toBe(0);
    expect(saved['typesafe']).toEqual({
      route: 'custom',
      endpoint: 'https://proxy.test/decisions',
      model: 'jev-1.13.0',
      apiKey: 'new',
    });
  });
});
