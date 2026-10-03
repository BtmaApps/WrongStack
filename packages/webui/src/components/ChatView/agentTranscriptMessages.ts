import { expectDefined } from '@wrongstack/core/utils/expect-defined';
import type { AgentTranscriptEntry, ChatMessage } from '@/stores';

/**
 * Subagent transcript → leader-shaped chat messages.
 *
 * The AGENTS tabs show a subagent's history through the SAME components the
 * leader's own chat uses (buildChatRows → ChatRowView → MessageBubble /
 * ToolGroup / ToolLedgerCard), so an agent's reasoning, model output and tool
 * calls look exactly like the leader screen instead of a parallel set of
 * lookalike cards.
 *
 * That reuse is only sound if the two data shapes agree, and they do not: the
 * fleet store ships a flat, pre-rendered event list where the chat store ships
 * a semantic message list. This module is the one adapter between them, and it
 * is deliberately pure (no React, no store access) so the mapping is
 * unit-testable on its own.
 *
 * Field-by-field, and why:
 *
 *  - `text`     → an assistant message, so its markdown runs through the same
 *                pipeline the leader's replies do.
 *  - `thinking` → `thinkingLog`, which is how the leader already carries
 *                archived reasoning. The leader attaches a log to the assistant
 *                message that FOLLOWS the reasoning, so a run is buffered and
 *                handed to the next text entry of the same iteration. A run
 *                with no reply to attach to is emitted as its own system
 *                message — the exact shape session-replay-handlers.ts produces
 *                for reasoning it cannot time, which renders through the
 *                identical reasoning card.
 *  - `tool_use` → a `role: 'tool'` message with NO `toolResult`, which is how
 *                the leader represents an in-flight call: the ledger card
 *                shows its running rail and spinner. A call whose result never
 *                arrives therefore still reads as in-flight rather than
 *                silently vanishing.
 *  - `tool_result` → merged back into the matching `tool_use` so one call
 *                renders as ONE ledger card (name, input, status, duration,
 *                output) rather than two separate events. An orphan result —
 *                one whose call aged out of the capped ring buffer — still
 *                renders, on its own.
 *  - `error`    → an assistant message with `isError`, so it gets the leader's
 *                error presentation. Callers pass `readOnly` downstream so it
 *                never grows a Retry button aimed at the leader's lane.
 *  - `status` / `system` → system messages, the leader's quiet notice bubble.
 *
 * The server pre-renders tool input and result into text
 * (core/coordination/agent-monitor.ts), so the two parsers below recover the
 * structured fields the leader's cards actually read. They are forgiving by
 * design: a truncated or replayed transcript must degrade to plain text, never
 * throw inside a render.
 */

/** Trailing duration on a result summary line: "Completed bash (1234ms)". */
const DURATION_RE = /\((\d+)ms\)\s*$/;

/** Truncation notice the server appends when it capped the output. */
const BYTES_SUFFIX_RE = /\n\n\.\.\. ([\d,]+) bytes total$/;

/** Result summary prefixes — the server writes `Completed` or `Failed`. */
const FAILED_RE = /^Failed\b/;
const SUMMARY_RE = /^(?:Completed|Failed)\b/;

function parseToolInput(content: string): unknown {
  const newline = content.indexOf('\n');
  const head = newline === -1 ? content : content.slice(0, newline);
  const body = newline === -1 ? '' : content.slice(newline + 1);

  if (body.trim()) {
    try {
      return JSON.parse(body);
    } catch {
      // Not JSON. A string input is stringified raw, so fall through to the
      // one-line preview in the header and recover the argument text from it.
    }
  }

  // Header is `name(<inline preview>)`. Recover the argument text so a
  // non-JSON input still reaches the ledger's input view.
  const open = head.indexOf('(');
  if (open !== -1 && head.endsWith(')')) {
    const inline = head.slice(open + 1, -1).trim();
    if (inline && inline !== '…') return inline;
  }
  return undefined;
}

interface ParsedToolResult {
  ok: boolean;
  durationMs: number | undefined;
  output: string | undefined;
  outputBytes: number | undefined;
}

function parseToolResult(content: string): ParsedToolResult {
  // The server writes `Completed <tool> (Nms)` / `Failed <tool> (Nms)` as the
  // first line and the output after it — but a transcript can also carry a bare
  // output with no summary at all (replayed or hand-assembled entries). Only
  // treat the first line as a summary when it actually looks like one;
  // otherwise the whole string is output, and the call must not be left
  // looking permanently in-flight.
  const firstLine = content.split('\n', 1)[0] ?? '';
  const hasSummary = SUMMARY_RE.test(firstLine.trim());
  const summary = hasSummary ? firstLine.trim() : '';
  const rest = hasSummary ? content.slice(content.indexOf('\n') + 1) : content;

  const duration = DURATION_RE.exec(summary);
  const rawMs = duration?.[1] === undefined ? Number.NaN : Number(duration[1]);

  let body = rest;
  let rawBytes: number | undefined;
  const bytes = BYTES_SUFFIX_RE.exec(rest);
  if (bytes) {
    rawBytes = Number(bytes[1]?.replace(/,/g, '') ?? Number.NaN);
    body = rest.slice(0, bytes.index);
  }

  return {
    // Absent a summary there is no failure signal, so a result is successful
    // unless the server actually wrote `Failed`.
    ok: !FAILED_RE.test(summary),
    durationMs: Number.isFinite(rawMs) ? rawMs : undefined,
    output: body.length > 0 ? body : undefined,
    outputBytes: rawBytes !== undefined && Number.isFinite(rawBytes) ? rawBytes : undefined,
  };
}

/** A tool call still waiting for its result, and where it sits in the output. */
interface PendingTool {
  index: number;
  toolName: string | undefined;
  iteration: number;
}

