'use client';

import type { ProtocolEnvelope } from '@wrongstack/webui-protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Artifact } from './artifacts';
import { clientId } from './ids';
import {
  draftKey,
  initialState,
  record,
  reduceFrame,
  resolveConfirmation,
  rows,
  type SessionState,
  text,
} from './session';
import { type Connection, VibeTransport } from './transport';

export interface Attachment {
  id: string;
  data: string;
  mediaType: string;
  name: string;
}
interface QueuedMessage {
  mode: 'queue' | 'steer';
  id: string;
  sessionId: string;
  content: string;
  images: Attachment[];
}
export interface DraftRequest {
  id: string;
  sessionId: string;
  text?: string;
  reference?: string;
  images?: Attachment[];
}

export function useSession() {
  const [state, setState] = useState(initialState);
  const current = useRef(state);
  const autoStreak = useRef(new Map<string, number>());
  const ownedRuns = useRef(new Map<string, string>());
  const [connection, setConnection] = useState<Connection>('connecting');
  const [ready, setReady] = useState(false);
  const [sessionTransition, setSessionTransition] = useState('');
  const transition = useRef('');
  const clearingSession = useRef('');
  const [clearGeneration, setClearGeneration] = useState(0);
  const listeners = useRef(new Set<(frame: ProtocolEnvelope) => void>());
  const compacting = useRef(false);
  const [compactPending, setCompactPending] = useState(false);
  const compactTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const subscribe = useCallback((listener: (frame: ProtocolEnvelope) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const queueRef = useRef(queue);
  const steering = useRef<string | null>(null);
  const [pausedQueues, setPausedQueues] = useState(new Map<string, boolean>());
  const pausedRef = useRef(pausedQueues);
  const [draftRequest, setDraftRequest] = useState<DraftRequest | null>(null);
  const treeTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const transport = useRef<VibeTransport | null>(null);
  const requestedModels = useRef(new Set<string>());
  const hasConnected = useRef(false);
  const switching = useRef(false);
  const desiredSession = useRef('');
  const sessionTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const previewTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingModel = useRef(false);
  const [modelPending, setModelPending] = useState(false);
  const modelTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const update = useCallback((fn: (s: SessionState) => SessionState) => {
    current.current = fn(current.current);
    setState(current.current);
  }, []);
  const updateQueue = useCallback((fn: (items: QueuedMessage[]) => QueuedMessage[]) => {
    queueRef.current = fn(queueRef.current);
    setQueue(queueRef.current);
  }, []);
  const setQueuePaused = useCallback((id: string, paused: boolean) => {
    pausedRef.current = new Map(pausedRef.current).set(id, paused);
    setPausedQueues(pausedRef.current);
  }, []);
  const send = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    return transport.current?.send(type, payload) ?? false;
  }, []);
  const notice = useCallback((value: string) => update((s) => ({ ...s, notice: value })), [update]);
  const requestModels = useCallback(
    (provider: string) => {
      if (!provider || requestedModels.current.has(provider)) return;
      if (send('provider.models', { providerId: provider })) requestedModels.current.add(provider);
    },
    [send],
  );
  const refreshWorkspace = useCallback(() => {
    const sessionId = current.current.id;
    if (!sessionId) return;
    send('git.changes', { sessionId });
    send('stats.get', { sessionId });
    for (const type of ['todos.get', 'tasks.get', 'plan.get']) send(type, { sessionId });
  }, [send]);

  useEffect(() => {
    let attemptedRestore = false;
    let initialFallback: ProtocolEnvelope | null = null;
    let savedSession: { id?: unknown; cwd?: unknown } = {};
    try {
      savedSession = record(
        JSON.parse(localStorage.getItem('wrongstack.vibeui.active-session.v1') ?? '{}'),
      );
    } catch {
      /* Optional preference. */
    }
    const handle = (frame: ProtocolEnvelope) => {
      const p = record(frame.payload);
      if (frame.type === 'session.start' && !attemptedRestore) {
        attemptedRestore = true;
        if (
          savedSession.cwd === p.cwd &&
          typeof savedSession.id === 'string' &&
          savedSession.id &&
          savedSession.id !== p.sessionId
        ) {
          initialFallback = frame;
          desiredSession.current = savedSession.id;
          switching.current = true;
          send('session.resume', { id: savedSession.id, sessionId: text(p.sessionId) });
          sessionTimeout.current = setTimeout(() => {
            const fallback = initialFallback;
            initialFallback = null;
            desiredSession.current = '';
            if (fallback) handle(fallback);
          }, 15_000);
          return;
        }
      }
      if (frame.type === 'error' && initialFallback) {
        const fallback = initialFallback;
        initialFallback = null;
        desiredSession.current = '';
        handle(fallback);
      }
      if (
        frame.type === 'session.start' &&
        desiredSession.current &&
        p.sessionId !== desiredSession.current
      )
        return;
      if (
        frame.type !== 'session.start' &&
        typeof p.sessionId === 'string' &&
        current.current.id &&
        p.sessionId !== current.current.id
      )
        return;
      update((s) => {
        const next = reduceFrame(s, frame);
        if (frame.type !== 'run.result') return next;
        const owned =
          typeof p.requestId === 'string' && ownedRuns.current.get(next.id) === p.requestId;
        return owned
          ? next
          : {
              ...next,
              messages: next.messages.map((message) =>
                message.autoEligible ? { ...message, autoEligible: false } : message,
              ),
            };
      });
      for (const listener of listeners.current) listener(frame);
      if (
        frame.type === 'context.compacted' ||
        (frame.type === 'key.operation_result' && p.success === false) ||
        frame.type === 'error'
      ) {
        compacting.current = false;
        setCompactPending(false);
        clearTimeout(compactTimeout.current);
      }
      if ((frame.type === 'error' || frame.type === 'run.result') && current.current.runFailure) {
        const expectedStop =
          frame.type === 'run.result' &&
          p.status === 'aborted' &&
          queueRef.current.some(
            (item) => item.id === steering.current && item.sessionId === current.current.id,
          );
        if (!expectedStop) setQueuePaused(current.current.id, true);
        steering.current = null;
      }
      if (frame.type === 'files.tree') clearTimeout(treeTimeout.current);
      if (frame.type === 'session.start') {
        ownedRuns.current.delete(current.current.id);
        if (clearingSession.current === current.current.id) {
          const cleared = clearingSession.current;
          clearingSession.current = '';
          updateQueue((items) => items.filter((item) => item.sessionId !== cleared));
          setQueuePaused(cleared, false);
          steering.current = null;
          autoStreak.current.delete(cleared);
          try {
            localStorage.removeItem(draftKey(cleared));
          } catch {
            /* Draft stays in memory if storage is unavailable. */
          }
          setDraftRequest(null);
          setClearGeneration((value) => value + 1);
        }
        initialFallback = null;
        try {
          localStorage.setItem(
            'wrongstack.vibeui.active-session.v1',
            JSON.stringify({ id: current.current.id, cwd: current.current.cwd }),
          );
        } catch {
          /* Optional preference. */
        }
        desiredSession.current = '';
        clearTimeout(sessionTimeout.current);
        switching.current = false;
        setReady(true);
        if (transition.current) {
          notice(`Active session changed: ${transition.current}`);
          transition.current = '';
          setSessionTransition('');
        }
        requestModels(current.current.provider);
        send('prefs.get', { sessionId: current.current.id });
        send('modes.list', { sessionId: current.current.id });
        send('session.subscribe', { sessionIds: [current.current.id] });
        send('sessions.list', { sessionId: current.current.id, limit: 30 });
        refreshWorkspace();
      }
      if (frame.type === 'session.run_state' && !switching.current) setReady(true);
      if (frame.type === 'provider.catalog') {
        for (const provider of current.current.providers)
          if (provider.configured) requestModels(provider.id);
      }
      if (frame.type === 'providers.saved') {
        requestedModels.current.clear();
        for (const provider of rows(p.providers)) requestModels(text(provider.id));
        requestModels(current.current.provider);
      }
      if (
        frame.type === 'provider.model_switched' ||
        frame.type === 'session.start' ||
        (frame.type === 'error' && pendingModel.current)
      ) {
        pendingModel.current = false;
        setModelPending(false);
        clearTimeout(modelTimeout.current);
      }
      if (frame.type === 'run.result' || frame.type === 'tool.executed') refreshWorkspace();
      if (frame.type === 'error' && switching.current) {
        clearingSession.current = '';
        transition.current = '';
        setSessionTransition('');
        switching.current = false;
        setReady(true);
      }
    };
    const client = new VibeTransport({
      onMessage: handle,
      onState: (next) => {
        setConnection(next);
        if (next !== 'open') {
          ownedRuns.current.clear();
          setReady(false);
          return;
        }
        requestedModels.current.clear();
        send('providers.saved');
        send('providers.list');
        send('prefs.get');
        if (hasConnected.current && current.current.id) {
          // Replace the transcript with canonical replay after reconnect; never replay user writes.
          desiredSession.current = current.current.id;
          send('session.resume', { id: current.current.id });
        }
        hasConnected.current = true;
      },
    });
    transport.current = client;
    void client.connect();
    return () => {
      transport.current = null;
      hasConnected.current = false;
      client.close();
      clearTimeout(modelTimeout.current);
      clearTimeout(sessionTimeout.current);
      clearTimeout(previewTimeout.current);
      clearTimeout(treeTimeout.current);
      clearTimeout(compactTimeout.current);
    };
  }, [send, update, requestModels, refreshWorkspace, setQueuePaused]);

  const dispatch = useCallback(
    (content: string, images: Attachment[], id = clientId()): boolean => {
      const s = current.current;
      if (!s.id || s.running || switching.current || pendingModel.current || compacting.current)
        return false;
      const delivered = send('user_message', {
        sessionId: s.id,
        id,
        content,
        timestamp: Date.now(),
        ...(images.length
          ? { images: images.map(({ data, mediaType, name }) => ({ data, mediaType, name })) }
          : {}),
      });
      if (!delivered) {
        notice('Connection interrupted. Your message has been kept.');
        return false;
      }
      ownedRuns.current.set(s.id, id);
      update((previous) => ({
        ...previous,
        running: true,
        notice: '',
        runFailure: '',
        messages: [
          ...previous.messages,
          {
            id,
            role: 'user' as const,
            text: content,
            images: images.map(({ data, mediaType }) => ({ data, mediaType })),
          },
        ].slice(-500),
      }));
      return true;
    },
    [send, update, notice],
  );

  const submit = useCallback(
    (content: string, images: Attachment[], mode: 'queue' | 'steer' = 'queue'): boolean => {
      if (!content.trim() && !images.length) return false;
      autoStreak.current.set(current.current.id, 0);
      if (
        connection !== 'open' ||
        !ready ||
        switching.current ||
        pendingModel.current ||
        compacting.current
      )
        return false;
      if (current.current.running) {
        if (
          queueRef.current.filter((item) => item.sessionId === current.current.id).length >= 10 ||
          queueRef.current.length >= 50
        ) {
          notice('The queue is full. Wait for a message to finish.');
          return false;
        }
        if (mode === 'steer' && steering.current) {
          notice('A steer message is already waiting for the run to stop.');
          return false;
        }
        const item: QueuedMessage = {
          id: clientId(),
          sessionId: current.current.id,
          content,
          images,
          mode,
        };
        if (mode === 'steer') {
          if (!send('abort', { sessionId: current.current.id })) return false;
          steering.current = item.id;
          setQueuePaused(current.current.id, false);
          updateQueue((items) => [item, ...items]);
        } else updateQueue((items) => [...items, item]);
        return true;
      }
      return dispatch(content, images);
    },
    [connection, ready, dispatch, notice, updateQueue, send, setQueuePaused],
  );

  useEffect(() => {
    if (
      connection !== 'open' ||
      !ready ||
      state.running ||
      modelPending ||
      switching.current ||
      compactPending
    )
      return;
    if (pausedRef.current.get(state.id)) return;
    const next = queue.find((item) => item.sessionId === state.id);
    if (next && dispatch(next.content, next.images, next.id)) {
      if (steering.current === next.id) steering.current = null;
      updateQueue((items) => items.filter((item) => item.id !== next.id));
    }
  }, [
    connection,
    ready,
    state.running,
    state.id,
    modelPending,
    compactPending,
    queue,
    pausedQueues,
    dispatch,
    updateQueue,
  ]);

  const switchSession = useCallback(
    (id?: string) => {
      if (
        current.current.running ||
        current.current.agents.some((agent) =>
          ['running', 'busy', 'starting', 'spawned', 'working', 'active'].includes(agent.status),
        ) ||
        switching.current ||
        pendingModel.current ||
        compacting.current
      )
        return;
      const ok = id
        ? send('session.resume', { id, sessionId: current.current.id })
        : send('session.new', { sessionId: current.current.id });
      if (ok) {
        const from =
          current.current.sessions.find((session) => session.id === current.current.id)?.title ||
          'Current session';
        const to = id
          ? current.current.sessions.find((session) => session.id === id)?.title || id
          : 'New session';
        transition.current = `${from} → ${to}`;
        setSessionTransition(transition.current);
        desiredSession.current = id ?? '';
        switching.current = true;
        setReady(false);
        sessionTimeout.current = setTimeout(() => {
          desiredSession.current = '';
          switching.current = false;
          setReady(true);
          transition.current = '';
          setSessionTransition('');
          notice('Session did not open. Check the connection and try again.');
        }, 30_000);
      }
    },
    [send, notice],
  );
  const switchModel = useCallback(
    (provider: string, model: string) => {
      const s = current.current;
      if (s.running || pendingModel.current || switching.current || compacting.current) return;
      if (send('model.switch', { sessionId: s.id, provider, model })) {
        pendingModel.current = true;
        setModelPending(true);
        modelTimeout.current = setTimeout(() => {
          pendingModel.current = false;
          setModelPending(false);
          notice('Model switch was not confirmed. Refresh the model list and try again.');
        }, 30_000);
      }
    },
    [send, notice],
  );

  return {
    hasActiveWork:
      state.running ||
      state.agents.some((agent) =>
        ['running', 'busy', 'starting', 'spawned', 'working', 'active'].includes(agent.status),
      ),
    stopAll: () => {
      const s = current.current;
      if (!ready || connection !== 'open' || !s.id || switching.current) return false;
      // Pause before the abort acknowledgement: a queued turn must not restart the fleet.
      setQueuePaused(s.id, true);
      steering.current = null;
      ownedRuns.current.delete(s.id);
      update((previous) => ({
        ...previous,
        messages: previous.messages.map((message) =>
          message.autoEligible ? { ...message, autoEligible: false } : message,
        ),
      }));
      if (!send('abort', { sessionId: s.id })) {
        notice('Stop could not be sent. Reconnect and try again. The message queue is paused.');
        return false;
      }
      notice('Stop requested for this session and its agents. The message queue is paused.');
      return true;
    },
    clearGeneration,
    sessionLocked:
      !ready ||
      connection !== 'open' ||
      state.running ||
      modelPending ||
      compactPending ||
      state.agents.some((agent) =>
        ['running', 'busy', 'starting', 'spawned', 'working', 'active'].includes(agent.status),
      ),
    clearContext: () => {
      const s = current.current;
      if (
        s.running ||
        switching.current ||
        pendingModel.current ||
        compacting.current ||
        s.agents.some((agent) =>
          ['running', 'busy', 'starting', 'spawned', 'working', 'active'].includes(agent.status),
        )
      )
        return false;
      if (!send('context.clear', { sessionId: s.id })) return false;
      clearingSession.current = s.id;
      desiredSession.current = s.id;
      switching.current = true;
      transition.current = `Clearing ${s.sessions.find((item) => item.id === s.id)?.title || 'current session'}`;
      setSessionTransition(transition.current);
      setReady(false);
      clearTimeout(sessionTimeout.current);
      sessionTimeout.current = setTimeout(() => {
        clearingSession.current = '';
        switching.current = false;
        desiredSession.current = '';
        transition.current = '';
        setSessionTransition('');
        setReady(false);
        notice('Clear was not confirmed. Reconnect before sending another message.');
      }, 30000);
      return true;
    },
    state,
    connection,
    ready,
    sessionTransition,
    modelPending,
    compactPending,
    subscribe,
    compactContext: () => {
      if (
        current.current.running ||
        compacting.current ||
        pendingModel.current ||
        switching.current
      )
        return;
      if (!send('context.compact', { sessionId: current.current.id })) return;
      compacting.current = true;
      setCompactPending(true);
      setQueuePaused(current.current.id, true);
      compactTimeout.current = setTimeout(() => {
        compacting.current = false;
        setCompactPending(false);
        notice(
          'Compaction was not confirmed. Refresh context before retrying. The message queue is paused.',
        );
      }, 60_000);
    },
    send,
    submit,
    submitNext: (content: string, ownerId: string, automatic = false) => {
      const s = current.current;
      if (
        s.running ||
        s.runFailure ||
        queueRef.current.some((item) => item.sessionId === s.id) ||
        s.messages
          .slice()
          .reverse()
          .find((message) => message.role === 'assistant')?.id !== ownerId
      )
        return false;
      const count = autoStreak.current.get(s.id) ?? 0;
      const limit = Number(s.prefs.autoProceedMaxIterations) || 0;
      if (
        automatic &&
        (s.prefs.autonomy !== 'auto' || s.prefs.yolo !== true || (limit > 0 && count >= limit))
      )
        return false;
      const accepted = dispatch(content, []);
      if (accepted) autoStreak.current.set(s.id, automatic ? count + 1 : 0);
      return accepted;
    },
    autoLimitReached:
      Number(state.prefs.autoProceedMaxIterations) > 0 &&
      (autoStreak.current.get(state.id) ?? 0) >= Number(state.prefs.autoProceedMaxIterations),
    recordBtw: (content: string) =>
      update((s) => ({
        ...s,
        messages: [
          ...s.messages,
          { id: clientId(), role: 'user' as const, text: content, delivery: 'btw' as const },
        ].slice(-500),
      })),
    notice,
    switchSession,
    switchModel,
    refreshWorkspace,
    draftRequest,
    consumeDraft: (id: string) => setDraftRequest((value) => (value?.id === id ? null : value)),
    prepareDraft: (value: string, images: Attachment[] = []) =>
      setDraftRequest({ id: clientId(), sessionId: current.current.id, text: value, images }),
    referenceFile: (path: string) =>
      setDraftRequest({ id: clientId(), sessionId: current.current.id, reference: path }),
    loadFileTree: () => {
      if (!send('files.tree', { sessionId: current.current.id })) return;
      const owner = current.current.id;
      update((s) => ({ ...s, treeLoading: true, treeError: '' }));
      clearTimeout(treeTimeout.current);
      treeTimeout.current = setTimeout(
        () =>
          update((s) =>
            s.id === owner && s.treeLoading
              ? { ...s, treeLoading: false, treeError: 'File list timed out. Refresh to retry.' }
              : s,
          ),
        10_000,
      );
    },
    renameSession: (id: string, name: string) =>
      send('session.rename', { sessionId: current.current.id, id, name: name.trim() }),
    setEffort: (effort: string) =>
      send('prefs.update', { sessionId: current.current.id, reasoningEffort: effort }),
    queuePaused: pausedQueues.get(state.id) === true,
    toggleQueue: () => setQueuePaused(state.id, !pausedRef.current.get(state.id)),
    moveQueued: (id: string, direction: -1 | 1) =>
      updateQueue((items) => {
        const own = items.filter((item) => item.sessionId === current.current.id);
        const from = own.findIndex((item) => item.id === id);
        const a = own[from];
        const b = own[from + direction];
        if (!a || !b) return items;
        const ai = items.indexOf(a);
        const bi = items.indexOf(b);
        const next = items.slice();
        next[ai] = b;
        next[bi] = a;
        return next;
      }),
    openArtifact: (artifact: Artifact) => {
      const requestId = clientId();
      if (
        !send(artifact.kind === 'image' ? 'files.image' : 'files.read', {
          sessionId: current.current.id,
          filePath: artifact.path,
          requestId,
        })
      )
        return;
      update((s) => ({
        ...s,
        preview: { requestId, artifact, content: '', error: '', loading: true },
      }));
      clearTimeout(previewTimeout.current);
      previewTimeout.current = setTimeout(
        () =>
          update((s) =>
            s.preview?.requestId === requestId && s.preview.loading
              ? {
                  ...s,
                  preview: {
                    ...s.preview,
                    loading: false,
                    error: 'Preview timed out. Open the artifact to retry.',
                  },
                }
              : s,
          ),
        10_000,
      );
    },
    closeArtifact: () => {
      clearTimeout(previewTimeout.current);
      update((s) => ({ ...s, preview: null }));
    },
    decideConfirmation: (decision: 'yes' | 'no') => {
      const confirm = current.current.confirm;
      if (
        confirm &&
        send('tool.confirm_result', { sessionId: current.current.id, id: confirm.id, decision })
      ) {
        update((s) => resolveConfirmation(s, confirm.id));
      }
    },
    queue: queue.filter((item) => item.sessionId === state.id),
    removeQueued: (id: string) => {
      if (steering.current === id) steering.current = null;
      updateQueue((items) => items.filter((item) => item.id !== id));
    },
  };
}

export type SessionController = ReturnType<typeof useSession>;
