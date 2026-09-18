/**
 * `GoalWsHandler` verify phase — the `npx tsc --noEmit` subprocess.
 *
 * Four defects lived here together, none of them covered by the existing
 * goal-ws-handler tests (which run with `verifyTasks: false`):
 *
 *  1. Windows: the command was the literal `npx.cmd`. Since CVE-2024-27980
 *     Node refuses to launch a `.cmd` shim through execFile without a shell
 *     (EINVAL), so the entire verify path was dead on Windows.
 *  2. Any launch failure, the 60 s timeout, or a maxBuffer overrun leaves
 *     stdout+stderr empty while `err` is set — and an empty result was
 *     treated as "no type errors", turning every broken verify into a
 *     silent PASS. Combined with (1) that is a permanent false PASS.
 *  3. No `maxBuffer`, so tsc output on a broken project was truncated at the
 *     1 MiB default.
 *  4. No `buildChildEnv()`, so the subprocess inherited provider API keys and
 *     the vault passphrase (the H-8 / VF-09 hardening applied elsewhere).
 *
 * The verify closure is private to `runGoal`, so this asserts the contract at
 * the source level — the same idiom the repo uses for other "the check must
 * not move back" guards.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../src/server/goal-ws-handler.ts'),
  'utf8',
);

/** The execFile call inside the verify closure, from `execFile(` to its close. */
function verifyExecFileCall(): string {
  const start = SOURCE.indexOf('execFile(', SOURCE.indexOf('maybeVerify.verifyPhase'));
  expect(start, 'expected an execFile call inside the verify phase').toBeGreaterThan(0);
  let i = start + 'execFile('.length;
  let depth = 1;
  while (i < SOURCE.length && depth > 0) {
    const c = SOURCE[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    i++;
  }
  return SOURCE.slice(start, i);
}

describe('goal verify — typecheck subprocess hardening', () => {
  it('never hands execFile a bare .cmd shim', () => {
    expect(SOURCE).not.toContain("'npx.cmd'");
    expect(SOURCE).toContain('buildWin32CmdShimInvocation');
  });

  it('passes the hardened execFile options', () => {
    const call = verifyExecFileCall();
    expect(call, 'windowsHide keeps a console from flashing on Windows').toContain(
      'windowsHide: true',
    );
    expect(call, 'child env must be stripped of secrets').toContain('buildChildEnv()');
    expect(call, 'tsc output on a broken project exceeds the 1 MiB default').toContain('maxBuffer');
  });

  it('does not read an errored-but-empty result as a passing typecheck', () => {
    const call = verifyExecFileCall();
    // An `err` with no output must resolve to a distinguishable marker rather
    // than falling through to `stdout + stderr` (empty ⇒ historically a PASS).
    expect(call).toMatch(/if\s*\(err\s*&&\s*output\.trim\(\)\.length\s*===\s*0\)/);
    expect(call).toContain('typecheck could not complete');
    expect(SOURCE).toContain('[Goal] ');
  });

  it('still treats a missing tsc as a skip rather than a failure', () => {
    const call = verifyExecFileCall();
    expect(call).toContain("code === 'ENOENT'");
    expect(SOURCE).toContain("result.startsWith('[verify] tsc not found')");
  });
});
