import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FallbackPendingProjection } from './fallback-modal.js';
import { useAgentView } from './hooks/use-agent-view.js';
import { useComposerState } from './hooks/use-composer-state.js';
import { useGlobalShortcuts } from './hooks/use-global-shortcuts.js';
import { useModelCatalog } from './hooks/use-model-catalog.js';
import { usePanelState } from './hooks/use-panel-state.js';
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
import { playChime } from './lib/chime.js';
import { copyText } from './lib/clipboard.js';
import {
  clearComposerDraft,
  readComposerDraft,
  writeComposerDraft,
} from './lib/composer-draft.js';
import type { MessageHandlerDeps } from './lib/message-handler.js';
import { createMessageHandler } from './lib/message-handler.js';
import { onPersistedWriteFailure } from './lib/persisted.js';
import { messageId } from './lib/session-helpers.js';
import type { PendingUserInputRequest } from './lib/user-input-queue.js';
import type { SimpleSocket } from './lib/ws.js';
import type {
  AgentMode,
  ChatMessage,
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
  const [userInputRequests, setUserInputRequests] = useState<PendingUserInputRequest[]>([]);
  const [fallbackPending, setFallbackPending] = useState<FallbackPendingProjection | null>(null);
  const [running, setRunning] = useState(false);
  const [resumeProgress, setResumeProgress] = useState<ResumeProgressInfo | null>(null);
  const [activity, setActivity] = useState('');
  const { notice, showNotice: setNotice } = useStatusNotice();
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
  /** Provider ids already asked for their model list — catalog + saved overlap. */
  const requestedModelsRef = useRef<Set<string>>(new Set());
  const runningRef = useRef(false);
  runningRef.current = running;

  // Refs for the global keyboard shortcut handler — read live state
  // without re-registering the keydown listener on every render.
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
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

  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    contextBreakdownOpen,
    setContextBreakdownOpen,
    diffFiles,
    setDiffFiles,
    diffFilesRef,
    copiedMessageId,
    setCopiedMessageId,
    consumedNextSteps,
    setConsumedNextSteps,
  } = usePanelState({ setSettingsOpen, setMailboxOpen });

  const {
    draft,
    setDraft,
    fileRefs,
    setFileRefs,
    queue,
    setQueue,
    refineState,
    setRefineState,
    pendingConfirm,
    setPendingConfirm,
    textareaRef,
    draftRef,
    fileRefsRef,
    refineStateRef,
    refineEpochRef,
    refineStartFiredRef,
    queueRef,
    pendingConfirmRef,
    fileMention,
    setFileMention,
    fileMatches,
    setFileMatches,
    filePickerIndex,
    setFilePickerIndex,
    fileSearching,
    setFileSearching,
    attachedImages,
    attachImages,
    removeImage,
    setAttachedImages,
    visionSupported,
    dispatchUserMessage,
    submitWith,
    submitWithRef,
    refineDecision,
    refineRetry,
    refineRetryFallback,
    refineStartNow,
    refineSendEdited,
    refineEditInComposer,
    abort,
    selectFile,
    decideConfirm,
    decideConfirmRef,
  } = useComposerState({
    session,
    sessionIdRef,
    socketRef,
    running,
    runningRef,
    prefsRef,
    activeModelRef,
    setMessages,
    setRunning,
    setToolCalls,
    setActivity,
    setNotice,
  });

  // Tab-strip presence: running marker + unread mailbox count (D10).
  useTabTitle({ running, unreadCount: mailboxUnreadCount, enabled: prefs.showTabTitle });

  /** Ask the server for a provider's model list, at most once per provider. */

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

  const {
    displayMessages,
    selectedToolCalls,
    fileEditSummary,
    fileEdits,
    subagentModelOptions,
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
  } = useAgentView({
    running,
    messages,
    toolCalls,
    groupedModels,
    showModelReasoning: prefs.showModelReasoning,
  });

  const { palette, setPalette } = usePalette();

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

  const load = Math.max(0, Math.min(1, context.load));

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
