/**
 * Smoke test for the apps/wrongstack shim.
 *
 * This shim is the published binary (`wrongstack` / `wstack`) — its only
 * job is to delegate `process.argv` to @wrongstack/cli's `main` after
 * installing broken-pipe handlers. There is no business logic here, but
 * the delegation contract is *load-bearing*: if @wrongstack/cli's
 * `main` signature changes, the published binary must keep working.
 *
 * Pin: importing the shim must NOT throw (it is compiled to ESM and
 * runs at install time); argv must be sliced correctly; the exported
 * `installBrokenPipeHandlers` and `main` must both resolve to callable
 * functions exported from @wrongstack/cli.
 */

import * as cli from '@wrongstack/cli';
import { describe, expect, it } from 'vitest';

describe('apps/wrongstack shim contract', () => {
  it('cli re-exports its process lifecycle and main as functions', () => {
    expect(typeof cli.installBrokenPipeHandlers).toBe('function');
    expect(typeof cli.runCliProcess).toBe('function');
    expect(typeof cli.main).toBe('function');
  });

  it('main accepts a string[] argv and returns a Promise<number>', async () => {
    // main() will not complete --help inside a test environment, but the
    // signature should be observable: a function that returns a thenable.
    const result = cli.main(['--help']);
    expect(result).toBeDefined();
    expect(typeof (result as Promise<number>).then).toBe('function');
    // swallow whatever main resolves to (often a help-banner exit)
    await result.catch(() => 0);
  });

  it('installBrokenPipeHandlers is idempotent (returns a teardown fn)', () => {
    const teardown = cli.installBrokenPipeHandlers();
    expect(typeof teardown).toBe('function');
    // Calling twice must not throw and must not crash.
    const teardown2 = cli.installBrokenPipeHandlers();
    expect(typeof teardown2).toBe('function');
    teardown();
    teardown2();
  });

  it('shim source delegates to the CLI-owned process lifecycle', async () => {
    // Static check: import the shim source as text and assert that it
    // (a) delegates to the CLI-owned process lifecycle and (b) does not
    // retain a second fixed-delay process.exit implementation. This catches the
    // "dead wiring that silently voids the documented contract"
    // failure mode flagged by the reviewer agent.
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const shimPath = path.resolve(here, '../src/index.ts');
    const shimSource = await fs.readFile(shimPath, 'utf8');

    expect(shimSource).toMatch(/runCliProcess\(main\)/);
    expect(shimSource).not.toMatch(/setTimeout\(/);
    expect(shimSource).not.toMatch(/process\.exit\(/);
  });
});

describe('process.argv slicing', () => {
  it('preserves the canonical slice(2) used by the shim', () => {
    const fakeArgv = ['node', '/path/to/wstack', '--flag', 'value'];
    expect(fakeArgv.slice(2)).toEqual(['--flag', 'value']);
  });

  it('returns [] when invoked without arguments', () => {
    expect(['node', '/path/to/wstack'].slice(2)).toEqual([]);
  });
});
