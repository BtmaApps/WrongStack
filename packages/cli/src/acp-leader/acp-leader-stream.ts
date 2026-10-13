/**
 * Turning an ACP agent's turn into a provider stream (see
 * acp-leader-provider.ts): a push queue the progress callback feeds and the
 * stream drains, the text block bookkeeping, the tool calls the agent runs
 * itself relayed to the host as tool cards, and its failures as typed
 * ProviderErrors.
 */
import type { ACPCapturedToolCall, ACPSessionRunResult } from '@wrongstack/acp';
import type { EventBus } from '@wrongstack/core/kernel';
import type {
  ContentBlock,
  Message,
  ProviderErrorKind,
  StopReason,
  StreamEvent,
  SubagentError,
  Usage,
} from '@wrongstack/core/types';
import { ProviderError } from '@wrongstack/core/types';
import { toErrorMessage } from '@wrongstack/core/utils';

/** A push-to-pull bridge: the agent's progress callback pushes, the stream iterates. */
export class StreamQueue {
  private readonly items: StreamEvent[] = [];
  private wake: (() => void) | undefined;
  private done = false;
  private failure: unknown;

  push(event: StreamEvent): void {
    this.items.push(event);
    this.wake?.();
  }

  end(): void {
    this.done = true;
    this.wake?.();
  }

  fail(err: unknown): void {
    this.failure = err;
    this.end();
  }

  async *drain(): AsyncGenerator<StreamEvent> {
    for (;;) {
      const next = this.items.shift();
      if (next) {
        yield next;
        continue;
      }
      if (this.done) {
        if (this.failure !== undefined) throw this.failure;
        return;
      }
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
      this.wake = undefined;
    }
  }
}

/**
 * Text arrives in chunks across one or more agent messages; each run of text
 * is one content block. Thoughts are not forwarded into the response: an
 * unsigned thinking block in history is rejected by Anthropic's wire if the
 * user later switches the session to a real model.
 */
export class TextBlocks {
  private open = false;
  private index = 0;

  constructor(private readonly queue: StreamQueue) {}

  text(chunk: string): void {
    if (!chunk) return;
    if (!this.open) {
      this.queue.push({ type: 'content_block_start', kind: 'text' });
      this.open = true;
    }
    this.queue.push({ type: 'text_delta', text: chunk });
  }

  close(): void {
    if (!this.open) return;
    this.queue.push({ type: 'content_block_stop', index: this.index++ });
    this.open = false;
  }
}

const OUTPUT_PREVIEW_CHARS = 400;

function outputText(raw: Record<string, unknown> | undefined): string | undefined {
  if (!raw) return undefined;
  const text = typeof raw.output === 'string' ? raw.output : JSON.stringify(raw);
  return text.length > OUTPUT_PREVIEW_CHARS ? `${text.slice(0, OUTPUT_PREVIEW_CHARS)}…` : text;
}

/**
 * The agent's own tool calls as the host's tool cards: `tool.started` once a
 * call is announced, `tool.executed` once it settles. Named by the agent's
 * title ("Read src/a.ts", "git status"), which is what the user needs to see.
 */
export class ToolCardRelay {
  private readonly started = new Map<string, number>();
  private readonly settled = new Set<string>();

  constructor(
    private readonly events: EventBus | undefined,
    private readonly meta: { sessionId?: string | undefined; model: string },
  ) {}

  update(call: ACPCapturedToolCall): void {
    if (!this.events) return;
    const id = call.toolCallId;
    const name = call.title || call.kind || 'tool';
    if (!this.started.has(id)) {
      this.started.set(id, Date.now());
      this.events.emit('tool.started', {
        sessionId: this.meta.sessionId,
        agentId: 'leader',
        name,
        id,
        input: call.rawInput,
        provider: 'acp',
        model: this.meta.model,
      });
    }
    if ((call.status === 'completed' || call.status === 'failed') && !this.settled.has(id)) {
      this.settled.add(id);
      const output = outputText(call.rawOutput);
      this.events.emit('tool.executed', {
        sessionId: this.meta.sessionId,
        agentId: 'leader',
        id,
        name,
        durationMs: Date.now() - (this.started.get(id) ?? Date.now()),
        ok: call.status === 'completed',
        settlement: call.status === 'completed' ? 'completed' : 'failed',
        input: call.rawInput,
        ...(output !== undefined ? { output, outputBytes: Buffer.byteLength(output) } : {}),
      });
    }
  }
}

