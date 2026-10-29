/**
 * dep-guard read only shell command lines. The `install` tool — which tells
 * the model to use it instead of bash for package work — and
 * `language_package` carry `{ packages }` / `{ operation, names }` instead, so
 * the deny list, typosquat, unknown-name and package-age checks never ran on
 * the recommended install path.
 */

import { hookMatcherMatches } from '@wrongstack/core/hooks';
import { describe, expect, it, vi } from 'vitest';

const depGuard = (await import('../src/dep-guard/index.js')).default;

type Outcome = { decision?: string; additionalContext?: string };

function preToolUse(deny: string[]) {
  const api = {
    tools: { register: vi.fn() },
    config: { extensions: { 'dep-guard': { deny, registryCheck: false, lockfileSync: false } } },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    metrics: { counter: vi.fn(), histogram: vi.fn(), gauge: vi.fn() },
    registerHook: vi.fn(() => vi.fn()),
    onConfigChange: vi.fn(() => vi.fn()),
  };
  depGuard.setup(api as never);
  const calls = api.registerHook.mock.calls as unknown as Array<
    [string, string, (input: unknown) => Promise<Outcome | undefined>]
  >;
  const [, matcher, hook] = calls.find((call) => call[0] === 'PreToolUse')!;
  return async (toolName: string, toolInput: unknown): Promise<Outcome> =>
    hookMatcherMatches(matcher, toolName) ? ((await hook({ toolName, toolInput })) ?? {}) : {};
}

describe('dep-guard: structured install tools', () => {
  it('blocks a deny-listed package through the install tool', async () => {
    const run = preToolUse(['evil-pkg']);
    expect((await run('install', { packages: 'lodash, evil-pkg' })).decision).toBe('block');
    expect((await run('install', { packages: ['evil-pkg@1.0.0'] })).decision).toBe('block');
  });

  it('blocks it through language_package add/install for npm, pip and cargo', async () => {
    const run = preToolUse(['evil-pkg']);
    for (const language of ['typescript', 'python', 'rust']) {
      expect(
        (await run('language_package', { operation: 'add', language, names: ['evil-pkg'] }))
          .decision,
      ).toBe('block');
    }
  });

  it('flags a typosquat through the install tool and leaves non-adding calls alone', async () => {
    const run = preToolUse([]);
    expect((await run('install', { packages: 'raect' })).additionalContext ?? '').toMatch(/react/i);
    expect(await run('install', { packages: '' })).toEqual({});
    expect(
      await run('language_package', { operation: 'remove', language: 'typescript', names: ['x'] }),
    ).toEqual({});
  });
});
