/**
 * Telegram preference settings the WebUI Integrations page can save.
 *
 * The panel writes `tgPollIntervalSec` + `tgChatId`, which land in
 * `Config.extensions.telegram.pollIntervalSec` / `.notifyChatId` — the same
 * two fields `/telegram-settings poll|chat` writes (packages/cli/src/
 * slash-commands/telegram-settings.ts). Neither was reachable from the browser
 * before this; the panel only exposed session-end / delegate / long-tool.
 *
 * The chat half is the part worth locking down. Setting the notification chat
 * is NOT a single-field write, because the CLI pairs the bot with it
 * (`inboundMode`, `allowedUsers`, `allowedChats`) and refuses broadcast targets
 * unless `allowGroupChats` is explicitly enabled. If the server here ever
 * degrades to a bare `notifyChatId` assignment, the two surfaces silently
 * disagree about who may message the agent.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { noOpVault } from '@wrongstack/core/security';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedContextMeta } from '../src/server/context-meta.js';
import {
  type ConfigWriteLockHolder,
  type PrefHelperDeps,
  persistPrefsToConfig,
} from '../src/server/pref-helpers.js';
import { validatePrefsUpdatePayload } from '../src/server/ws-payload-preferences.js';

type Telegram = Record<string, unknown>;

const accepted = (payload: Record<string, unknown>): boolean =>
  validatePrefsUpdatePayload(payload).ok;

/** The same acceptance rule the CLI applies, spelled out per case. */
const CLI_INVALID_CHAT_IDS = ['abc', '0', '-0', '1.5', '9007199254740993', '12abc', '1e4', ''];

describe('telegram preference validation', () => {
  it('accepts a poll interval inside the 1-60 bound the CLI enforces', () => {
    for (const seconds of [1, 2, 30, 60]) {
      expect(accepted({ tgPollIntervalSec: seconds })).toBe(true);
    }
  });

  it.each([0, 61, -1, 1.5, Number.NaN])('rejects poll interval %j', (seconds) => {
    // A rejected key fails the WHOLE payload, so this is why the panel
    // range-checks before calling syncPref.
    expect(accepted({ tgPollIntervalSec: seconds })).toBe(false);
    expect(accepted({ tgPollIntervalSec: 2, tgSessionEnd: true })).toBe(true);
  });

  it('accepts a chat ID shaped like a Telegram target', () => {
    expect(accepted({ tgChatId: '' })).toBe(true);
    expect(accepted({ tgChatId: '12345' })).toBe(true);
    expect(accepted({ tgChatId: '-100123' })).toBe(true);
  });

  it.each(CLI_INVALID_CHAT_IDS.filter((v) => v !== ''))(
    'rejects chat id %j the way the CLI does',
    (value) => {
      expect(accepted({ tgChatId: value })).toBe(false);
    },
  );

  it('rejects a non-string chat id', () => {
    expect(accepted({ tgChatId: 12345 })).toBe(false);
  });
});