/** The newest user message's text: the agent keeps its own conversation. */
export function latestUserText(messages: readonly Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== 'user') continue;
    const content = message.content as string | ContentBlock[];
    if (typeof content === 'string') return content;
    const text = content
      .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
      .map((block) => block.text)
      .join('\n\n');
    if (text.trim()) return text;
  }
  return '';
}

export function turnUsage(result: ACPSessionRunResult): Usage {
  const t = result.tokens;
  return t
    ? { input: t.input, output: t.output, cacheRead: t.cacheRead, cacheWrite: t.cacheWrite }
    : { input: 0, output: 0 };
}

export function turnStopReason(result: ACPSessionRunResult): StopReason {
  switch (result.stopReason) {
    case 'max_tokens':
      return 'max_tokens';
    case 'refusal':
      return 'refusal';
    default:
      return 'end_turn';
  }
}

/** The JSON-RPC error an agent answered with, wherever it sits in the cause chain. */
function agentRpcError(
  err: unknown,
): { code: number; message: string; data?: unknown } | undefined {
  let cur: unknown = err;
  for (let depth = 0; depth < 4 && cur; depth++) {
    const c = cur as { code?: unknown; message?: unknown };
    if (typeof c.code === 'number' && typeof c.message === 'string' && !(cur instanceof Error)) {
      return cur as { code: number; message: string; data?: unknown };
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

const PROVIDER_KIND: Partial<
  Record<SubagentError['kind'], { kind: ProviderErrorKind; status: number }>
> = {
  provider_quota: { kind: 'quota_exhausted', status: 429 },
  provider_rate_limit: { kind: 'rate_limit', status: 429 },
  provider_5xx: { kind: 'overloaded', status: 529 },
  provider_auth: { kind: 'auth', status: 401 },
};

/**
 * A failed agent turn as a ProviderError the leader's loop already handles:
 * a spent subscription quota is `quota_exhausted` (the fallback chain moves
 * the session to a WrongStack model), a stall is a timeout, a dead agent a
 * server error. `dead` tells the caller to start a fresh agent next turn.
 */
export function agentTurnError(
  err: unknown,
  agentId: string,
  classify: (
    rpc: { code?: number; message: string; data?: unknown },
    agent: string,
  ) => SubagentError | undefined,
): { error: ProviderError; dead: boolean } {
  const rpc = agentRpcError(err);
  const classified = rpc ? classify(rpc, agentId) : undefined;
  const mapped = classified ? PROVIDER_KIND[classified.kind] : undefined;
  if (classified && mapped) {
    return {
      error: new ProviderError(classified.message, mapped.status, classified.retryable, 'acp', {
        kind: mapped.kind,
        cause: err,
      }),
      dead: false,
    };
  }
  const kind = (err as { kind?: unknown })?.kind;
  const message = `${agentId}: ${toErrorMessage(err)}`;
  if (kind === 'stalled') {
    return {
      error: new ProviderError(message, 408, false, 'acp', { kind: 'timeout', cause: err }),
      dead: true,
    };
  }
  const dead =
    kind === 'agent_died' ||
    kind === 'closed' ||
    kind === 'spawn_failed' ||
    kind === 'init_failed' ||
    kind === 'session_create_failed';
  return {
    error: new ProviderError(message, dead ? 502 : 500, false, 'acp', {
      kind: dead ? 'server' : 'unknown',
      cause: err,
    }),
    dead,
  };
}
