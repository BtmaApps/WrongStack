import { describe, expect, it } from 'vitest';
import { agentTranscriptToChatMessages } from '../../src/components/ChatView/agentTranscriptMessages.js';
import type { AgentTranscriptEntry } from '../../src/stores/index.js';

/**
 * Subagent transcript → leader chat-message mapping.
 *
 * DOM-free on purpose: the root vitest config runs in the `node` environment
 * and cannot collect the jsdom suites under `packages/webui/tests/components`.
 * The module under test is pure (one runtime import, `expectDefined`, plus
 * type-only imports), so these cases live in their own file owned by the root
 * suite. The WebUI config excludes it to keep collection disjoint. Keeping the two concerns apart is
 * what lets the mapping be covered at the root gate at all — the rendering
 * tests stay in subagent-chat-tabs.test.tsx where their DOM belongs.
 *
 * The cases below target the two decisions that are easy to get subtly wrong
 * and hard to see in the UI: pairing a result with the right call, and
 * attaching reasoning to the reply that produced it.
 */
function entry(
  partial: Partial<AgentTranscriptEntry> & { kind: AgentTranscriptEntry['kind'] },
): AgentTranscriptEntry {
  return {
    id: `e_${partial.kind}_${Math.random().toString(36).slice(2, 8)}`,
    subagentId: 's1',
    agentName: 'Alpha',
    content: partial.content ?? '',
    kind: partial.kind,
    iteration: partial.iteration ?? 1,
    ts: '2026-01-01T00:00:00.000Z',
    toolName: partial.toolName,
    toolOk: partial.toolOk,
  };
}

