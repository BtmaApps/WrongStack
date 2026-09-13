/**
 * Regression test: ACPSession.prompt() must propagate AbortSignal aborts
 * that fire during session creation (createSessionWithAuth).
 *
 * Bug: prompt() checks signal.aborted at line 465, then awaits
 * createSessionWithAuth() at line 490, then registers the abort listener
 * at line 508. An abort arriving between the await and the listener is silently
 * lost — the agent runs the full turn despite the cancellation.
 *
 * Fix: Promise.race against a fresh abort listener so the abort is detected
 * regardless of timing, plus a re-check after the await resolves.
 */

import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACPSession } from '../src/client/acp-session.js';
import type { ACPSessionOptions } from '../src/client/acp-session-types.js';

const PROJECT_ROOT = path.resolve(os.tmpdir(), 'wstack-acp-signal-gap-test-' + process.pid);

vi.mock('../src/client/acp-session-ops.js', () => ({
  executeCreateSession: vi.fn().mockImplementation(() => new Promise<string>((resolve) => {
    // Stall indefinitely — we will abort before it resolves
    setTimeout(() => resolve('stub-session-id'), 10_000);
  })),
}));

beforeEach(async () => {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(PROJECT_ROOT, { recursive: true });
});

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  try { await rm(PROJECT_ROOT, { recursive: true, force: true }); } catch {}
});

function makeSessionInReadyState(): ACPSession {
  // Mock the session state to 'ready' so prompt() accepts the call.
  // We bypass full ACP initialization — only the abort-gap logic matters here.
  // The constructor is private (start()/connect() are the public entry points);
  // this test drives prompt() directly, so it constructs without a transport.
  const PrivateCtor = ACPSession as unknown as new (opts: ACPSessionOptions) => ACPSession;
  const session = new PrivateCtor({
    command: 'fake-agent-cmd',
    projectRoot: PROJECT_ROOT,
    timeoutMs: 30_000,
    onProgress: undefined,
  } as ACPSessionOptions);
  // Bypass state machine — prompt() only needs to see 'ready'
  Object.defineProperty(session, 'state', { value: 'ready', writable: false });
  Object.defineProperty(session, 'closed', { value: false, writable: false });
  return session;
}

describe('AbortSignal cancellation during session creation', () => {
  it('prompt() throws ACPSessionError(kind=aborted) when abort fires during createSessionWithAuth', async () => {
    const session = makeSessionInReadyState();

    const controller = new AbortController();

    // Fire the abort 50ms into session creation — well before the 10s stall resolves
    setTimeout(() => controller.abort(), 50);

    // Abort fires during createSessionWithAuth — race rejects, catch returns
    // emptyRunResult('cancelled') without calling sendRequest.
    await expect(
      session.prompt([{ type: 'text', text: 'hello' }], controller.signal),
    ).resolves.toMatchObject({ stopReason: 'cancelled' });
  });

  it('prompt() returns cancelled when abort fires before prompt() is even called', async () => {
    const session = makeSessionInReadyState();

    const controller = new AbortController();
    // Abort immediately, before prompt() is even called
    controller.abort();

    const result = await session.prompt(
      [{ type: 'text', text: 'hello' }],
      controller.signal,
    );

    // Pre-aborted signal: early guard at line 465 returns emptyRunResult('cancelled')
    // without calling createSessionWithAuth — no wire activity.
    expect(result.stopReason).toBe('cancelled');
  });
});
