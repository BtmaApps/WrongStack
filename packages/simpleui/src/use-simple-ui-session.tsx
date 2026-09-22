import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FallbackPendingProjection } from './fallback-modal.js';
import { useAgentRoster } from './hooks/use-agent-roster.js';
import { useComposerActions } from './hooks/use-composer-actions.js';
import { useF5Resilience } from './hooks/use-f5-resilience.js';
import { useFileMention } from './hooks/use-file-mention.js';
import { useGlobalShortcuts } from './hooks/use-global-shortcuts.js';
import { useImageAttachments } from './hooks/use-image-attachments.js';
import { useModelCatalog } from './hooks/use-model-catalog.js';
import { usePalette } from './hooks/use-palette.js';
import { useServerOutage } from './hooks/use-server-outage.js';
import { useSettings } from './hooks/use-settings.js';
import { useSimpleMailbox } from './hooks/use-simple-mailbox.js';
import { useSimpleSessionState } from './hooks/use-simple-session-state.js';
import { useSimpleSocket } from './hooks/use-simple-socket.js';
import { useStatusNotice } from './hooks/use-status-notice.js';
import { useStickyScroll } from './hooks/use-sticky-scroll.js';
import { useTabTitle } from './hooks/use-tab-title.js';
import { useTheme } from './hooks/use-theme.js';
import { useWorklists } from './hooks/use-worklists.js';
import { resetAgentNameCache } from './lib/agent-model.js';
import { retainSimpleChatMessages } from './lib/chat-model.js';
import { playChime } from './lib/chime.js';
import { copyText } from './lib/clipboard.js';
import {
  clearComposerDraft,
  pruneStaleComposerDrafts,
  readComposerDraft,
  writeComposerDraft,
} from './lib/composer-draft.js';
import { removeFileMention } from './lib/file-mention.js';
import type { MessageHandlerDeps } from './lib/message-handler.js';
import { createMessageHandler } from './lib/message-handler.js';
import { isVisionModel } from './lib/model-capabilities.js';
import { onPanelActivation } from './lib/panel-events.js';
import { onPersistedWriteFailure } from './lib/persisted.js';
import type { QueuedItem } from './lib/queue-model.js';
import type { RefineState } from './lib/refine-model.js';
import { restoreRefineToComposer } from './lib/refine-restore.js';
import { messageId } from './lib/session-helpers.js';
import { aggregateFileEdits } from './lib/timeline-model.js';
import { agentTranscriptToToolCalls } from './lib/tool-model.js';
import type { PendingUserInputRequest } from './lib/user-input-queue.js';
import type { SimpleSocket } from './lib/ws.js';
import type {
  AgentMode,
  ChatMessage,
  FileEditMeta,
  PendingConfirm,
  ResumeProgressInfo,
  ToolCallInfo,
} from './types.js';
import { useSessionCommandPalette } from './use-session-command-palette.js';