/** Reasoning with no measured duration — the leader's own replayed shape. */
function thinkingLogOf(entry: AgentTranscriptEntry): NonNullable<ChatMessage['thinkingLog']> {
  return {
    iteration: entry.iteration,
    text: entry.content,
    startedAt: Date.parse(entry.ts) || 0,
    durationMs: 0,
    replayed: true,
  };
}

/**
 * Convert one agent's transcript into the leader's chat message shape.
 *
 * Pure and side-effect free. `entry.id` is reused as the message id so React
 * keys stay stable across re-renders of a streaming agent.
 */
export function agentTranscriptToChatMessages(
  entries: readonly AgentTranscriptEntry[],
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const pendingTools: PendingTool[] = [];
  /** The reasoning run waiting to be attached to the next text entry. */
  let pendingThinking: AgentTranscriptEntry | null = null;
  let previousTs = 0;

  const tsOf = (entry: AgentTranscriptEntry): number => {
    const parsed = Date.parse(entry.ts);
    // An unparsable stamp must not drag the transcript back to 1970 and
    // conjure a bogus day separator; hold the previous position instead.
    const ts = Number.isFinite(parsed) ? parsed : previousTs || Date.now();
    previousTs = Math.max(previousTs, ts);
    return ts;
  };

  /** Emit buffered reasoning as its own system message (leader replay shape). */
  const flushThinking = () => {
    const entry = pendingThinking;
    if (!entry) return;
    pendingThinking = null;
    messages.push({
      id: entry.id,
      role: 'system',
      content: '',
      timestamp: tsOf(entry),
      thinkingLog: thinkingLogOf(entry),
    });
  };

  for (const entry of entries) {
    if (entry.kind === 'thinking') {
      if (pendingThinking && pendingThinking.iteration === entry.iteration) {
        // Same iteration = one continuous run of reasoning, so EXTEND the log.
        // Overwriting here would silently drop everything thought before the
        // last chunk. This mirrors the store's own merge (appendTranscriptEntry
        // concatenates and keeps the later timestamp), so the two layers
        // agree on what one run means.
        const previousThinking: AgentTranscriptEntry = pendingThinking;
        pendingThinking = {
          ...previousThinking,
          content: previousThinking.content + entry.content,
          ts: entry.ts,
        };
      } else {
        // A new iteration is a different run: close the previous one so it is
        // not lost, then start fresh.
        flushThinking();
        pendingThinking = entry;
      }
      continue;
    }

    if (entry.kind === 'text') {
      // Reasoning belongs to the reply that follows it, when both come from
      // the same iteration — exactly how the leader pairs them.
      let thinking: ChatMessage['thinkingLog'];
      if (pendingThinking?.iteration === entry.iteration) {
        thinking = thinkingLogOf(pendingThinking);
        pendingThinking = null;
      } else {
        // Reasoning from an EARLIER iteration is not this reply's. It must
        // still be shown, so emit it as its own entry rather than dropping
        // it on the floor — an agent's private reasoning for one turn is
        // never text belonging to the next.
        flushThinking();
      }
      messages.push({
        id: entry.id,
        role: 'assistant',
        content: entry.content,
        timestamp: tsOf(entry),
        ...(thinking ? { thinkingLog: thinking } : {}),
      });
      continue;
    }

    // Every other kind ends any pending reasoning run.
    flushThinking();

    if (entry.kind === 'tool_use') {
      messages.push({
        id: entry.id,
        role: 'tool',
        content: '',
        timestamp: tsOf(entry),
        toolName: entry.toolName,
        toolInput: parseToolInput(entry.content),
      });
      pendingTools.push({
        index: messages.length - 1,
        toolName: entry.toolName,
        iteration: entry.iteration,
      });
      continue;
    }

    if (entry.kind === 'tool_result') {
      const parsed = parseToolResult(entry.content);
      // Match the most recent unmatched call of the same tool in the same
      // iteration: agents fire several of one tool per turn, and pairing by
      // name alone would cross-wire them.
      let matchAt = -1;
      for (let i = pendingTools.length - 1; i >= 0; i--) {
        const candidate = expectDefined(pendingTools[i]);
        if (candidate.toolName === entry.toolName && candidate.iteration === entry.iteration) {
          matchAt = i;
          break;
        }
      }

      if (matchAt !== -1) {
        const matched = expectDefined(pendingTools[matchAt]);
        const target = expectDefined(messages[matched.index]);
        pendingTools.splice(matchAt, 1);
        target.toolResult = parsed.output;
        target.isError = !parsed.ok;
        if (parsed.durationMs !== undefined) target.toolDurationMs = parsed.durationMs;
        if (parsed.outputBytes !== undefined) target.toolOutputBytes = parsed.outputBytes;
        continue;
      }

      // Orphan result (its call aged out of the capped ring buffer) — still
      // shown, as a completed call with no input.
      messages.push({
        id: entry.id,
        role: 'tool',
        content: '',
        timestamp: tsOf(entry),
        toolName: entry.toolName,
        toolResult: parsed.output,
        isError: !parsed.ok,
        ...(parsed.durationMs !== undefined ? { toolDurationMs: parsed.durationMs } : {}),
        ...(parsed.outputBytes !== undefined ? { toolOutputBytes: parsed.outputBytes } : {}),
      });
      continue;
    }

    if (entry.kind === 'error') {
      messages.push({
        id: entry.id,
        role: 'assistant',
        content: entry.content,
        timestamp: tsOf(entry),
        isError: true,
      });
      continue;
    }

    messages.push({
      id: entry.id,
      role: 'system',
      content: entry.content,
      timestamp: tsOf(entry),
    });
  }

  // Reasoning that arrived after the last reply still has to render.
  flushThinking();
  return messages;
}
