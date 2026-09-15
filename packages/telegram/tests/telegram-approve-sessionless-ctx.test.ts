import { describe, expect, it, vi } from 'vitest';
import { makeTelegramApproveTool } from '../src/tools/telegram-approve.js';

/**
 * `ctx?.session.id` guarded only `ctx`: a context without a session (a
 * synthetic MCP or subagent context) threw a TypeError before the approval
 * prompt was ever sent (audit 2026-09-15).
 */
describe('telegram_approve with a context that has no session', () => {
  it('posts the prompt and returns the decision instead of throwing', async () => {
    const awaitApproval = vi.fn(async () => ({
      approved: true,
      fromUser: 'owner',
      fromUserId: 42,
    }));
    const bot = {
      awaitApproval,
      sendMessageWithKeyboard: vi.fn(async () => ({ ok: true, result: { message_id: 7 } })),
      bindApprovalPrompt: vi.fn(() => true),
      cancelApproval: vi.fn(),
    };
    const tool = makeTelegramApproveTool({
      bot: bot as never,
      getDefaultChatId: () => '42',
      maxMessageLength: 4096,
      log: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} } as never,
    });

    const out = await tool.execute({ prompt: 'Deploy?' }, {} as never, {
      signal: new AbortController().signal,
    });

    expect(out).toMatchObject({ approved: true, user_id: 42, prompt_message_id: 7 });
    expect(awaitApproval).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'unknown-session' }),
    );
  });
});
