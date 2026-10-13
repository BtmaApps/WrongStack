/**
 * The tools an ACP leader runs itself reach the host as tool cards. No
 * tool_result is ever appended for them, so the finished card says so and
 * carries the result text: the TUI used to wait for that tool_result and
 * never rendered the card.
 */
import { EventBus } from '@wrongstack/core/kernel';
import { describe, expect, it } from 'vitest';
import { ToolCardRelay } from '../src/acp-leader/acp-leader-stream.js';

describe('ToolCardRelay', () => {
  it('marks a settled card as outside the conversation, with the result text', () => {
    const events = new EventBus();
    const done: Array<Record<string, unknown>> = [];
    events.on('tool.executed', (e) => done.push(e as never));
    const relay = new ToolCardRelay(events, { sessionId: 's1', model: 'claude-code' });

    relay.update({ toolCallId: 't1', title: 'Read a.ts', status: 'in_progress' });
    relay.update({
      toolCallId: 't1',
      title: 'Read a.ts',
      status: 'completed',
      output: 'line 1\nline 2',
    });
    relay.update({ toolCallId: 't1', title: 'Read a.ts', status: 'completed' });

    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({
      id: 't1',
      name: 'Read a.ts',
      ok: true,
      outsideConversation: true,
      output: 'line 1\nline 2',
    });
  });

  it('caps a long result and falls back to an object rawOutput', () => {
    const events = new EventBus();
    const outputs: Array<string | undefined> = [];
    events.on('tool.executed', (e) => outputs.push(e.output));
    const relay = new ToolCardRelay(events, { model: 'claude-code' });

    relay.update({ toolCallId: 'a', title: 'big', status: 'completed', output: 'x'.repeat(5_000) });
    relay.update({
      toolCallId: 'b',
      title: 'obj',
      status: 'failed',
      rawOutput: { output: 'boom' },
    });

    expect(outputs[0]).toHaveLength(4_001);
    expect(outputs[0]?.endsWith('…')).toBe(true);
    expect(outputs[1]).toBe('boom');
  });
});
