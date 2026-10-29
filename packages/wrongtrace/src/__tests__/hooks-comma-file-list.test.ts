import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetWrongTraceGate } from '../gate.js';
import { createWrongTraceHookPair } from '../hooks.js';

/**
 * `replace` takes `files` as a comma-separated string as well as an array.
 * The gate used to treat the whole string as one path, so it checked and
 * locked a file that does not exist (`/cwd/a.ts,b.ts`) and a peer's lock on
 * `a.ts` never denied the edit. The string form must resolve to its first
 * entry, exactly like the array form, splitting the way `replace` does.
 */

const PEER_LOCKED = resolve('a.ts');
let healthQueries: string[];
let lockedPaths: string[];
let originalFetch: typeof fetch;

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
  resetWrongTraceGate();
  healthQueries = [];
  lockedPaths = [];
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const u = new URL(typeof input === 'string' ? input : input.toString());
    if (u.pathname === '/api/health') return json({ status: 'ok', socket_path: '' });
    if (u.pathname === '/api/file/health') {
      const path = u.searchParams.get('path') ?? '';
      healthQueries.push(path);
      return json({
        path,
        health_score: 100,
        is_fragile: false,
        recent_thrashing_count: 0,
        is_locked: path === PEER_LOCKED,
        ...(path === PEER_LOCKED
          ? {
              lock_owner: 'wrongstack:peer-session',
              lock_expires_at: new Date(Date.now() + 600_000).toISOString(),
            }
          : {}),
      });
    }
    if (u.pathname === '/api/guardrail/lock') {
      lockedPaths.push(JSON.parse(String(init?.body ?? '{}')).path);
      return json({ ok: true, status: 'locked' });
    }
    if (u.pathname === '/api/guardrail/unlock') return json({ ok: true, status: 'unlocked' });
    return json({});
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('WrongTrace gate: comma-separated replace file lists', () => {
  it('denies a comma-separated list whose first file a peer has locked', async () => {
    const pair = createWrongTraceHookPair(() => 'me');
    const outcome = await pair.preToolUse({
      toolName: 'replace',
      toolInput: { files: 'a.ts,b.ts' },
    });
    expect(outcome?.action).toBe('deny');
    expect(healthQueries).toEqual([PEER_LOCKED]);
  });

  it('matches the array form for the same list', async () => {
    const pair = createWrongTraceHookPair(() => 'me');
    const outcome = await pair.preToolUse({
      toolName: 'replace',
      toolInput: { files: ['a.ts', 'b.ts'] },
    });
    expect(outcome?.action).toBe('deny');
  });

  it('trims entries and skips empty ones, then claims the real file', async () => {
    const pair = createWrongTraceHookPair(() => 'me');
    const outcome = await pair.preToolUse({
      toolName: 'replace',
      toolInput: { files: ' , b.ts , c.ts' },
    });
    expect(outcome).toEqual({ action: 'allow' });
    expect(lockedPaths).toEqual([resolve('b.ts')]);
  });

  it('keeps a brace-alternation glob as one entry', async () => {
    const pair = createWrongTraceHookPair(() => 'me');
    await pair.preToolUse({
      toolName: 'replace',
      toolInput: { files: 'src/*.{ts,md},other.ts' },
    });
    expect(lockedPaths).toEqual([resolve('src/*.{ts,md}')]);
  });

  it('claims nothing for a list with no entries', async () => {
    const pair = createWrongTraceHookPair(() => 'me');
    const outcome = await pair.preToolUse({ toolName: 'replace', toolInput: { files: ' , ,' } });
    expect(outcome).toBeUndefined();
    expect(healthQueries).toEqual([]);
    expect(lockedPaths).toEqual([]);
  });

  it('releases the lock it claimed for the first entry', async () => {
    const pair = createWrongTraceHookPair(() => 'me');
    await pair.preToolUse({ toolName: 'replace', toolInput: { files: 'b.ts,c.ts' } });
    await pair.postToolUse({ toolName: 'replace', toolInput: { files: 'b.ts,c.ts' } });
    expect(lockedPaths).toEqual([resolve('b.ts')]);
  });
});
