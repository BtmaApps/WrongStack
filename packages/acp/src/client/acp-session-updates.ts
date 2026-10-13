import type { ACPMessage } from '../types/acp-messages.js';
import type {
  AnySessionUpdate,
  PlanEntry,
  ToolCallContent,
  ToolCallStatus,
  ToolKind,
  UsageCost,
} from '../types/acp-v1.js';
import { extractText, isRecord } from './acp-session-content.js';
import type {
  ACPCapturedDiff,
  ACPCapturedToolCall,
  ACPProgressEvent,
} from './acp-session-types.js';

export interface ACPSessionScratch {
  text: string;
  thoughts: string;
  plan?: PlanEntry[];
  usage?: { used: number; size: number; cost?: UsageCost | undefined };
  toolCalls: Map<string, ACPCapturedToolCall>;
  diffs: ACPCapturedDiff[];
  /**
   * Set when a tool call ran after the last message text: the next text
   * chunk starts a new assistant message, not a continuation.
   */
  messageBreak?: boolean;
  /** Diffs already captured, keyed by tool call; agents resend them on update. */
  seenDiffs?: Set<string>;
  /** Tool calls already reported as started (see captureToolCall). */
  announced?: Set<string>;
}

export function createSessionScratch(): ACPSessionScratch {
  return { text: '', thoughts: '', toolCalls: new Map(), diffs: [] };
}

/** Separates two assistant messages that a tool call split apart. */
const MESSAGE_SEPARATOR = '\n\n';

export function handleAcpSessionUpdate(
  msg: ACPMessage,
  scratch: ACPSessionScratch,
  emitProgress: (event: ACPProgressEvent) => void,
): void {
  const update = (msg as { params?: { update?: unknown } }).params?.update;
  if (typeof update !== 'object' || update === null) return;
  const u = update as { sessionUpdate?: string; [k: string]: unknown };
  emitProgress({ type: 'raw', update: u as AnySessionUpdate });
  switch (u.sessionUpdate) {
    case 'agent_message_chunk': {
      const text = extractText(u.content);
      if (text) {
        // Without a separator, "…the checkout path.Now I'll run…" reads as one
        // garbled sentence in the result WrongStack hands back.
        if (scratch.messageBreak && scratch.text && !/\s$/.test(scratch.text)) {
          scratch.text += MESSAGE_SEPARATOR;
        }
        scratch.messageBreak = false;
        scratch.text += text;
        emitProgress({ type: 'message', text });
      }
      return;
    }
    case 'agent_thought_chunk':
    case 'thought_chunk': {
      const text = extractText(u.content);
      if (text) {
        scratch.thoughts += text;
        emitProgress({ type: 'thought', text });
      }
      return;
    }
    case 'tool_call':
    case 'tool_call_update':
      captureToolCall(u, u.sessionUpdate === 'tool_call', scratch, emitProgress);
      return;
    case 'plan':
      if (Array.isArray(u.entries)) {
        scratch.plan = u.entries as PlanEntry[];
        emitProgress({ type: 'plan', entries: u.entries as PlanEntry[] });
      }
      return;
    case 'usage_update': {
      const rateLimit = (u._meta as Record<string, unknown> | undefined)?.['_claude/rateLimit'];
      if (isRecord(rateLimit)) emitProgress({ type: 'rate_limit', info: rateLimit });
      if (
        typeof u.used === 'number' &&
        Number.isFinite(u.used) &&
        u.used >= 0 &&
        typeof u.size === 'number' &&
        Number.isFinite(u.size) &&
        u.size >= 0
      ) {
        const usage = {
          used: u.used,
          size: u.size,
          ...(typeof u.cost === 'object' && u.cost !== null ? { cost: u.cost as UsageCost } : {}),
        };
        scratch.usage = usage;
        emitProgress({ type: 'usage', usage });
      }
      return;
    }
    case 'available_commands_update':
    case 'current_mode_update':
    case 'config_option_update':
    case 'session_info_update':
    case 'user_message_chunk':
    case 'next_edit_suggestions':
    case 'elicitation':
      return;
    default:
      return;
  }
}

function captureToolCall(
  u: { [k: string]: unknown },
  isNew: boolean,
  scratch: ACPSessionScratch,
  emitProgress: (event: ACPProgressEvent) => void,
): void {
  const toolCallId = typeof u.toolCallId === 'string' ? u.toolCallId : '';
  if (!toolCallId) return;
  const prev = scratch.toolCalls.get(toolCallId);
  const record: ACPCapturedToolCall = {
    toolCallId,
    title: typeof u.title === 'string' ? u.title : (prev?.title ?? toolCallId),
    kind: typeof u.kind === 'string' ? (u.kind as ToolKind) : prev?.kind,
    status:
      typeof u.status === 'string'
        ? (u.status as ToolCallStatus)
        : (prev?.status ?? (isNew ? 'pending' : 'in_progress')),
    rawInput: isRecord(u.rawInput) ? u.rawInput : prev?.rawInput,
    rawOutput: isRecord(u.rawOutput) ? u.rawOutput : prev?.rawOutput,
  };
  scratch.toolCalls.set(toolCallId, record);
  if (scratch.text) scratch.messageBreak = true;

  if (Array.isArray(u.content)) {
    for (const c of u.content as ToolCallContent[]) {
      if (c && typeof c === 'object' && c.type === 'diff') {
        // Claude's adapter repeats the edit's diff on the completing update.
        const key = `${toolCallId}\0${c.path}\0${c.oldText ?? ''}\0${c.newText}`;
        scratch.seenDiffs ??= new Set();
        if (scratch.seenDiffs.has(key)) continue;
        scratch.seenDiffs.add(key);
        const diff: ACPCapturedDiff = {
          path: c.path,
          oldText: c.oldText,
          newText: c.newText,
        };
        scratch.diffs.push(diff);
        emitProgress({ type: 'diff', diff });
      }
    }
  }

  // Report a call as started once it says what it does. Claude's adapter
  // opens every call as a bare "Terminal" / "Edit" with no input and sends the
  // command or path in the next update, so announcing on `tool_call` showed
  // live views a row of "Terminal {}". An agent that never sends input is
  // announced at its first update instead.
  scratch.announced ??= new Set();
  if (!scratch.announced.has(toolCallId)) {
    const hasInput = record.rawInput !== undefined && Object.keys(record.rawInput).length > 0;
    if (isNew && !hasInput) return;
    scratch.announced.add(toolCallId);
    emitProgress({ type: 'tool_call', toolCall: record });
    // Announced by an update that already ended the call: report the end too.
    if (isNew || (record.status !== 'completed' && record.status !== 'failed')) return;
  }
  emitProgress({ type: 'tool_call_update', toolCall: record });
}
