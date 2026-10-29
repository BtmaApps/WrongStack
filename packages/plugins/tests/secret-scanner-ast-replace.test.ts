/**
 * secret-scanner gates disk writes by exact tool name; codebase-ast-replace writes
 * its newBody into source like edit but was not listed, so a credential edit
 * refuses was written through it unchecked.
 */

import { hookMatcherMatches } from '@wrongstack/core/hooks';
import { describe, expect, it, vi } from 'vitest';

const plugin = (await import('../src/secret-scanner/index.js')).default;
const TOKEN = `ghp_${'a1B2c3D4e5'.repeat(3)}abcdef`;

function preToolUse(extensions: Record<string, unknown> = {}) {
  const api = {
    tools: { register: vi.fn() },
    config: { extensions },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    metrics: { counter: vi.fn(), histogram: vi.fn(), gauge: vi.fn() },
    registerHook: vi.fn(() => vi.fn()),
    onConfigChange: vi.fn(() => vi.fn()),
  };
  plugin.setup(api as never);
  const [, matcher, hook] = api.registerHook.mock.calls.find(
    (c) => (c as unknown[])[0] === 'PreToolUse',
  ) as unknown as [string, string, (i: unknown) => Promise<{ decision?: string } | undefined>];
  return async (toolName: string, toolInput: unknown) =>
    hookMatcherMatches(matcher, toolName)
      ? (await hook({ toolName, toolInput }))?.decision
      : 'not-run';
}

describe('secret-scanner: codebase-ast-replace', () => {
  it('blocks the token in newBody, in any casing of the tool name', async () => {
    const run = preToolUse();
    expect(
      await run('codebase-ast-replace', { file: 'a.ts', symbol: 't', newBody: `x = "${TOKEN}"` }),
    ).toBe('block');
    expect(
      await run('Codebase-AST-Replace', { file: 'a.ts', symbol: 't', newBody: `x = "${TOKEN}"` }),
    ).toBe('block');
  });

  it('a clean newBody passes; other tools unchanged; a user matcher still wins', async () => {
    const run = preToolUse();
    expect(
      await run('codebase-ast-replace', { file: 'a.ts', symbol: 't', newBody: 'return 1;' }),
    ).not.toBe('block');
    expect(await run('write', { path: 'a', content: TOKEN })).toBe('block');
    expect(await run('read', { path: 'a' })).toBe('not-run');
    expect(
      await preToolUse({ 'secret-scanner': { matcher: 'write' } })('codebase-ast-replace', {
        newBody: TOKEN,
      }),
    ).toBe('not-run');
  });
});
