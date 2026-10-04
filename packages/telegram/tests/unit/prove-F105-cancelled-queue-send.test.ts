import type { Logger } from '@wrongstack/core/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelegramBotOutbound } from '../../src/bot-queue.js';
import type { TelegramBot } from '../../src/bot.js';
import { makeTelegramSendTool } from '../../src/tools/telegram-send.js';
const log: Logger = { level: 'debug', error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), trace: vi.fn(), child() { return this; } };
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.all(cleanups.splice(0).map((cleanup) => cleanup())); });
describe('F105 canceled telegram_send queue proof', () => {
  it('reproduces sending through the real outbound queue after the tool signal was aborted', async () => {
    const sendMessage = vi.fn(async () => ({ ok: true as const, result: { message_id: 1, chat: { id: 123, type: 'private' as const } } }));
    const bot = { sendMessage } as unknown as TelegramBot;
    const outbound = new TelegramBotOutbound({ bot, log });
    cleanups.push(() => outbound.stop());
    const tool = makeTelegramSendTool({ bot, outbound, getDefaultChatId: () => '123', maxMessageLength: 4000, log });
    const controller = new AbortController(); controller.abort();
    await tool.execute({ message: 'do not send after cancellation' }, undefined as never, { signal: controller.signal });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[2]).toBeUndefined();
  });
});