describe('telegram preference persistence', () => {
  let dir: string;
  let configPath: string;
  let deps: PrefHelperDeps;
  let holder: ConfigWriteLockHolder;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-tg-prefs-'));
    configPath = path.join(dir, 'profiles', 'default', 'config.json');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    deps = {
      profileConfigPath: configPath,
      vault: noOpVault,
      logger: { warn: vi.fn() },
    };
    holder = { lock: Promise.resolve() };
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  /** Write a seed config, then run one prefs.update payload. */
  async function persist(payload: Record<string, unknown>, telegram?: Telegram): Promise<Telegram> {
    if (telegram) {
      await fs.writeFile(configPath, JSON.stringify({ extensions: { telegram } }), 'utf8');
    }
    await persistPrefsToConfig(deps, holder, payload);
    const written = JSON.parse(await fs.readFile(configPath, 'utf8')) as {
      extensions?: { telegram?: Telegram };
    };
    return written.extensions?.telegram ?? {};
  }

  it('writes the poll interval to the same key the CLI uses', async () => {
    expect(await persist({ tgPollIntervalSec: 7 })).toMatchObject({ pollIntervalSec: 7 });
  });

  it('pairs a private chat exactly like /telegram-settings chat', async () => {
    const tg = await persist({ tgChatId: '12345' }, { allowedOutboundChats: [42, 'bad'] });
    expect(tg).toMatchObject({
      notifyChatId: 12345,
      allowedOutboundChats: [42, 'bad', 12345],
      inboundMode: 'paired',
      allowedUsers: [12345],
      allowedChats: [12345],
    });
  });

  it('does not duplicate an outbound entry already stored as a string', async () => {
    const tg = await persist({ tgChatId: '12345' }, { allowedOutboundChats: ['12345'] });
    expect(tg['allowedOutboundChats']).toEqual(['12345']);
  });

  it('refuses a group target unless allowGroupChats is explicitly true', async () => {
    // A group chat is an outbound BROADCAST target, so the guard is the same
    // one the CLI applies at telegram-settings.ts:204.
    for (const allowGroupChats of [undefined, false, 'yes', 1]) {
      const tg = await persist({ tgChatId: '-100123' }, { allowGroupChats });
      expect(tg['notifyChatId']).toBeUndefined();
      expect(tg['inboundMode']).toBeUndefined();
    }
  });

  it('disables inbound for an allowed group target that has no allowlist', async () => {
    const tg = await persist({ tgChatId: '-100123' }, { allowGroupChats: true });
    expect(tg).toMatchObject({ notifyChatId: -100123, inboundMode: 'disabled' });
    expect(tg['allowedUsers']).toBeUndefined();
  });

  it('keeps allowlist inbound when a group target is added alongside one', async () => {
    const tg = await persist({ tgChatId: '-100123' }, { allowGroupChats: true, allowedUsers: [7] });
    expect(tg).toMatchObject({ inboundMode: 'allowlist', allowedUsers: [7] });
  });

  it('clears the target and drops paired mode, which would otherwise throw', async () => {
    // readTelegramConfig throws on `inboundMode: 'paired'` without a
    // notifyChatId (packages/telegram/src/config.ts:257), so clearing has to
    // unwind the pairing too.
    const tg = await persist(
      { tgChatId: '' },
      { notifyChatId: 12345, inboundMode: 'paired', allowedUsers: [12345] },
    );
    expect(tg['notifyChatId']).toBeUndefined();
    expect(tg['inboundMode']).toBe('disabled');
  });

  it('leaves an explicit non-paired inbound mode alone when clearing', async () => {
    const tg = await persist({ tgChatId: '' }, { notifyChatId: -100, inboundMode: 'allowlist' });
    expect(tg['inboundMode']).toBe('allowlist');
  });

  it('persists the poll interval alongside a chat change in one payload', async () => {
    const tg = await persist({ tgPollIntervalSec: 15, tgChatId: '999' });
    expect(tg).toMatchObject({ pollIntervalSec: 15, notifyChatId: 999 });
  });
});

describe('telegram preference seeding', () => {
  const makeConfig = (overrides: Record<string, unknown> = {}): never =>
    ({
      autonomy: {},
      features: {},
      context: {},
      modelRuntime: {},
      extensions: {},
      ...overrides,
    }) as never;

  it('defaults the poll interval and chat to the Telegram plugin defaults', () => {
    const context = { meta: {} };
    seedContextMeta(makeConfig(), context);
    // Mirrors DEFAULT_CONFIG.pollIntervalSec (packages/telegram/src/config.ts:86).
    expect(context.meta['tgPollIntervalSec']).toBe(2);
    expect(context.meta['tgChatId']).toBe('');
  });

  it('seeds persisted poll interval and chat so the panel agrees on first connect', () => {
    const context = { meta: {} };
    seedContextMeta(
      makeConfig({ extensions: { telegram: { pollIntervalSec: 7, notifyChatId: -100123 } } }),
      context,
    );
    expect(context.meta['tgPollIntervalSec']).toBe(7);
    expect(context.meta['tgChatId']).toBe('-100123');
  });
});
