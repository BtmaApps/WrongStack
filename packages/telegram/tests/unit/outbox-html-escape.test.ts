import { describe, expect, it, vi } from 'vitest';
import { TelegramOutbox } from '../../src/outbox.js';
import { escapeHtml } from '../../src/text-format.js';

// Regression (bug-hunt round 2): TelegramOutbox attaches parse_mode from the
// hot-appliable `parseMode` config but must HTML-escape the wire text when
// that mode is 'HTML' — Telegram's HTML parse mode rejects unescaped
// literal '<' '>' '&' with HTTP 400 "can't parse entities", which silently
// dropped notifications and failed telegram_send / /telegram:send for any
// message containing an angle bracket or ampersand.

const RAW = 'Deploy check: if a < b && c > d then & halt';

interface CapturedCall {
  chatId: unknown;
  text: string;
  opts: { parseMode?: string } | undefined;
}

function makeCapturingApi(): { api: unknown; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const api = {
    sendMessage: vi.fn(async (chatId: unknown, text: string, opts?: { parseMode?: string }) => {
      calls.push({ chatId, text, opts });
      return { message_id: 1, chat: { id: chatId } };
    }),
    sendMessageWithKeyboard: vi.fn(
      async (chatId: unknown, text: string, _buttons: unknown, opts?: { parseMode?: string }) => {
        calls.push({ chatId, text, opts });
        return { message_id: 1, chat: { id: chatId } };
      },
    ),
    getMe: vi.fn(),
  };
  return { api, calls };
}

const silentLog = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe('TelegramOutbox HTML-mode escaping', () => {
  it('escapes < > & on the wire when getParseMode resolves to HTML', async () => {
    const { api, calls } = makeCapturingApi();
    const outbox = new TelegramOutbox({
      api: () => api as any,
      log: silentLog as any,
      getParseMode: () => 'HTML',
    });

    await outbox.sendMessage(999, RAW);

    expect(calls).toHaveLength(1);
    const sent = calls[0]!;
    expect(sent.opts).toMatchObject({ parseMode: 'HTML' });
    expect(sent.text).toBe(escapeHtml(RAW));
    expect(sent.text).not.toContain('<');
    expect(sent.text).not.toContain('>');
  });

  it('leaves text untouched in plain mode (empty string)', async () => {
    const { api, calls } = makeCapturingApi();
    const outbox = new TelegramOutbox({
      api: () => api as any,
      log: silentLog as any,
      getParseMode: () => '',
    });

    await outbox.sendMessage(999, RAW);

    expect(calls[0]!.text).toBe(RAW);
    expect(calls[0]!.opts).toMatchObject({ parseMode: '' });
  });

  it('leaves text untouched when no getParseMode is provided', async () => {
    const { api, calls } = makeCapturingApi();
    const outbox = new TelegramOutbox({
      api: () => api as any,
      log: silentLog as any,
    });

    await outbox.sendMessage(999, RAW);

    expect(calls[0]!.text).toBe(RAW);
  });

  it('does not apply HTML escaping in MarkdownV2 mode (separate contract)', async () => {
    const { api, calls } = makeCapturingApi();
    const outbox = new TelegramOutbox({
      api: () => api as any,
      log: silentLog as any,
      getParseMode: () => 'MarkdownV2',
    });

    await outbox.sendMessage(999, RAW);

    expect(calls[0]!.text).toBe(RAW);
    expect(calls[0]!.opts).toMatchObject({ parseMode: 'MarkdownV2' });
  });

  it('escapes keyboard-message text under HTML mode too', async () => {
    const { api, calls } = makeCapturingApi();
    const outbox = new TelegramOutbox({
      api: () => api as any,
      log: silentLog as any,
      getParseMode: () => 'HTML',
    });

    await outbox.sendMessageWithKeyboard(
      999,
      RAW,
      [
        { text: '✅ Approve', callback_data: 'approve:x:yes' },
        { text: '❌ Deny', callback_data: 'approve:x:no' },
      ],
      undefined,
    );

    expect(calls).toHaveLength(1);
    const sent = calls[0]!;
    expect(sent.opts).toMatchObject({ parseMode: 'HTML' });
    expect(sent.text).toBe(escapeHtml(RAW));
  });
});

// Regression (bug-hunt round 3): HTML escaping expands text up to 5x
// ('&' -> '&amp;'), while upstream caps (maxMessageLength, Telegram's 4096)
// are enforced on RAW text — so an entity-dense message within every
// configured limit could leave the outbox as a wire payload far past the
// Bot API hard limit of 4096 chars and be rejected (400), silently losing
// notifications. The outbox clamps the escaped wire text to 4096, cutting
// at an entity-safe boundary.
describe('TelegramOutbox HTML-mode wire limit', () => {
  it('clamps entity-dense wire text to the 4096-char hard limit', async () => {
    const { api, calls } = makeCapturingApi();
    const outbox = new TelegramOutbox({
      api: () => api as any,
      log: silentLog as any,
      getParseMode: () => 'HTML',
    });

    await outbox.sendMessage(999, '&'.repeat(4000));

    expect(calls).toHaveLength(1);
    expect(calls[0]!.text.length).toBeLessThanOrEqual(4096);
  });

  it('cuts at an entity boundary (no trailing partial entity)', async () => {
    const { api, calls } = makeCapturingApi();
    const outbox = new TelegramOutbox({
      api: () => api as any,
      log: silentLog as any,
      getParseMode: () => 'HTML',
    });

    // 4000 '&' escape to 20000 chars; 4096 / 5 = 819.2, so a raw 4096-char
    // cut would end inside the 820th '&amp;' — the clamp must drop it.
    await outbox.sendMessage(999, '&'.repeat(4000));

    const wire = calls[0]!.text;
    expect(wire.length).toBeLessThanOrEqual(4096);
    expect(wire.endsWith('&')).toBe(false);
    expect(wire.endsWith(';')).toBe(true);
    expect(wire).toBe('&amp;'.repeat(819));
  });

  it('clamps keyboard-message text under the same wire limit', async () => {
    const { api, calls } = makeCapturingApi();
    const outbox = new TelegramOutbox({
      api: () => api as any,
      log: silentLog as any,
      getParseMode: () => 'HTML',
    });

    await outbox.sendMessageWithKeyboard(
      999,
      '&'.repeat(4000),
      [{ text: '✅ Approve', callback_data: 'approve:x:yes' }],
      undefined,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]!.text.length).toBeLessThanOrEqual(4096);
    expect(calls[0]!.text.endsWith(';')).toBe(true);
  });
});
