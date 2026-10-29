/**
 * `user_instructions.get` / `.save`: the WebUI editor for
 * `~/.wrongstack/AGENTS.md` (under WRONGSTACK_HOME, pointed at a temp dir).
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { handleUserInstructions } from '../src/server/user-instructions-handlers.js';

let home: string;
let previousHome: string | undefined;
const ws = {} as WebSocket;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-user-instr-'));
  previousHome = process.env['WRONGSTACK_HOME'];
  process.env['WRONGSTACK_HOME'] = home;
});

afterEach(async () => {
  if (previousHome === undefined) delete process.env['WRONGSTACK_HOME'];
  else process.env['WRONGSTACK_HOME'] = previousHome;
  await fs.rm(home, { recursive: true, force: true });
});

function lastPayload(send: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const message = send.mock.calls.at(-1)?.[1] as { type: string; payload: Record<string, unknown> };
  expect(message.type).toBe('user_instructions');
  return message.payload;
}

describe('handleUserInstructions', () => {
  it('reads a missing file, creates it on save, and refuses a stale revision', async () => {
    const send = vi.fn();
    await handleUserInstructions(ws, 'get', {}, send);
    const empty = lastPayload(send);
    expect(empty).toMatchObject({ exists: false, text: '', mtimeMs: null });

    await handleUserInstructions(ws, 'save', { text: 'Rule: ONE.', baseMtimeMs: null }, send);
    const saved = lastPayload(send);
    expect(saved).toMatchObject({ exists: true, text: 'Rule: ONE.', saved: true });
    expect(await fs.readFile(path.join(home, 'AGENTS.md'), 'utf8')).toBe('Rule: ONE.');

    // A second save from the stale "missing" revision must not clobber it.
    await handleUserInstructions(ws, 'save', { text: 'Rule: TWO.', baseMtimeMs: null }, send);
    expect(lastPayload(send)['error']).toMatch(/changed since it was loaded/);
    expect(await fs.readFile(path.join(home, 'AGENTS.md'), 'utf8')).toBe('Rule: ONE.');
  });

  it('rejects a malformed save', async () => {
    const send = vi.fn();
    await handleUserInstructions(ws, 'save', { text: 42, baseMtimeMs: null }, send);
    expect(lastPayload(send)['error']).toMatch(/Invalid instructions text/);
    await handleUserInstructions(ws, 'save', { text: 'x', baseMtimeMs: 'nope' }, send);
    expect(lastPayload(send)['error']).toMatch(/Invalid instructions revision/);
    await expect(fs.stat(path.join(home, 'AGENTS.md'))).rejects.toThrow();
  });

  it('mirrors the includeGlobalAgents toggle into the config store the reader uses', async () => {
    // The prefs hook writes the RUNTIME config object; `readInclude()` reads
    // the ConfigStore. If the toggle is not mirrored into the store, the save
    // reply and every later read report the pre-toggle value.
    const send = vi.fn();
    let storeState: Record<string, unknown> = {};
    const store = {
      get: () => storeState,
      update: (patch: Record<string, unknown>) => {
        storeState = { ...storeState, ...patch };
      },
    };
    let runtimeConfig: Record<string, unknown> = {};
    const applyPrefs = vi.fn((payload: Record<string, unknown>) => {
      // Stands in for `applyConfigPrefs` → `state.setConfig`: a different
      // holder than the store.
      runtimeConfig = { systemPrompt: { includeGlobalAgents: payload['includeGlobalAgents'] } };
    });

    await handleUserInstructions(
      ws,
      'save',
      { text: 'Rule: ONE.', baseMtimeMs: null, includeGlobalAgents: false },
      send,
      store,
      applyPrefs,
    );
    expect(applyPrefs).toHaveBeenCalledWith({ includeGlobalAgents: false });
    expect(runtimeConfig['systemPrompt']).toMatchObject({ includeGlobalAgents: false });
    expect(storeState['systemPrompt']).toMatchObject({ includeGlobalAgents: false });
    expect(lastPayload(send)['includeGlobalAgents']).toBe(false);

    await handleUserInstructions(ws, 'get', {}, send, store, applyPrefs);
    expect(lastPayload(send)['includeGlobalAgents']).toBe(false);
  });

  it('echoes requestId on both success and error replies for panel request correlation', async () => {
    const send = vi.fn();
    await handleUserInstructions(ws, 'get', { requestId: 'req-get-1' }, send);
    expect(lastPayload(send)['requestId']).toBe('req-get-1');

    await handleUserInstructions(ws, 'save', { requestId: 'req-err-1', text: 42 }, send);
    expect(lastPayload(send)['requestId']).toBe('req-err-1');
  });
});