describe('agentTranscriptToChatMessages', () => {
  describe('result pairing', () => {
    it('does not cross-wire results between same-name calls in one iteration', () => {
      const messages = agentTranscriptToChatMessages([
        entry({ kind: 'tool_use', content: 'grep({"q":"a"})\n{"q":"a"}', toolName: 'grep' }),
        entry({ kind: 'tool_use', content: 'grep({"q":"b"})\n{"q":"b"}', toolName: 'grep' }),
        entry({ kind: 'tool_result', content: 'Completed grep (1ms)\nsecond', toolName: 'grep' }),
      ]);

      // The result belongs to the MOST RECENT matching call, so the first call
      // is still in-flight and only the second completed. Pairing by name
      // alone (first-match) would close the FIRST call instead.
      const tools = messages.filter((m) => m.role === 'tool');
      expect(tools).toHaveLength(2);
      expect(tools[0]?.toolResult).toBeUndefined();
      expect(tools[1]?.toolResult).toBe('second');
    });

    it('does not pair a result across an iteration boundary', () => {
      const messages = agentTranscriptToChatMessages([
        entry({
          kind: 'tool_use',
          content: 'bash({"c":"x"})\n{"c":"x"}',
          toolName: 'bash',
          iteration: 1,
        }),
        entry({
          kind: 'tool_result',
          content: 'Completed bash (1ms)\niter one',
          toolName: 'bash',
          iteration: 2,
        }),
      ]);

      // Different iteration ⇒ no match, so the result renders as its own
      // orphan call rather than completing the previous turn's call.
      const tools = messages.filter((m) => m.role === 'tool');
      expect(tools).toHaveLength(2);
      expect(tools[0]?.toolResult).toBeUndefined();
      expect(tools[1]?.toolResult).toBe('iter one');
    });

    it('consumes a matched call so a second result cannot overwrite it', () => {
      const messages = agentTranscriptToChatMessages([
        entry({ kind: 'tool_use', content: 'bash({"c":"x"})\n{"c":"x"}', toolName: 'bash' }),
        entry({ kind: 'tool_result', content: 'Completed bash (1ms)\nfirst', toolName: 'bash' }),
        entry({ kind: 'tool_result', content: 'Completed bash (1ms)\nsecond', toolName: 'bash' }),
      ]);

      // A call is settled once. Without consuming it on match, the second
      // result would land on the SAME tool message and silently overwrite the
      // first — the transcript would show 'second' with no trace of 'first'.
      const tools = messages.filter((m) => m.role === 'tool');
      expect(tools).toHaveLength(2);
      expect(tools[0]?.toolResult).toBe('first');
      expect(tools[1]?.toolResult).toBe('second');
    });

    it('reads duration, output and failure state off the result summary', () => {
      const [ok, failed] = agentTranscriptToChatMessages([
        entry({ kind: 'tool_use', content: 'bash({"c":"x"})\n{"c":"x"}', toolName: 'bash' }),
        entry({
          kind: 'tool_result',
          content: 'Completed bash (1200ms)\nhello\n\n... 4,096 bytes total',
          toolName: 'bash',
        }),
        entry({
          kind: 'tool_use',
          content: 'bash({"c":"y"})\n{"c":"y"}',
          toolName: 'bash',
          iteration: 2,
        }),
        entry({
          kind: 'tool_result',
          content: 'Failed bash (5ms)\nboom',
          toolName: 'bash',
          iteration: 2,
          toolOk: false,
        }),
      ]);

      expect(ok?.toolDurationMs).toBe(1200);
      // The truncation notice is metadata, not output.
      expect(ok?.toolResult).toBe('hello');
      expect(ok?.toolOutputBytes).toBe(4096);
      expect(ok?.isError).toBe(false);
      expect(failed?.isError).toBe(true);
      expect(failed?.toolResult).toBe('boom');
    });

    it('leaves a call with no result in-flight', () => {
      const messages = agentTranscriptToChatMessages([
        entry({
          kind: 'tool_use',
          content: 'bash({"command":"ls"})\n{"command":"ls"}',
          toolName: 'bash',
        }),
      ]);
      const tool = messages.find((m) => m.role === 'tool');
      // No toolResult is what drives the ledger card's running rail.
      expect(tool?.toolResult).toBeUndefined();
      expect(tool?.isError).toBeUndefined();
    });
  });

  describe('thinking attachment', () => {
    it('attaches reasoning to the reply of the iteration that produced it', () => {
      const messages = agentTranscriptToChatMessages([
        entry({ kind: 'text', content: 'reply' }),
        entry({ kind: 'thinking', content: 'reasoning' }),
        entry({ kind: 'text', content: 'reply 2' }),
        entry({ kind: 'error', content: 'boom' }),
        entry({ kind: 'status', content: 'tick' }),
      ]);

      const byContent = new Map(messages.map((m) => [m.content, m]));
      expect(byContent.get('reply')?.role).toBe('assistant');
      // Reasoning belongs to the reply that FOLLOWS it — the same pairing the
      // leader's own transcript uses. Attaching it to the preceding message
      // (or dropping it) is the defect this pins.
      expect(byContent.get('reply')?.thinkingLog).toBeUndefined();
      expect(byContent.get('reply 2')?.thinkingLog?.text).toBe('reasoning');
      expect(byContent.get('boom')?.isError).toBe(true);
      expect(byContent.get('tick')?.role).toBe('system');
    });

    it('joins consecutive same-iteration reasoning into one log', () => {
      const messages = agentTranscriptToChatMessages([
        entry({ kind: 'thinking', content: 'first thought ', iteration: 1 }),
        entry({ kind: 'thinking', content: 'second thought', iteration: 1 }),
        entry({ kind: 'text', content: 'reply', iteration: 1 }),
      ]);

      // Same iteration = ONE continuous run. Overwriting the buffer would drop
      // 'first thought ' entirely and show only the last chunk; flushing on
      // every entry would split one run into two separate cards.
      const reply = messages.find((m) => m.content === 'reply');
      expect(reply?.thinkingLog?.text).toBe('first thought second thought');
      expect(messages.filter((m) => m.thinkingLog)).toHaveLength(1);
    });

    it('keeps both runs when two iterations reason back to back', () => {
      const messages = agentTranscriptToChatMessages([
        entry({ kind: 'thinking', content: 'iter one reasoning', iteration: 1 }),
        entry({ kind: 'thinking', content: 'iter two reasoning', iteration: 2 }),
        entry({ kind: 'text', content: 'reply', iteration: 2 }),
      ]);

      // A new iteration is a NEW run: the first must be closed out as its own
      // entry rather than overwritten by the second.
      const logs = messages.filter((m) => m.thinkingLog).map((m) => m.thinkingLog?.text);
      expect(logs).toContain('iter one reasoning');
      expect(logs).toContain('iter two reasoning');
      expect(logs).toHaveLength(2);
    });

    it('never attaches reasoning to a reply from a different iteration', () => {
      const messages = agentTranscriptToChatMessages([
        entry({ kind: 'thinking', content: 'iter one reasoning', iteration: 1 }),
        entry({ kind: 'text', content: 'iter two reply', iteration: 2 }),
      ]);

      // Cross-iteration attachment would attribute one turn's private
      // reasoning to another turn's reply.
      const reply = messages.find((m) => m.content === 'iter two reply');
      expect(reply?.thinkingLog).toBeUndefined();
      // It is not dropped either — it surfaces as its own system message.
      const standalone = messages.find((m) => m.thinkingLog?.text === 'iter one reasoning');
      expect(standalone?.role).toBe('system');
    });

    it('keeps trailing reasoning visible when no reply follows', () => {
      const messages = agentTranscriptToChatMessages([
        entry({ kind: 'text', content: 'final answer' }),
        entry({ kind: 'thinking', content: 'still reasoning' }),
      ]);

      // A run in flight must not vanish from the transcript.
      const trailing = messages.find((m) => m.thinkingLog?.text === 'still reasoning');
      expect(trailing).toBeDefined();
      expect(trailing?.role).toBe('system');
    });

    it('does not attach reasoning across an intervening tool call', () => {
      const messages = agentTranscriptToChatMessages([
        entry({ kind: 'thinking', content: 'plan' }),
        entry({ kind: 'tool_use', content: 'bash({"c":"x"})\n{"c":"x"}', toolName: 'bash' }),
        entry({ kind: 'text', content: 'after the tool' }),
      ]);

      // The reply is the continuation of the turn that ran the tool; the
      // pre-tool reasoning is not its own.
      expect(messages.find((m) => m.content === 'after the tool')?.thinkingLog).toBeUndefined();
      expect(messages.find((m) => m.thinkingLog?.text === 'plan')).toBeDefined();
    });
  });

  describe('shape and identity', () => {
    it('maps every transcript kind onto the leader message shape', () => {
      const messages = agentTranscriptToChatMessages([
        entry({ kind: 'text', content: 'reply' }),
        entry({ kind: 'error', content: 'boom' }),
        entry({ kind: 'status', content: 'tick' }),
        entry({ kind: 'system', content: 'sys' }),
      ]);

      const roles = messages.map((m) => `${m.role}:${m.content}`);
      expect(roles).toEqual(['assistant:reply', 'assistant:boom', 'system:tick', 'system:sys']);
    });

    it('reuses the entry id so React keys stay stable across streaming frames', () => {
      const source = [
        entry({ kind: 'text', content: 'a' }),
        entry({ kind: 'tool_use', content: 'bash({"c":"x"})\n{"c":"x"}', toolName: 'bash' }),
      ];
      const messages = agentTranscriptToChatMessages(source);
      // A changing id would remount every row on each streamed frame.
      expect(messages.map((m) => m.id)).toEqual(source.map((e) => e.id));
    });

    it('returns an empty list for an empty transcript', () => {
      expect(agentTranscriptToChatMessages([])).toEqual([]);
    });

    it('degrades a non-JSON tool input to readable text instead of throwing', () => {
      const messages = agentTranscriptToChatMessages([
        entry({
          kind: 'tool_use',
          content: 'grep(plain text query)\nplain text query',
          toolName: 'grep',
        }),
      ]);
      expect(messages[0]?.toolName).toBe('grep');
      expect(messages[0]?.toolInput).toBe('plain text query');
    });
  });
});
