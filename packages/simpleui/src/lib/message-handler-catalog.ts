import type { AgentMode, ModelDescriptor, ServerMessage } from '../types.js';
import { finiteNumber } from './context-load.js';
import type { MessageHandlerDeps } from './message-handler-deps.js';
import {
  parseCatalogProviders,
  parseSavedProviderIds,
  providersNeedingModels,
} from './model-switch.js';
import type { RefineResultPayload } from './refine-model.js';
import { projectRefineResult } from './refine-model.js';

/*
 * Catalog / picker / refine message handlers for `createMessageHandler`:
 * stateless with respect to the streaming buffer, so they take the deps only.
 */

/** `session.resume_progress` — journal replay progress for the resume indicator. */
export function handleResumeProgressMessage(
  message: ServerMessage,
  deps: MessageHandlerDeps,
): void {
  const payload = message.payload ?? {};
  const sessionId = typeof payload['sessionId'] === 'string' ? payload['sessionId'] : '';
  if (!sessionId) return;
  deps.setResumeProgress?.({
    sessionId,
    stage: typeof payload['stage'] === 'string' ? payload['stage'] : 'open_journal',
    loadedBytes: finiteNumber(payload['loadedBytes']),
    totalBytes: finiteNumber(payload['totalBytes']),
  });
  return;
}

/** `provider.catalog` — provider labels, plus model lists for providers that need one. */
export function handleProviderCatalogMessage(
  message: ServerMessage,
  deps: MessageHandlerDeps,
): void {
  const { activeModelRef, requestedModelsRef, setProviderLabels, requestProviderModels } = deps;
  const payload = message.payload ?? {};
  const entries = parseCatalogProviders(payload);
  const labels: Record<string, string> = {};
  for (const entry of entries) {
    labels[entry.id] = entry.label;
  }
  setProviderLabels(labels);
  for (const id of providersNeedingModels({
    catalog: entries,
    currentProvider: activeModelRef.current?.provider,
    alreadyRequested: requestedModelsRef.current,
  })) {
    requestProviderModels(id);
  }
  return;
}

/** `providers.saved` — request model lists for saved providers not fetched yet. */
export function handleProvidersSavedMessage(
  message: ServerMessage,
  deps: MessageHandlerDeps,
): void {
  const { activeModelRef, requestedModelsRef, requestProviderModels } = deps;
  const payload = message.payload ?? {};
  for (const id of providersNeedingModels({
    savedIds: parseSavedProviderIds(payload),
    currentProvider: activeModelRef.current?.provider,
    alreadyRequested: requestedModelsRef.current,
  })) {
    requestProviderModels(id);
  }
  return;
}

/** `provider.models` — one provider's model list (keeps the active model listed). */
export function handleProviderModelsMessage(
  message: ServerMessage,
  deps: MessageHandlerDeps,
): void {
  const { activeModelRef, setModels } = deps;
  const payload = message.payload ?? {};
  const provider = typeof payload['provider'] === 'string' ? payload['provider'] : '';
  const list = Array.isArray(payload['models'])
    ? payload['models'].flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const item = entry as Record<string, unknown>;
        if (typeof item['id'] !== 'string') return [];
        return [
          {
            id: item['id'],
            name: typeof item['name'] === 'string' ? item['name'] : item['id'],
            contextWindow: finiteNumber(item['contextWindow']) || undefined,
          } satisfies ModelDescriptor,
        ];
      })
    : [];
  if (provider) {
    const active = activeModelRef.current;
    const nextList =
      active?.provider === provider && !list.some((item) => item.id === active.model)
        ? [{ id: active.model, name: active.model }, ...list]
        : list;
    setModels((current) => ({ ...current, [provider]: nextList }));
  }
  return;
}

/** `files.list` — @-file picker matches. */
export function handleFilesListMessage(message: ServerMessage, deps: MessageHandlerDeps): void {
  const { setFileMatches, setFilePickerIndex, setFileSearching } = deps;
  const payload = message.payload ?? {};
  const files = Array.isArray(payload['files'])
    ? payload['files'].filter((file): file is string => typeof file === 'string')
    : [];
  setFileMatches(files);
  setFilePickerIndex(0);
  setFileSearching(false);
  return;
}

/** `modes.list` — agent modes and the active one. */
export function handleModesListMessage(message: ServerMessage, deps: MessageHandlerDeps): void {
  const { setModes, setActiveModeId } = deps;
  const payload = message.payload ?? {};
  const list = Array.isArray(payload['modes'])
    ? payload['modes'].flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const item = entry as Record<string, unknown>;
        if (typeof item['id'] !== 'string') return [];
        return [
          {
            id: item['id'],
            name: typeof item['name'] === 'string' ? item['name'] : item['id'],
            description: typeof item['description'] === 'string' ? item['description'] : undefined,
          } satisfies AgentMode,
        ];
      })
    : [];
  setModes(list);
  if (typeof payload['activeId'] === 'string') setActiveModeId(payload['activeId']);
  return;
}

/** `model.refine_result` — prompt-refine outcome (retry, send, or show). */
export function handleRefineResultMessage(message: ServerMessage, deps: MessageHandlerDeps): void {
  const { refineStateRef, refineEpochRef, socketRef, setRefineState, dispatchUserMessage } = deps;
  const payload = message.payload ?? {};
  const current = refineStateRef.current;
  if (!current) return;
  // No request is in flight during the countdown phase — drop any
  // result that arrives now. A countdown state has no `epoch` stamped
  // yet (the epoch is only attached when the request leaves in
  // `refineStartNow`), so an epoch-based guard alone would silently
  // accept orphans for any state whose epoch field is undefined.
  // This status check is the most direct guard and must come first.
  if (current.status === 'countdown') return;
  // Stale-result guard: if the user flushed the panel mid-flight
  // (startSend → setRefineState(null) → new countdown), the epoch
  // on the incoming state will differ from the epoch we last attached
  // to a `model.refine` request.  Drop the orphan — the state it
  // refers to has been superseded.
  if (current.epoch !== undefined && current.epoch !== refineEpochRef.current) return;
  const action = projectRefineResult(payload as RefineResultPayload, current);
  if (action.kind === 'retry') {
    refineEpochRef.current++;
    setRefineState({ ...action.state, epoch: refineEpochRef.current });
    socketRef.current?.send('model.refine', {
      text: action.state.original,
      timeoutMs: action.timeoutMs,
    });
    return;
  }
  if (action.kind === 'send') {
    setRefineState(null);
    dispatchUserMessage(action.text);
    return;
  }
  setRefineState(action.state);
  return;
}
