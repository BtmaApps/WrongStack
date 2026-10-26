import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { STREAM_WATCHDOG_DEFAULTS } from '@wrongstack/contracts/types';
import { noOpVault } from '@wrongstack/core/security';
import {
  DEFAULT_HEADERS_TIMEOUT_MS,
  DEFAULT_STREAM_HANG_TIMEOUT_MS,
  resetStreamTimeoutDefaults,
  streamTimeoutDefaults,
} from '@wrongstack/providers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { persistPrefsToConfig } from '../src/server/pref-helpers.js';
import { handlePrefsUpdate, type PrefsHandlerContext } from '../src/server/prefs-handlers.js';
import { projectModelRuntimePrefs } from '../src/server/standalone-pipelines.js';
import type { WSServerMessage } from '../src/server/types.js';

/**
 * The WebUI "Stream timeouts" control writes `streamTimeouts` ({hangTimeoutMs,
 * headersTimeoutMs} in ms, sent whole) and must land in
 * `Config.modelRuntime.streaming` — the same place `/settings stream-watchdog`
 * writes — without clobbering the rest of `modelRuntime`.
 */

const ws = {} as WebSocket;

afterEach(() => resetStreamTimeoutDefaults());

function makeContext() {
  const meta: Record<string, unknown> = {};
  const sent: WSServerMessage[] = [];
  const persist = vi.fn(async () => {});
  const context: PrefsHandlerContext = {
    meta,
    snapshot: () => ({ ...meta }),
    persist,
    pendingConfirms: new Map(),
    send: (_socket, message) => sent.push(message),
    broadcast: () => {},
  };
  return { context, meta, sent, persist };
}

describe('streamTimeouts → modelRuntime.streaming projection', () => {
  it('replaces streaming and keeps reasoning / cache / parameters', () => {
    const current = {
      reasoning: { mode: 'on', effort: 'high' },
      cache: { ttl: '1h' },
      parameters: { topK: 5 },
      streaming: { hangTimeoutMs: 120_000, headersTimeoutMs: 30_000 },
    };
    expect(
      projectModelRuntimePrefs(current, { streamTimeouts: { hangTimeoutMs: 300_000 } }),
    ).toEqual({
      reasoning: { mode: 'on', effort: 'high' },
      cache: { ttl: '1h' },
      parameters: { topK: 5 },
      streaming: { hangTimeoutMs: 300_000 },
    });
  });

  it('drops streaming when both fields are cleared', () => {
    expect(
      projectModelRuntimePrefs(
        { cache: { ttl: '5m' }, streaming: { hangTimeoutMs: 0 } },
        { streamTimeouts: {} },
      ),
    ).toEqual({ cache: { ttl: '5m' } });
  });

  it('leaves modelRuntime alone when the payload does not carry it', () => {
    expect(projectModelRuntimePrefs({ cache: { ttl: '5m' } }, { yolo: true })).toBeUndefined();
  });
});

describe('streamTimeouts persistence', () => {
  it('writes modelRuntime.streaming into the profile config without touching other keys', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-stream-timeouts-'));
    try {
      const configPath = path.join(dir, 'profiles', 'default', 'config.json');
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(
        path.join(dir, 'config.json'),
        JSON.stringify({ version: 1, activeProfile: 'default' }),
        'utf8',
      );
      await fs.writeFile(
        configPath,
        JSON.stringify({ modelRuntime: { reasoning: { preserve: true }, cache: { ttl: '1h' } } }),
        'utf8',
      );
      await persistPrefsToConfig(
        { profileConfigPath: configPath, vault: noOpVault, logger: { warn: vi.fn() } },
        { lock: Promise.resolve() },
        { streamTimeouts: { hangTimeoutMs: 300_000, headersTimeoutMs: 0 } },
      );
      const written = JSON.parse(await fs.readFile(configPath, 'utf8')) as Record<string, unknown>;
      expect(written['modelRuntime']).toEqual({
        reasoning: { preserve: true },
        cache: { ttl: '1h' },
        streaming: { hangTimeoutMs: 300_000, headersTimeoutMs: 0 },
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('streamTimeouts live apply', () => {
  it('installs the new watchdogs for providers built after the write', async () => {
    const state = makeContext();
    await handlePrefsUpdate(state.context, ws, {
      streamTimeouts: { hangTimeoutMs: 300_000, headersTimeoutMs: 0 },
    });
    expect(state.persist).toHaveBeenCalledWith({
      streamTimeouts: { hangTimeoutMs: 300_000, headersTimeoutMs: 0 },
    });
    expect(streamTimeoutDefaults()).toEqual({ hangTimeoutMs: 300_000, headersTimeoutMs: 0 });
    expect(state.meta['streamTimeouts']).toEqual({ hangTimeoutMs: 300_000, headersTimeoutMs: 0 });
  });

  it('puts a cleared field back on the built-in default', async () => {
    const state = makeContext();
    await handlePrefsUpdate(state.context, ws, {
      streamTimeouts: { hangTimeoutMs: 300_000, headersTimeoutMs: 30_000 },
    });
    await handlePrefsUpdate(state.context, ws, { streamTimeouts: { headersTimeoutMs: 30_000 } });
    expect(streamTimeoutDefaults()).toEqual({
      hangTimeoutMs: DEFAULT_STREAM_HANG_TIMEOUT_MS,
      headersTimeoutMs: 30_000,
    });
  });

  it('rejects an out-of-range value without persisting or applying it', async () => {
    const state = makeContext();
    await handlePrefsUpdate(state.context, ws, { streamTimeouts: { hangTimeoutMs: 500 } });
    expect(state.persist).not.toHaveBeenCalled();
    expect(streamTimeoutDefaults().hangTimeoutMs).toBe(DEFAULT_STREAM_HANG_TIMEOUT_MS);
    expect(state.sent[0]).toMatchObject({
      type: 'key.operation_result',
      payload: { success: false },
    });
  });
});

describe('browser-side defaults match the providers', () => {
  it('restates the built-in and slow-backend watchdogs exactly', async () => {
    const floors = await import('../../providers/src/stream-timeout-floors.js');
    expect(STREAM_WATCHDOG_DEFAULTS).toEqual({
      hangTimeoutMs: DEFAULT_STREAM_HANG_TIMEOUT_MS,
      headersTimeoutMs: DEFAULT_HEADERS_TIMEOUT_MS,
      slowBackendHangTimeoutMs: floors.SLOW_BACKEND_HANG_TIMEOUT_MS,
      slowBackendHeadersTimeoutMs: floors.SLOW_BACKEND_HEADERS_TIMEOUT_MS,
    });
  });
});
