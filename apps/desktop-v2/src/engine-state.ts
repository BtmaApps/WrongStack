import type { UserInputRequest } from '@wrongstack/contracts/types';
import { type ComposerAttachment, transcriptAttachments } from './composer-attachments';
import { contentText, entries, record } from './engine-values';
import { parseInputRequest } from './input-form-model';

export { contentText, entries, record } from './engine-values';
export interface EngineEvent {
  type: string;
  payload: Record<string, unknown>;
}
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  attachments?: ComposerAttachment[];
  streamId?: string;
}
export interface ProviderTestRun {
  id: string;
  provider: string;
  total: number;
  results: Record<string, Record<string, unknown>>;
  complete: Record<string, unknown> | null;
}
export interface EngineState {
  hydrating: boolean;
  pendingUserMessages: Record<string, ChatMessage>;
  queue: Array<{ id: string; text: string; addedAt: number; imageCount: number }>;
  drainedPromptIds: string[];
  assists: Record<string, { text: string; status: string; error?: string; appliedEdits?: boolean }>;
  sessionId: string;
  provider: string;
  model: string;
  connected: boolean;
  running: boolean;
  needsSetup: boolean;
  messages: ChatMessage[];
  approvals: Record<string, unknown>[];
  inputs: UserInputRequest[];
  providerTests: Record<string, ProviderTestRun>;
  activity: EngineEvent[];
  results: Record<string, Record<string, unknown>>;
  error: string;
}
export const emptyEngineState: EngineState = {
  hydrating: false,
  pendingUserMessages: {},
  queue: [],
  drainedPromptIds: [],
  assists: {},
  sessionId: '',
  provider: '',
  model: '',
  connected: false,
  running: false,
  needsSetup: true,
  messages: [],
  approvals: [],
  inputs: [],
  providerTests: {},
  activity: [],
  results: {},
  error: '',
};
/** Normalize journal input before it reaches operations or React's state updater. */
export function engineEvent(value: unknown): EngineEvent | null {
  const row = record(value);
  if (typeof row['type'] !== 'string' || !row['type']) return null;
  return { type: row['type'], payload: record(row['payload']) };
}
/** A partial native journal page is not yet authoritative for delivery mode. */
export function replayEngineBatch(
  state: EngineState,
  events: readonly EngineEvent[],
  hasMore: boolean,
): EngineState {
  return { ...events.reduce(reduceEngine, state), hydrating: hasMore };
}
export function reduceEngine(state: EngineState, input: unknown): EngineState {
  const event = engineEvent(input);
  if (!event) return state;
  const p = event.payload;
  // Each native engine is bound to one registered project. Project workflows may
  // be owned by another core session; conversation/permission frames remain lane-scoped.
  const projectFrame = [
    'goal.',
    'goal-state.',
    'sdd.',
    'kanban.',
    'agent-roster.',
    'chronicle.',
    'memory.',
    'mcp.',
    'techstack.',
    'prompts.',
  ].some((prefix) => event.type.startsWith(prefix));
  if (
    event.type !== 'session.start' &&
    !projectFrame &&
    typeof p['sessionId'] === 'string' &&
    state.sessionId &&
    p['sessionId'] !== state.sessionId
  )
    return state;
  let next = { ...state, results: { ...state.results, [event.type]: p } };
  if (event.type.startsWith('code.assist.') && typeof p['requestId'] === 'string') {
    const id = p['requestId'];
    const previous = state.assists[id] ?? { text: '', status: 'running' };
    const run = { ...previous };
    if (event.type === 'code.assist.started') run.status = 'running';
    if (event.type === 'code.assist.delta') run.text += String(p['text'] ?? '');
    if (event.type === 'code.assist.result') {
      run.status = String(p['status']);
      if (typeof p['text'] === 'string') run.text = p['text'];
      if (typeof p['error'] === 'string') run.error = p['error'];
      run.appliedEdits = p['appliedEdits'] === true;
    }
    next.assists = { ...Object.fromEntries(Object.entries(state.assists).slice(-19)), [id]: run };
  }
  if (event.type.startsWith('provider.test.') && typeof p['requestId'] === 'string') {
    const id = p['requestId'];
    const previous = state.providerTests[id] ?? {
      id,
      provider: String(p['providerId'] ?? ''),
      total: Number(p['total'] ?? 0),
      results: {},
      complete: null,
    };
    const run = { ...previous };
    if (event.type === 'provider.test.started') {
      run.provider = String(p['providerId'] ?? '');
      run.total = Number(p['total'] ?? 0);
    }
    if (event.type === 'provider.test.result' && typeof p['modelId'] === 'string')
      run.results = { ...run.results, [p['modelId']]: p };
    if (event.type === 'provider.test.complete') run.complete = p;
    next.providerTests = { ...state.providerTests, [id]: run };
  }
  if (event.type === 'session.start') {
    const id = String(p['sessionId'] ?? '');
    if (state.sessionId && state.sessionId !== id) return state;
    next = {
      ...next,
      sessionId: id,
      provider: String(p['provider'] ?? ''),
      model: String(p['model'] ?? ''),
      connected: true,
      needsSetup:
        typeof p['needsSetup'] === 'boolean'
          ? p['needsSetup']
          : !p['provider'] || p['provider'] === 'unconfigured' || !p['model'],
    };
    if (!state.messages.length && Array.isArray(p['replayMessages'])) {
      next.messages = entries(p['replayMessages'])
        .filter((m) => m['role'] === 'user' || m['role'] === 'assistant')
        .map((m, i) => ({
          id: `replay-${i}`,
          role: m['role'] as ChatMessage['role'],
          text: contentText(m['content']),
          attachments: transcriptAttachments(m['content']),
        }));
    }
  }
  if (
    event.type === 'model.switch_result' &&
    p['success'] === true &&
    typeof p['provider'] === 'string' &&
    typeof p['model'] === 'string'
  ) {
    next.provider = p['provider'];
    next.model = p['model'];
    next.needsSetup = false;
    next.error = '';
  }
  if (event.type === 'desktop.user_message') {
    const id = String(p['id']);
    if (typeof p['requestId'] === 'string') {
      next.pendingUserMessages = {
        ...Object.fromEntries(Object.entries(state.pendingUserMessages).slice(-19)),
        [p['requestId']]: {
          id,
          role: 'user',
          text: contentText(p['content']),
          attachments: transcriptAttachments(p['images']),
        },
      };
      return next;
    }
    if (!state.messages.some((m) => m.id === id))
      next.messages = [
        ...state.messages,
        {
          id,
          role: 'user',
          text: contentText(p['content']),
          attachments: transcriptAttachments(p['images']),
        },
      ];
    next.running = true;
    next.error = '';
  }
  if (
    typeof p['requestId'] === 'string' &&
    state.pendingUserMessages[p['requestId']] &&
    (event.type === 'error' ||
      (event.type === 'key.operation_result' && p['phase'] === 'user_message'))
  ) {
    const pending = state.pendingUserMessages[p['requestId']]!;
    next.pendingUserMessages = { ...state.pendingUserMessages };
    delete next.pendingUserMessages[p['requestId']];
    if (event.type !== 'error' && p['success'] === true) {
      if (!state.messages.some((message) => message.id === pending.id))
        next.messages = [...state.messages, pending];
      next.running = true;
      next.error = '';
    }
  }
  if (event.type === 'queue.state')
    next.queue = entries(p['items'])
      .filter(
        (item) => typeof item['id'] === 'string' && !state.drainedPromptIds.includes(item['id']),
      )
      .map((item) => ({
        id: String(item['id']),
        text: String(item['text'] ?? ''),
        addedAt: Number(item['addedAt'] ?? 0),
        imageCount: Number(item['imageCount'] ?? 0),
      }));
  if (event.type === 'queue.drained') {
    const item = record(p['item']);
    if (typeof item['id'] === 'string') {
      const id = item['id'];
      next.drainedPromptIds = [
        ...state.drainedPromptIds.filter((value) => value !== id).slice(-199),
        id,
      ];
      next.queue = state.queue.filter((value) => value.id !== id);
      if (!state.messages.some((message) => message.id === `queue:${id}`))
        next.messages = [
          ...state.messages,
          {
            id: `queue:${id}`,
            role: 'user',
            text: String(item['text'] ?? ''),
            attachments: transcriptAttachments(item['images']),
          },
        ];
      next.running = true;
      next.error = '';
    }
  }
  if (event.type === 'provider.text_delta') {
    const streamId = String(p['messageId'] ?? 'current');
    const text = contentText(p['text']);
    const previous = state.messages.at(-1);
    // A wire stream ID can be reused after a completed turn. Only append to
    // the active trailing assistant, never to a historical message with that ID.
    next.messages =
      state.running && previous?.role === 'assistant' && previous.streamId === streamId
        ? [...state.messages.slice(0, -1), { ...previous, text: previous.text + text }]
        : [
            ...state.messages,
            {
              id: `assistant:${streamId}:${state.messages.length}`,
              streamId,
              role: 'assistant',
              text,
            },
          ];
    next.running = true;
  }
  if (event.type === 'tool.confirm_needed')
    next.approvals = [...state.approvals.filter((a) => a['id'] !== p['id']), p];
  if (event.type === 'tool.confirm_resolved' || event.type === 'tool.confirm_result')
    next.approvals = state.approvals.filter((a) => a['id'] !== p['id']);
  if (event.type === 'user.input_requested') {
    const request = parseInputRequest(p['request']);
    if (request) next.inputs = [...state.inputs.filter((item) => item.id !== request.id), request];
    else next.error = 'The engine sent an invalid question form. Stop the run or ask it to retry.';
  }
  if (event.type === 'user.input_resolved')
    next.inputs = state.inputs.filter((item) => item.id !== p['requestId']);
  if (event.type === 'run.result') {
    next.running = false;
    if (p['status'] === 'failed')
      next.error = String(record(p['error'])['message'] ?? 'Agent run failed');
  }
  if (
    event.type === 'error' ||
    event.type === 'provider.error' ||
    event.type.endsWith('.error') ||
    event.type.endsWith('_error')
  )
    next.error = String(p['message'] ?? p['description'] ?? 'Engine request failed');
  if (event.type === 'desktop.disconnected') {
    next.connected = false;
    next.running = false;
    next.error = String(p['message'] ?? 'Engine disconnected');
  }
  if (
    event.type.startsWith('tool.') ||
    event.type.startsWith('codemap.') ||
    event.type.startsWith('iteration.') ||
    event.type === 'user.input_resolved' ||
    event.type === 'run.result'
  )
    next.activity = [...state.activity.slice(-199), event];
  return next;
}
