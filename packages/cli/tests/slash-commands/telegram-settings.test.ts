import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTelegramSettingsCommand } from '../../src/slash-commands/telegram-settings.js';

type Telegram = Record<string, unknown>;

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

describe('/telegram-settings', () => {
  let dir: string;
  let cfg: Record<string, unknown>;
  let configPath: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-tg-settings-'));
    configPath = path.join(dir, 'default.config.json');
    cfg = { provider: 'p', model: 'm', activeProfile: 'default' };
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const vault = {
    encrypt: (value: string) => `enc:${Buffer.from(value).toString('base64')}`,
    decrypt: (value: string) => Buffer.from(value.replace(/^enc:/, ''), 'base64').toString(),
  };

  function command(overrides: Record<string, unknown> = {}) {
    return buildTelegramSettingsCommand({
      configStore: {
        get: () => cfg,
        update: (patch: Record<string, unknown>) => Object.assign(cfg, patch),
      },
      paths: {
        globalConfig: path.join(dir, 'config.json'),
        profileConfig: (name: string) => path.join(dir, `${name}.config.json`),
      },
      vault,
      ...overrides,
    } as never);
  }

  async function run(args: string, overrides?: Record<string, unknown>): Promise<string> {
    const res = (await command(overrides).run(args, {} as never)) as { message: string };
    return stripAnsi(res.message);
  }

  const telegram = (): Telegram =>
    ((cfg['extensions'] as { telegram?: Telegram } | undefined)?.telegram ?? {}) as Telegram;

  async function seed(tg: Telegram): Promise<void> {
    cfg['extensions'] = { telegram: { ...tg } };
    await fs.writeFile(configPath, JSON.stringify({ extensions: { telegram: tg } }));
  }

  it('shows help without requiring persistence', async () => {
    for (const arg of ['help', '--help', '-h']) {
      expect(await run(arg, { vault: undefined })).toContain('Usage:');
    }
  });

  it('refuses to run without secure persistence', async () => {
    expect(await run('', { vault: undefined })).toContain(
      'secure config persistence not available',
    );
    expect(await run('poll 5', { paths: undefined })).toContain('not available');
  });

  it('renders defaults when nothing is configured', async () => {
    const view = await run('');
    expect(view).toMatch(/session end:\s+off/);
    expect(view).toMatch(/delegate done:\s+on/);
    expect(view).toMatch(/long tool:\s+30000ms/);
    expect(view).toMatch(/poll interval:\s+2s/);
    expect(view).toMatch(/notify chat:\s+not set/);
    expect(view).toContain('No bot token configured');
  });

  it('renders configured values, including a disabled long-tool threshold', async () => {
    await seed({
      notifyOnSessionEnd: true,
      notifyOnDelegate: false,
      longToolThresholdMs: 0,
      pollIntervalSec: 7,
      notifyChatId: -100123,
      botToken: 'secret',
    });
    const view = await run('');
    expect(view).toMatch(/session end:\s+on/);
    expect(view).toMatch(/delegate done:\s+off/);
    expect(view).toMatch(/long tool:\s+off/);
    expect(view).toMatch(/poll interval:\s+7s/);
    expect(view).toMatch(/notify chat:\s+-100123/);
    expect(view).toContain('Bot token configured');
  });

  it.each([
    ['session-end', 'notifyOnSessionEnd'],
    ['delegate', 'notifyOnDelegate'],
  ])('toggles %s and validates its value', async (sub, field) => {
    expect(await run(`${sub} ON`)).toContain(`${sub} → on`);
    expect(telegram()[field]).toBe(true);
    expect(await run(`${sub} off`)).toContain(`${sub} → off`);
    expect(telegram()[field]).toBe(false);
    expect(await run(`${sub} maybe`)).toContain('Usage:');
    expect(await run(sub)).toContain('Usage:');
    const onDisk = JSON.parse(await fs.readFile(configPath, 'utf8'));
    expect(onDisk.extensions.telegram[field]).toBe(false);
  });

  it('toggles both event notifications with all', async () => {
    expect(await run('all on')).toContain('all event notifications → on');
    expect(telegram()).toMatchObject({ notifyOnSessionEnd: true, notifyOnDelegate: true });
    await run('all off');
    expect(telegram()).toMatchObject({ notifyOnSessionEnd: false, notifyOnDelegate: false });
    expect(await run('all')).toContain('Usage:');
  });

  it('sets and disables the long-tool threshold', async () => {
    expect(await run('long-tool')).toContain('Usage:');
    expect(await run('long-tool 15000')).toContain('long-tool → 15000ms');
    expect(telegram()['longToolThresholdMs']).toBe(15000);
    expect(await run('long-tool 0')).toContain('long-tool → 0ms');
    expect(await run('long-tool off')).toContain('long-tool → off');
    expect(telegram()['longToolThresholdMs']).toBe(0);
  });

  it.each(['15s', '-5', '1.5', '1e4', 'abc', '99999999999999999999'])(
    'rejects long-tool %j without persisting',
    async (value) => {
      expect(await run(`long-tool ${value}`)).toContain('Invalid number');
      expect(telegram()['longToolThresholdMs']).toBeUndefined();
    },
  );

  it('accepts the poll bounds and rejects values outside or with junk', async () => {
    expect(await run('poll')).toContain('Usage:');
    expect(await run('poll 1')).toContain('poll → 1s');
    expect(await run('poll 60')).toContain('poll → 60s');
    for (const value of ['0', '61', '2.9', '5s', '-1']) {
      expect(await run(`poll ${value}`)).toContain('Invalid value');
    }
    expect(telegram()['pollIntervalSec']).toBe(60);
  });

  it('pairs a private chat and adds it to the outbound allowlist once', async () => {
    await seed({ allowedOutboundChats: [42, 'bad', { x: 1 }] });
    expect(await run('chat 12345')).toContain('notify chat → 12345');
    expect(telegram()).toMatchObject({
      notifyChatId: 12345,
      allowedOutboundChats: [42, 'bad', 12345],
      inboundMode: 'paired',
      allowedUsers: [12345],
      allowedChats: [12345],
    });
    await run('chat 12345');
    expect(telegram()['allowedOutboundChats']).toEqual([42, 'bad', 12345]);
  });

  it('matches an existing outbound entry stored as a string', async () => {
    await seed({ allowedOutboundChats: ['12345'] });
    await run('chat 12345');
    expect(telegram()['allowedOutboundChats']).toEqual(['12345']);
  });

  it.each(['abc', '0', '-0', '1.5', '9007199254740993'])('rejects chat id %j', async (value) => {
    expect(await run(`chat ${value}`)).toContain('Invalid chat ID');
    expect(telegram()['notifyChatId']).toBeUndefined();
  });

  it('requires a chat argument', async () => {
    expect(await run('chat')).toContain('Usage:');
  });

  it('refuses group targets unless allowGroupChats is explicitly true', async () => {
    await seed({ allowGroupChats: 'yes' });
    expect(await run('chat -100123')).toContain('No configuration was changed.');
    expect(telegram()['notifyChatId']).toBeUndefined();
  });

  it('disables inbound for a group target without an allowlist', async () => {
    await seed({ allowGroupChats: true });
    await run('chat -100123');
    expect(telegram()).toMatchObject({ notifyChatId: -100123, inboundMode: 'disabled' });
    expect(telegram()['allowedUsers']).toBeUndefined();
  });

  it('keeps allowlist inbound for a group target when an allowlist exists', async () => {
    await seed({ allowGroupChats: true, allowedUsers: [7] });
    await run('chat -100123');
    expect(telegram()).toMatchObject({ inboundMode: 'allowlist', allowedUsers: [7] });
  });

  it('suggests known settings for an unknown one', async () => {
    expect(await run('sesion-end on')).toContain('Unknown setting "sesion-end"');
  });

  it('reports a corrupt config file instead of overwriting it', async () => {
    await fs.writeFile(configPath, '{ not json');
    expect(await run('poll 5')).toContain('Settings error');
    expect(await fs.readFile(configPath, 'utf8')).toBe('{ not json');
  });
});