export function useSimpleUiSession() {
  const { theme, resolvedTheme, toggleTheme } = useTheme();
  const {
    session,
    setSession,
    sessions,
    setSessions,
    context,
    setContext,
    sessionStart,
    setSessionStart,
    sessionIdRef,
    activeModelRef,
  } = useSimpleSessionState();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [modes, setModes] = useState<AgentMode[]>([]);
  const [activeModeId, setActiveModeId] = useState('default');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [contextBreakdownOpen, setContextBreakdownOpen] = useState(false);
  const [queue, setQueue] = useState<QueuedItem[]>([]);
  const [refineState, setRefineState] = useState<RefineState | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [userInputRequests, setUserInputRequests] = useState<PendingUserInputRequest[]>([]);
  const [fallbackPending, setFallbackPending] = useState<FallbackPendingProjection | null>(null);
  const [draft, setDraft] = useState('');
  const [fileRefs, setFileRefs] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [resumeProgress, setResumeProgress] = useState<ResumeProgressInfo | null>(null);
  const [activity, setActivity] = useState('');
  const { notice, showNotice: setNotice } = useStatusNotice();
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [consumedNextSteps, setConsumedNextSteps] = useState<Set<string>>(new Set());
  const [updateInfo, setUpdateInfo] = useState<{
    appVersion: string;
    latestVersion: string;
    updateAvailable: boolean;
  }>({ appVersion: '', latestVersion: '', updateAvailable: false });
  const [toolCalls, setToolCalls] = useState<ToolCallInfo[]>([]);
  const socketRef = useRef<SimpleSocket | null>(null);
  const {
    worklists,
    requestWorklist,
    openWorkspacePanel,
    updateTodoStatus,
    updateTaskStatus,
    updatePlanStatus,
  } = useWorklists({ socketRef, sessionIdRef });
  const {
    prefs,
    setPrefs,
    prefsRef,
    settingsOpen,
    setSettingsOpen,
    settingsOpenRef,
    updatePrefs,
    switchAutonomy,
    resetPrefs,
    isAtDefaults,
  } = useSettings({ socketRef });
  const [diffFiles, setDiffFiles] = useState<FileEditMeta[] | null>(null);
  /** Provider ids already asked for their model list — catalog + saved overlap. */
  const requestedModelsRef = useRef<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const draftRef = useRef('');
  const fileRefsRef = useRef<string[]>([]);
  const runningRef = useRef(false);
  // handleServerMessage is a stable []-callback, so the drain and refine
  // paths it triggers read live state through refs rather than closing over
  // a stale render.
  const refineStateRef = useRef<RefineState | null>(null);
  /** Monotonically increasing epoch attached to each `model.refine` request
   *  so the handler can detect and drop stale results that arrive after the
   *  user flushed the panel and started a new round-trip. */
  const refineEpochRef = useRef(0);
  /** Stash the original text when kicking off a refine round-trip so the
   *  socket send can happen post-commit in a useEffect, decoupling the
   *  send from the setRefineState updater and preventing a race where the
   *  status flips to 'refining' without a request in flight. */
  const pendingSendRef = useRef<string | null>(null);
  /** One-shot guard for refineStartNow. The RefinePanel's `countdownFiredRef`
   *  only protects the timer-path effect; a click racing the timer (or
   *  StrictMode double-invoke) can call refineStartNow twice in the same
   *  batch, and `refineStateRef.current` does not update between those two
   *  calls. Without this guard the second call would bump the epoch again
   *  (making the eventual result look stale → spinner stuck forever) and
   *  re-stash `pendingSendRef` after the effect already consumed it
   *  (leaking a duplicate `model.refine` on the next unrelated refineState
   *  change). Reset at the start of every countdown round by startSend. */
  const refineStartFiredRef = useRef(false);
  const queueRef = useRef<QueuedItem[]>([]);
  const attachedImagesRef = useRef<{ data: string; mime: string; name: string; id: string }[]>([]);
  const pendingConfirmRef = useRef<PendingConfirm | null>(null);
  pendingConfirmRef.current = pendingConfirm;
  draftRef.current = draft;
  fileRefsRef.current = fileRefs;
  runningRef.current = running;
  refineStateRef.current = refineState;
  queueRef.current = queue;

  // Refs for the global keyboard shortcut handler — read live state
  // without re-registering the keydown listener on every render.
  const messagesRef = useRef<ChatMessage[]>([]);
  const diffFilesRef = useRef<FileEditMeta[] | null>(null);
  messagesRef.current = messages;
  diffFilesRef.current = diffFiles;
  const {
    mailboxStore,
    mailboxOpen,
    setMailboxOpen,
    mailboxOpenRef,
    mailboxUnreadCount,
    refreshMailbox,
    sendMailboxMessage,
    handleMailboxAction,
    applyMailboxMessage,
  } = useSimpleMailbox({ socketRef, setNotice, prefsRef });

  // Settings, context, mailbox, file diff, and the independently mounted
  // utility panels share one exclusive surface rule. A newly activated panel
  // must not leave a prior drawer alive underneath its overlay.
  useEffect(() => {
    return onPanelActivation((panel) => {
      if (panel !== 'open-settings') setSettingsOpen(false);
      if (panel !== 'open-context-breakdown') setContextBreakdownOpen(false);
      if (panel !== 'open-mailbox') setMailboxOpen(false);
    });
  }, [setContextBreakdownOpen, setMailboxOpen, setSettingsOpen]);

  // Tab-strip presence: running marker + unread mailbox count (D10).
  useTabTitle({ running, unreadCount: mailboxUnreadCount });

  /** Send a message to the agent and reflect it locally. The single send
   *  path — the composer, the queue drain, and every refine decision all
   *  funnel through here.
   *
   *  Returns `true` when the message was actually dispatched, `false` when it
   *  was dropped (no session, empty content, or no live socket). Callers that
   *  advance a queue MUST gate on this: a drop must not consume the queued
   *  item, or the user's held message is silently lost. */
  const dispatchUserMessage = useCallback(
    (content: string, images?: { data: string; mime: string; mediaType?: string }[]): boolean => {
      const sessionId = sessionIdRef.current;
      const socket = socketRef.current;
      if ((!content && (!images || images.length === 0)) || !sessionId || !socket) return false;
      setMessages((current) =>
        retainSimpleChatMessages([
          ...current,
          {
            id: messageId('user'),
            role: 'user',
            text: content,
            // Live entries need a real timestamp or the timeline orders them
            // against tool calls incorrectly (see ChatMessageList).
            ts: new Date().toISOString(),
            ...(images && images.length > 0 ? { images } : {}),
          },
        ]),
      );
      setRunning(true);
      setToolCalls([]);
      setActivity('Thinking');
      const payload: Record<string, unknown> = {
        sessionId,
        id: messageId('prompt'),
        content,
        timestamp: Date.now(),
      };
      if (images && images.length > 0) payload['images'] = images;
      socket.send('user_message', payload);
      return true;
    },
    [],
  );

  /** Open the refine round-trip, or send straight through when refine is off. */
  const startSend = useCallback(
    (content: string, images?: { data: string; mime: string; mediaType?: string }[]) => {
      // Flush any pending refine state before starting a new one.  If a
      // previous send is still in countdown/refining, dispatch its original
      // immediately so the user's first message isn't silently dropped.
      // Increment the epoch so any in-flight model.refine result is
      // recognised as stale and dropped by the message handler.
      // Note: auto-dispatch is restricted to countdown/refining — for
      // 'ready'/'failed' the user has already seen the panel and may be
      // reviewing or deciding what to do, so we must not silently
      // re-send the unrefined original.
      const pending = refineStateRef.current;
      if (pending && (pending.status === 'countdown' || pending.status === 'refining')) {
        refineEpochRef.current++;
        // Null the ref synchronously — refineStateRef.current is otherwise
        // only refreshed on commit, so between here and the setRefineState
        // commit a same-tick Escape/decision handler would still see the
        // flushed state and could dispatch the original a second time.
        refineStateRef.current = null;
        setRefineState(null);
        dispatchUserMessage(pending.original, pending.images);
      }
      // Reset the one-shot refineStartNow guard so the new countdown round
      // can fire once on timer-zero / "Refine now" click.
      refineStartFiredRef.current = false;

      if (!prefsRef.current.enhanceEnabled) {
        dispatchUserMessage(content, images);
        return;
      }
      const active = activeModelRef.current;
      const profileRef = prefsRef.current.refinerFallbackProfile
        ? prefsRef.current.fallbackProfiles[prefsRef.current.refinerFallbackProfile]?.[0]
        : undefined;
      const slash = profileRef?.indexOf('/') ?? -1;
      const displayedProvider = profileRef
        ? slash > 0
          ? profileRef.slice(0, slash)
          : active?.provider
        : prefsRef.current.refinerProvider || active?.provider;
      const displayedModel = profileRef
        ? slash > 0
          ? profileRef.slice(slash + 1)
          : profileRef
        : prefsRef.current.refinerModel || active?.model;
      // Reset the one-shot guard so the new countdown round can fire
      // refineStartNow. Without this, a second startSend while a previous
      // refine is still in-flight would leave refineStartFiredRef=true and
      // the new message would never be refined.
      refineStartFiredRef.current = false;
      // Open with a 3-2-1 grace countdown (mirrors the WebUI): the refine
      // request itself is deferred until the countdown elapses or the user
      // clicks "Refine now" — refineStartNow fires it.
      setRefineState({
        original: content,
        refined: content,
        english: content,
        status: 'countdown',
        provider: displayedProvider,
        model: displayedModel,
        images,
      });
    },
    [dispatchUserMessage],
  );

  /** Countdown elapsed (or "Refine now") — kick off the refine round-trip. */
  const refineStartNow = useCallback(() => {
    const cur = refineStateRef.current;
    if (cur?.status !== 'countdown' || !cur.original) return;
    if (refineStartFiredRef.current) return;
    refineStartFiredRef.current = true;
    refineEpochRef.current++;
    pendingSendRef.current = cur.original;
    setRefineState((prev) =>
      prev?.status === 'countdown'
        ? { ...prev, status: 'refining', epoch: refineEpochRef.current }
        : prev,
    );
  }, []);

  /** Send a user-edited version of the refined text straight through. */
  const refineSendEdited = useCallback(
    (text: string) => {
      if (!text) return;
      // 'Send edited' exits the refine round-trip like every other decision —
      // replay the images captured with the original send instead of dropping
      // them (refineDecision, Escape-restore and the pending flush all do).
      const images = refineStateRef.current?.images;
      setRefineState(null);
      if (images?.length) dispatchUserMessage(text, images);
      else dispatchUserMessage(text);
    },
    [dispatchUserMessage],
  );

  /** Post-commit: fire the model.refine send when the status transitions
   *  to 'refining'. The original text is stashed in pendingSendRef by
   *  refineStartNow so the send is driven by the committed state, not by
   *  a side effect inside the setState updater. */
  useEffect(() => {
    const text = pendingSendRef.current;
    if (text) {
      pendingSendRef.current = null;
      socketRef.current?.send('model.refine', { text });
    }
  }, [refineState]);

  // F5 / tab-close resilience: exit confirmation + draft flush.
  useF5Resilience({
    confirmExitRef: prefsRef,
    runningRef,
    sessionIdRef,
    draftRef,
    fileRefsRef,
    writeComposerDraft,
  });

  useEffect(() => {
    if (!copiedMessageId) return;
    const timer = setTimeout(() => setCopiedMessageId(null), 1_800);
    return () => clearTimeout(timer);
  }, [copiedMessageId]);

  /** Ask the server for a provider's model list, at most once per provider. */

  const {
    setSubagents,
    agentTranscripts,
    setAgentTranscripts,
    setSelectedAgentId,
    agentTabs,
    liveAgentTabs,
    finishedAgentTabs,
    activeAgentId,
    activeAgent,
    leaderSelected,
  } = useAgentRoster({ running });

  const {
    setModels,
    providerLabels,
    setProviderLabels,
    groupedModels,
    selectedModel,
    pendingModelSwitch,
    selectModel,
    confirmModelSwitch,
    cancelModelSwitch,
    requestProviderModels,
  } = useModelCatalog({
    session,
    contextMaxContext: context.maxContext,
    running,
    socketRef,
    requestedModelsRef,
  });

  const visionSupported = isVisionModel(session?.model ?? '');

  const {
    fileMention,
    setFileMention,
    fileMatches,
    setFileMatches,
    filePickerIndex,
    setFilePickerIndex,
    fileSearching,
    setFileSearching,
  } = useFileMention({ socketRef });

  const { attachedImages, attachImages, removeImage, setAttachedImages, rejectedImages } =
    useImageAttachments();
  attachedImagesRef.current = attachedImages;

  useEffect(() => {
    if (rejectedImages.length > 0) {
      const first = rejectedImages[0];
      setNotice({
        id: messageId('notice'),
        text: `Image rejected: ${first?.name} (${first?.reason})`,
        tone: 'error',
      });
    }
  }, [rejectedImages, setNotice]);

  const { palette, setPalette } = usePalette();

  const { submitWith, refineDecision, refineRetry, refineRetryFallback, abort } =
    useComposerActions({
      sessionIdRef,
      socketRef,
      draftRef,
      fileRefsRef,
      refineStateRef,
      refineEpochRef,
      draft,
      fileRefs,
      running,
      startSend,
      dispatchUserMessage,
      setQueue,
      setDraft,
      setFileRefs,
      setAttachedImages,
      attachedImagesRef,
      setRefineState,
    });
  /** Live mirror of the composer dispatcher — the global Ctrl/Cmd+Enter
   *  shortcut delegates here so both paths share ONE send implementation. */
  const submitWithRef = useRef(submitWith);
  submitWithRef.current = submitWith;

  /** Answer the pending permission prompt on the wire and clear it. Reads
   *  through pendingConfirmRef (not the render closure) so the dispatch is
   *  correct regardless of when the ref mirror last refreshed. */
  const decideConfirm = (
    decision: 'yes' | 'no' | 'always' | 'always-exact' | 'always-command' | 'always-tool',
  ) => {
    const confirm = pendingConfirmRef.current;
    if (!confirm) return;
    socketRef.current?.send('tool.confirm_result', {
      sessionId: sessionIdRef.current ?? undefined,
      id: confirm.id,
      decision,
    });
    setPendingConfirm(null);
  };
  /** Mirror for the global Y/N/A shortcut — decideConfirm is recreated per
   *  render, and the shortcut listener must not re-register on every render. */
  const decideConfirmRef = useRef<
    | ((
        decision: 'yes' | 'no' | 'always' | 'always-exact' | 'always-command' | 'always-tool',
      ) => void)
    | undefined
  >(undefined);
  decideConfirmRef.current = decideConfirm;

  /** Countdown "Edit": hand the message back to the composer instead of
   *  sending it. The panel is the only place the text lives at that point
   *  (submitWith flushed draft + images before the round-trip), so this runs
   *  the same restore the global Escape shortcut does — one path, two
   *  triggers, no drift. */
  const refineEditInComposer = useCallback(() => {
    restoreRefineToComposer({
      refineStateRef,
      setRefineState,
      refineEpochRef,
      refineStartFiredRef,
      draftRef,
      setDraft,
      setAttachedImages,
      textareaRef,
    });
  }, [setRefineState, setDraft, setAttachedImages]);

  useGlobalShortcuts({
    socketRef,
    sessionIdRef,
    diffFilesRef,
    setDiffFiles,
    settingsOpenRef,
    setSettingsOpen,
    mailboxOpenRef,
    setMailboxOpen,
    refineStateRef,
    setRefineState,
    refineEpochRef,
    refineStartFiredRef,
    draftRef,
    setDraft,
    setAttachedImages,
    textareaRef,
    setCommandPaletteOpen,
    runningRef,
    messagesRef,
    submitWithRef,
    pendingConfirmRef,
    decideConfirmRef,
  });

  const {
    scrollRef,
    showJumpToLatest,
    setShowJumpToLatest,
    jumpToLatest,
    onScroll: onScrollSticky,
    stickToBottomRef,
  } = useStickyScroll({ messages, activity, pendingConfirm });

  const handlerDeps: MessageHandlerDeps = {
    prefsRef,
    draftRef,
    fileRefsRef,
    queueRef,
    sessionIdRef,
    messagesRef,
    activeModelRef,
    runningRef,
    refineStateRef,
    refineEpochRef,
    socketRef,
    requestedModelsRef,
    stickToBottomRef,
    setMessages,
    setRunning,
    setActivity,
    setToolCalls,
    setSubagents,
    setAgentTranscripts,
    setSession,
    setResumeProgress,
    setSessions,
    setContext,
    setModels,
    setModes,
    setActiveModeId,
    setPrefs,
    setDraft,
    setFileRefs,
    setFileMention,
    setNotice,
    setFallbackPending,
    setQueue,
    setRefineState,
    setPendingConfirm,
    setUserInputRequests,
    setSelectedAgentId,
    setSessionStart,
    setShowJumpToLatest,
    setFileMatches,
    setFilePickerIndex,
    setFileSearching,
    setAttachedImages,
    setCopiedMessageId,
    setProviderLabels,
    setDiffFiles,
    resetAgentNameCache: () => resetAgentNameCache(),
    onChime: playChime,
    dispatchUserMessage,
    requestProviderModels,
    writeComposerDraft,
    clearComposerDraft,
    readComposerDraft,
    worklists,
    onUpdateInfo: setUpdateInfo,
  };

  const handleServerMessage = useMemo(
    () => createMessageHandler(handlerDeps),
    [dispatchUserMessage, requestProviderModels, worklists],
  );

  const handleSocketMessage = useCallback(
    (message: Parameters<typeof handleServerMessage>[0]) => {
      if (!applyMailboxMessage(message)) handleServerMessage(message);
    },
    [handleServerMessage, applyMailboxMessage],
  );

  const { connection } = useSimpleSocket({
    onMessage: handleSocketMessage,
    sessionIdRef,
    socketRef,
    onDisconnect: () => {
      setFileMention(null);
      setFileMatches([]);
      setFileSearching(false);
    },
  });
  const {
    outage,
    dismissed: outageDismissed,
    dismiss: dismissOutage,
  } = useServerOutage(connection);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${Math.min(180, Math.max(48, element.scrollHeight))}px`;
  }, [draft]);

  useEffect(() => {
    if (!session?.id) return;
    const timer = setTimeout(() => {
      writeComposerDraft(session.id, { text: draft, fileRefs });
    }, 250);
    return () => clearTimeout(timer);
  }, [draft, fileRefs, session?.id]);

  // Draft/prompts persistence is best-effort, but a quota-exhausted browser
  // must not silently swallow user data — surface it once per failure.
  useEffect(
    () =>
      onPersistedWriteFailure(() => {
        setNotice({
          id: messageId('notice'),
          text: 'Could not save to browser storage — it may be full or blocked',
          tone: 'error',
        });
      }),
    [],
  );

  // Drafts for abandoned sessions would otherwise accumulate forever.
  useEffect(() => {
    pruneStaleComposerDrafts();
  }, []);

  const load = Math.max(0, Math.min(1, context.load));
  // Filter out thinking blocks when the user has disabled model reasoning display.
  const displayMessages = useMemo(
    () => (prefs.showModelReasoning ? messages : messages.filter((m) => m.role !== 'thinking')),
    [messages, prefs.showModelReasoning],
  );

  const selectedToolCalls = useMemo(
    () =>
      leaderSelected
        ? toolCalls
        : agentTranscriptToToolCalls(agentTranscripts[activeAgentId] ?? []),
    [activeAgentId, agentTranscripts, leaderSelected, toolCalls],
  );

  const { fileEditSummary, fileEdits } = useMemo(() => {
    const aggregate = aggregateFileEdits(toolCalls);
    return {
      fileEditSummary: aggregate,
      fileEdits: aggregate.files.map((edit) => ({ edit, ts: edit.ts ?? '' })),
    };
  }, [toolCalls]);

  // Stable identities matter: these handlers are passed into every memo'd
  // MessageItem, so a fresh closure per render would re-render the whole
  // transcript on every streaming flush.
  const selectNextStep = useCallback((messageId: string, text: string) => {
    setDraft(text);
    setConsumedNextSteps((prev) => (prev.has(messageId) ? prev : new Set(prev).add(messageId)));
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const copyAssistantMessage = useCallback(async (id: string, text: string) => {
    if (await copyText(text)) {
      setCopiedMessageId(id);
      return;
    }
    setNotice({
      id: messageId('notice'),
      text: 'Could not copy response',
      tone: 'error',
    });
  }, []);

  const selectFile = (path: string) => {
    if (!fileMention) return;
    const cursor = fileMention.start;
    setDraft((current) => removeFileMention(current, fileMention));
    setFileRefs((current) => (current.includes(path) ? current : [...current, path]));
    setFileMention(null);
    setFileMatches([]);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      textarea?.focus();
      textarea?.setSelectionRange(cursor, cursor);
    });
  };

  const createSession = () => {
    if (running || !sessionIdRef.current) return;
    socketRef.current?.send('session.new', { sessionId: sessionIdRef.current });
  };

  const resumeSession = (id: string) => {
    if (running || !sessionIdRef.current || id === sessionIdRef.current) return;
    setResumeProgress({ sessionId: id, stage: 'start', loadedBytes: 0, totalBytes: 0 });
    socketRef.current?.send('session.resume', { sessionId: sessionIdRef.current, id });
  };

  useEffect(() => {
    if (connection === 'open') refreshMailbox();
  }, [connection, refreshMailbox]);

  const switchMode = (id: string) => {
    setActiveModeId(id);
    socketRef.current?.send('mode.switch', { id });
  };

  const { runCommandPaletteAction } = useSessionCommandPalette({
    createSession,
    textareaRef,
    messagesRef,
    session,
    setNotice,
    toggleTheme,
    setSettingsOpen,
    openWorkspacePanel,
    setContextBreakdownOpen,
    sessionIdRef,
    runningRef,
    socketRef,
    setActivity,
  });

  // Single source of truth for "a genuine newer version is available" — the
  // version chip (class / title / suffix) and the update banner all gate on
  // this exact condition. Keeping it in one const prevents the four call
  // sites from silently diverging on a future edit (e.g. dropping the
  // equality guard, which would re-introduce a bogus "vX → vX" notice).
  const hasUpdate =
    updateInfo.updateAvailable &&
    Boolean(updateInfo.latestVersion) &&
    updateInfo.latestVersion !== updateInfo.appVersion;

  // Flat provider/model pairs for the subagent lane selects in Settings. The
  // switcher's grouping is a display concern; a lane only needs the pair.
  const subagentModelOptions = useMemo(
    () =>
      groupedModels.flatMap(([provider, descriptors]) =>
        descriptors.map((descriptor) => ({ provider, model: descriptor.id })),
      ),
    [groupedModels],
  );
  return {
    session,
    sessions,
    running,
    selectedModel,
    groupedModels,
    providerLabels,
    pendingModelSwitch,
    selectModel,
    confirmModelSwitch,
    cancelModelSwitch,
    context,
    load,
    connection,
    theme,
    commandPaletteOpen,
    mailboxOpen,
    mailboxUnreadCount,
    settingsOpen,
    updateInfo,
    hasUpdate,
    createSession,
    resumeSession,
    sessionIdRef,
    socketRef,
    setContextBreakdownOpen,
    setCommandPaletteOpen,
    toggleTheme,
    refreshMailbox,
    setMailboxOpen,
    setSettingsOpen,
    setUpdateInfo,
    activeAgentId,
    finishedAgentTabs,
    liveAgentTabs,
    setSelectedAgentId,
    leaderSelected,
    scrollRef,
    onScrollSticky,
    displayMessages,
    toolCalls,
    fileEdits,
    copiedMessageId,
    activity,
    resumeProgress,
    resolvedTheme,
    prefs,
    setDiffFiles,
    copyAssistantMessage,
    selectNextStep,
    consumedNextSteps,
    agentTabs,
    agentTranscripts,
    activeAgent,
    selectedToolCalls,
    worklists,
    requestWorklist,
    updateTodoStatus,
    updateTaskStatus,
    updatePlanStatus,
    mailboxStore,
    sendMailboxMessage,
    handleMailboxAction,
    runCommandPaletteAction,
    setDraft,
    textareaRef,
    messages,
    sessionStart,
    contextBreakdownOpen,
    setActivity,
    fallbackPending,
    setFallbackPending,
    modes,
    activeModeId,
    palette,
    switchAutonomy,
    switchMode,
    setPalette,
    updatePrefs,
    resetPrefs,
    isAtDefaults,
    subagentModelOptions,
    fileEditSummary,
    diffFiles,
    outageDismissed,
    outage,
    dismissOutage,
    userInputRequests,
    showJumpToLatest,
    jumpToLatest,
    draft,
    fileRefs,
    setFileRefs,
    fileMention,
    setFileMention,
    fileMatches,
    filePickerIndex,
    setFilePickerIndex,
    fileSearching,
    pendingConfirm,
    notice,
    queue,
    refineState,
    submitWith,
    abort,
    decideConfirm,
    selectFile,
    setQueue,
    refineDecision,
    refineRetry,
    refineRetryFallback,
    refineStartNow,
    refineSendEdited,
    refineEditInComposer,
    prefsRef,
    attachedImages,
    attachImages,
    removeImage,
    visionSupported,
  };
}
