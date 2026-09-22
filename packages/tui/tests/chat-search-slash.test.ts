import { describe, expect, it, vi } from 'vitest';
import type { Action } from '../src/app-action-type.js';
import { createChatSearchSlashCommand } from '../src/chat-search-slash.js';

function run(args: string, includeReasoning = true) {
  const dispatch = vi.fn<(action: Action) => void>();
  const cmd = createChatSearchSlashCommand({ dispatch, includeReasoning: () => includeReasoning });
  return { cmd, dispatch, result: cmd.run(args, {} as never) };
}

describe('/chat-search', () => {
  it('is scoped by name and has no generic aliases', () => {
    const { cmd } = run('');
    expect(cmd.name).toBe('chat-search');
    expect(cmd.aliases).toBeUndefined();
  });

  it('opens the bar without a query', async () => {
    const { dispatch, result } = run('   ', false);
    await expect(result).resolves.toEqual({ message: '' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'chatSearchOpen', includeReasoning: false });
  });

  it('opens the bar prefilled with the trimmed query', async () => {
    const { dispatch, result } = run('  parser bug ');
    await result;
    expect(dispatch).toHaveBeenCalledWith({
      type: 'chatSearchOpen',
      query: 'parser bug',
      includeReasoning: true,
    });
  });

  it('caps an oversized query at the validation limit', async () => {
    const { dispatch, result } = run('x'.repeat(5_000));
    await result;
    const action = dispatch.mock.calls[0]?.[0] as { query?: string } | undefined;
    expect(action?.query).toHaveLength(1_000);
  });
});
