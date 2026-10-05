import type { Director } from '@wrongstack/core/coordination';
import { useCallback, useEffect } from 'react';
import type { AppProps } from './app-props.js';
import { effectivePanelPositions, mergeStatuslineHiddenItems } from './app-ui-state.js';
import { deriveAppViewState } from './app-view-state.js';
import { leaderTimelineFromEntries } from './components/agents-monitor.js';
import type { StatuslineItem } from './components/statusline-picker.js';
import { usePendingUserInput } from './components/user-input-prompt.js';
import { resolveControllerProps } from './controller-props.js';
import { useAppEnvironment } from './hooks/use-app-environment.js';
import { useAppRefSpine } from './hooks/use-app-ref-spine.js';
import { useAppState } from './hooks/use-app-state.js';
import { useAuthPanel } from './hooks/use-auth-panel.js';
import { useCoreTuiCommands } from './hooks/use-core-tui-commands.js';
import { useDirectorFleetBridge } from './hooks/use-director-fleet-bridge.js';
import { useExitCommand } from './hooks/use-exit-command.js';
import { useFileSearch } from './hooks/use-file-search.js';
import { useHistoryArchive } from './hooks/use-history-archive.js';
import { useHistoryAutoScroll } from './hooks/use-history-auto-scroll.js';
import { useHistoryCopyNotice } from './hooks/use-history-copy-notice.js';
import { useInitialPrompt } from './hooks/use-initial-prompt.js';
import { useInputHistoryPersistence } from './hooks/use-input-history-persistence.js';
import { useKanbanBoardFocus } from './hooks/use-kanban-board-focus.js';
import { useLeaderAutoWake } from './hooks/use-leader-auto-wake.js';
import { useNextStepsAutoSubmit } from './hooks/use-next-steps-auto-submit.js';
import { usePanelControllers } from './hooks/use-panel-controllers.js';
import { usePasteHandling } from './hooks/use-paste-handling.js';
import { useProviderWarmup } from './hooks/use-provider-warmup.js';
import { useQueueManager } from './hooks/use-queue-manager.js';
import { useSessionInterruptController } from './hooks/use-session-interrupt-controller.js';
import { useSessionRewind } from './hooks/use-session-rewind.js';
import { useSkillMentionPicker } from './hooks/use-skill-mention-picker.js';
import { useSlashPicker } from './hooks/use-slash-picker.js';
import { useStatusbarViewModel } from './hooks/use-statusbar-view-model.js';
import { useThemePickerHandler } from './hooks/use-theme-picker-handler.js';
import { useTokenCounterRefresh } from './hooks/use-token-counter-refresh.js';
import { useTuiControllers } from './hooks/use-tui-controllers.js';
import { useTuiEventBridge } from './hooks/use-tui-event-bridge.js';
import { useApp, useStdout } from './ink.js';
import { useControllerKeyPipeline } from './use-controller-key-pipeline.js';
import { useControllerPanelHooks } from './use-controller-panel-hooks.js';
import { useControllerThemeEvents } from './use-controller-theme-events.js';
export function useAppController(props: AppProps) {
  const controllerProps = resolveControllerProps(props);
  const { getDirector } = controllerProps;
  const secretInputController = controllerProps.secretInputController;
  const pendingUserInput = usePendingUserInput(controllerProps.events);
  const { exit } = useApp();
  const { stdout } = useStdout();

  const projectRoot = controllerProps.agent.ctx.projectRoot;

  // Decomposition Phase 4 A1 (docs/decomposition-a0-app-map.md): state
  // facade + ref spine extracted; call order fixed + unconditional
  // (behavior contract §0.3).
  const { state, dispatch, layoutStore, liveTodos } = useAppState({
    agent: controllerProps.agent,
    banner: controllerProps.banner,
    appVersion: controllerProps.appVersion,
    provider: controllerProps.provider,
    model: controllerProps.model,
    family: controllerProps.family,
    keyTail: controllerProps.keyTail,
    profile: controllerProps.profile,
    profileConfigPath: controllerProps.profileConfigPath,
    autonomyAgents: controllerProps.autonomyAgents,
    restoredMessages: controllerProps.restoredMessages,
    restoredToolCalls: controllerProps.restoredToolCalls,
    restoredEvents: controllerProps.restoredEvents,
    enhanceEnabled: controllerProps.enhanceEnabled,
    initialAgentsMonitorOpen: controllerProps.initialAgentsMonitorOpen,
    initialFleetChat: controllerProps.fleetStreamController?.mode,
    sessionsDir: controllerProps.sessionsDir,
  });
  const {
    promptUsageRef,
    builderRef,
    activeCtrlRef,
    eternalLoopRunningRef,
    parallelLoopRunningRef,
    activeRunSettledRef,
    exitRequestedRef,
    inputGateRef,
    lastEnterAtRef,
    tokenPreviewsRef,
    streamingTextRef,
    streamSegmentsRef,
    pendingDeltaRef,
    flushTimerRef,
    sessionGenerationRef,
    activeRunGenerationRef,
    assistantCommittedThisRunRef,
    stateRef,
    draftRef,
    runBlocksRef,
    lastEscAtRef,
    dismissedEscAtRef,
    submitRef,
    historyScrollRef,
    statusBarClickMapRef,
    inspectOverlayHeaderRef,
    enhanceEnabledRef,
    midRunSendPickerRef,
    enhanceAbortRef,
    enhanceCancelledRef,
    enhanceOriginalRef,
    enhanceCountdown,
    setEnhanceCountdown,
    enhanceStartedAt,
    setEnhanceStartedAt,
    enhanceDurationMs,
    setEnhanceDurationMs,
    refineProviderId,
    setRefineProviderId,
    refineModel,
    setRefineModel,
  } = useAppRefSpine({
    attachments: controllerProps.attachments,
    state,
    midRunSendPicker: controllerProps.midRunSendPicker,
  });
  const onScrollInfo = useCallback(
    (info: { scrolled: boolean }) =>
      dispatch({ type: 'setHistoryScrolled', scrolled: info.scrolled }),
    [dispatch],
  );
  const onHistoryScrollActivity = useHistoryAutoScroll({
    historyScrolled: state.historyScrolled,
    historyScrollRef,
  });
  const { onRequestOlderEntries } = useHistoryArchive({
    entries: state.entries,
    dispatch,
    sessionsDir: controllerProps.sessionsDir,
    sessionId: controllerProps.agent.ctx.session?.id,
  });
  const onHistoryCopy = useHistoryCopyNotice(dispatch);
  const { focusedBoardId, setFocusedBoardId, boardFocusRef } = useKanbanBoardFocus();

  useInputHistoryPersistence({
    projectRoot,
    inputHistory: state.inputHistory,
    dispatch,
  });
  const {
    openPromptPicker,
    setPromptFavorite,
    openModePicker,
    handleModelPicked,
    brainCtl,
    openBrainPanel,
    changeBrainRisk,
    openShadowPanel,
    handleShadowStart,
    handleShadowStop,
    subagentModelsCtl,
    openHelpPanel,
    bugHuntLoop,
    mailbox,
    setMailboxPanelOpen,
  } = useControllerPanelHooks({
    projectRoot,
    dispatch,
    getModes: controllerProps.getModes,
    getPickableProviders: controllerProps.getPickableProviders,
    state,
    getBrainData: controllerProps.getBrainData,
    brainPanelHost: controllerProps.brainPanelHost,
    onBrainRiskLevel: controllerProps.onBrainRiskLevel,
    getShadowData: controllerProps.getShadowData,
    onShadowStart: controllerProps.onShadowStart,
    onShadowStop: controllerProps.onShadowStop,
    subagentModelsHost: controllerProps.subagentModelsHost,
    slashRegistry: controllerProps.slashRegistry,
    subscribeCoordinatorEvents: controllerProps.subscribeCoordinatorEvents,
    submitRef,
    events: controllerProps.events,
  });

  // Decomposition Phase 4 A2 (docs/decomposition-a0-app-map.md): environment
  // facade — theme, env state, live settings, activity, layout, mouse,
  // viewport, autonomy drivers, status syncs, settings auto-save. Call order
  // fixed + unconditional (behavior contract §0.3); runs after the mailbox
  // VM (consumes mailboxPanelOpen).
  const {
    environment,
    activity,
    refreshGoalSummary,
    linesRef,
    densitiesRef,
    orderRef,
    projectName,
    workingDirChip,
    liveSettings,
    liveStatuslineMode,
    liveAnimationStyle,
    chimeRef,
    confirmExitRef,
    sidebarLayout,
    mouseMode,
    setMouseMode,
    nativeMouse,
    setNativeMouse,
    bottomRegionRef,
    statusBarWrapRef,
    belowStatusBarRef,
    termRows,
    statusBarRows,
    gitInfo,
    runEternalLoopRef,
    runParallelLoopRef,
    hiddenItems,
    setHiddenItems,
    hiddenItemsRef,
    setMemoryContextMonitor,
    memoryContextMonitorRef,
    memoryRecordTotalRef,
    setLiveToolCount,
  } = useAppEnvironment({
    agent: controllerProps.agent,
    attachments: controllerProps.attachments,
    configStore: controllerProps.configStore,
    state,
    dispatch,
    mailboxPanelOpen: mailbox.mailboxPanelOpen,
    stdout,
    events: controllerProps.events,
    memoryStore: controllerProps.memoryStore,
    model: controllerProps.model,
    provider: controllerProps.provider,
    effectiveMaxContext: controllerProps.effectiveMaxContext,
    yolo: controllerProps.yolo,
    mouse: controllerProps.mouse,
    capability: controllerProps.capability,
    chime: controllerProps.chime,
    confirmExit: controllerProps.confirmExit,
    stateRef,
    builderRef,
    eternalLoopRunningRef,
    parallelLoopRunningRef,
    getAutonomy: controllerProps.getAutonomy,
    modeLabel: controllerProps.modeLabel,
    statuslineHiddenItems: controllerProps.statuslineHiddenItems,
    toolCount: controllerProps.toolCount,
    getSettings: controllerProps.getSettings,
    setStatuslineHiddenItems: controllerProps.setStatuslineHiddenItems,
    saveStatuslineHiddenItems: controllerProps.saveStatuslineHiddenItems,
    statuslineLines: controllerProps.statuslineLines,
    setStatuslineLines: controllerProps.setStatuslineLines,
    saveStatuslineLines: controllerProps.saveStatuslineLines,
    statuslineDensities: controllerProps.statuslineDensities,
    setStatuslineDensities: controllerProps.setStatuslineDensities,
    saveStatuslineDensities: controllerProps.saveStatuslineDensities,
    statuslineOrder: controllerProps.statuslineOrder,
    setStatuslineOrder: controllerProps.setStatuslineOrder,
    saveStatuslineOrder: controllerProps.saveStatuslineOrder,
    titleController: controllerProps.titleController,
    getYolo: props.getYolo,
    getModeLabel: controllerProps.getModeLabel,
    getEternalEngine: controllerProps.getEternalEngine,
    getParallelEngine: controllerProps.getParallelEngine,
    switchAutonomy: controllerProps.switchAutonomy,
    subscribeEternalIteration: props.subscribeEternalIteration,
    subscribeEternalStage: props.subscribeEternalStage,
    getLiveSessions: controllerProps.getLiveSessions,
    saveSettings: controllerProps.saveSettings,
  });
  const {
    liveModel,
    setLiveModel,
    liveProvider,
    setLiveProvider,
    activeMaxContext,
    setActiveMaxContext,
    yoloLive,
    setYoloLive,
    autonomyLive,
    setAutonomyLive,
    liveModeLabel,
    setLiveModeLabel,
  } = environment;
  const { displayThinkingWord } = activity;

  const liveDirector = useCallback(
    (): Director | null => getDirector?.() ?? controllerProps.director,
    [getDirector, controllerProps.director],
  );

  const clearPendingConfirms = useCallback(() => {
    const queue = stateRef.current.confirmQueue;
    if (queue.length === 0) return;
    for (const c of queue) {
      try {
        c.resolve('no');
      } catch {
        // already settled
      }
    }
    dispatch({ type: 'confirmClearAll' });
  }, [dispatch, stateRef]);

  const authPanelController = useAuthPanel({
    authHost: controllerProps.authHost,
    stateRef,
    dispatch,
    open: state.authPanel.open,
  });

  useEffect(() => {
    if (!secretInputController) return;
    const previousSecret = secretInputController.readSecret;
    const previousText = secretInputController.readText;
    secretInputController.readSecret = authPanelController.readSecret;
    secretInputController.readText = authPanelController.readText;
    return () => {
      secretInputController.readSecret = previousSecret;
      if (previousText) secretInputController.readText = previousText;
      else delete secretInputController.readText;
    };
  }, [secretInputController, authPanelController.readSecret, authPanelController.readText]);

  const statuslineHiddenForPicker = useCallback((): StatuslineItem[] => {
    return mergeStatuslineHiddenItems(
      hiddenItemsRef.current,
      stateRef.current.statuslinePicker.hiddenItems,
    );
  }, [hiddenItemsRef, stateRef]);

  const openStatuslinePicker = useCallback(
    (field?: number) => {
      if (field !== undefined) {
        dispatch({ type: 'statuslineFieldSet', field });
      }
      // Seed the editor from the live layout so the picker opens showing what
      // the bar is actually rendering, not the contract defaults.
      dispatch({
        type: 'statuslineOpen',
        hiddenItems: statuslineHiddenForPicker(),
        lines: linesRef.current,
        densities: densitiesRef.current,
        order: orderRef.current,
      });
    },
    [dispatch, statuslineHiddenForPicker, linesRef, densitiesRef, orderRef],
  );

  const { handleRewindTo, handleRewindRedo } = useSessionRewind({
    agent: controllerProps.agent,
    sessionsDir: controllerProps.sessionsDir,
    interruptController: controllerProps.interruptController,
    liveDirector,
    sessionGenerationRef,
  });

  const setDraft = (buffer: string, cursor: number): void => {
    draftRef.current = { buffer, cursor };
    dispatch({ type: 'setBuffer', buffer, cursor });
  };

  const clearDraft = (): void => {
    draftRef.current = { buffer: '', cursor: 0 };
    dispatch({ type: 'clearInput' });
  };

  const tokenRefresh = useTokenCounterRefresh(
    controllerProps.tokenCounter,
    controllerProps.events,
    controllerProps.agent.ctx.session?.id,
  );

  const statusbar = useStatusbarViewModel({
    agent: controllerProps.agent,
    tokenCounter: controllerProps.tokenCounter,
    activeMaxContext,
    effectiveMaxContext: controllerProps.effectiveMaxContext,
    liveProvider,
    liveModel,
    liveTodos,
    sidebarVisible: sidebarLayout.sidebarWidth > 0,
    hiddenItems,
    state,
    ...(tokenRefresh ? { tokenRefresh } : {}),
  });
  const { fleetCounts } = statusbar;

  useSkillMentionPicker(state, props.skillLoader, dispatch);

  const acceptSlashPickerSelection = useSlashPicker({
    state,
    slashRegistry: controllerProps.slashRegistry,
    dispatch,
    setDraft,
  });

  const { getCronJobs, runSteerSequence } = useCoreTuiCommands({
    agent: controllerProps.agent,
    slashRegistry: controllerProps.slashRegistry,
    memoryStore: controllerProps.memoryStore,
    onPanelOpen: controllerProps.onPanelOpen,
    memoryContextMonitorRef,
    memoryRecordTotalRef,
    stateRef,
    boardFocusRef,
    setFocusedBoardId,
    terminalWidth: stdout.columns ?? 80,
    getModeLabel: controllerProps.getModeLabel,
    activeCtrlRef,
    clearPendingConfirms,
    dispatch,
    liveDirector,
    streamingTextRef,
    director: controllerProps.director,
    handleRewindTo,
    handleRewindRedo,
    getSettings: controllerProps.getSettings,
  });

  const panelControllers = usePanelControllers({
    state,
    stateRef,
    dispatch,
    getPickableProviders: controllerProps.getPickableProviders,
    getProjectPickerItems: controllerProps.getProjectPickerItems,
    getLiveSessions: controllerProps.getLiveSessions,
    onPanelOpen: controllerProps.onPanelOpen,
    openStatuslinePicker,
    openAuthPanel: authPanelController.openAuthPanel,
    openModePicker,
    openBrainPanel,
    openShadowPanel,
    openSubagentModelsPanel: controllerProps.subagentModelsHost
      ? subagentModelsCtl.openSubagentModelsPanel
      : undefined,
    openHelpPanel,
    getSettings: controllerProps.getSettings,
    getPluginItems: controllerProps.getPluginItems,
    onPluginToggle: controllerProps.onPluginToggle,
    getMcpServers: controllerProps.getMcpServers,
    onMcpToggle: controllerProps.onMcpToggle,
    onMcpRestart: controllerProps.onMcpRestart,
    getToolsItems: controllerProps.getToolsItems,
    onToolToggle: controllerProps.onToolToggle,
    setLiveToolCount,
    getActiveModelReasoningEffortLevels: props.getActiveModelReasoningEffortLevels,
  });
  const { openModelPicker, openProjectPicker, openFKeyPicker, loadLiveSessions, openSettings } =
    panelControllers;

  const {
    nextStepsAutoSubmitCountdown,
    nextStepsAutoSubmitLabel,
    nextStepsAutoSubmitDeadlineMs,
    setNextStepsAutoSubmitCountdown,
    setNextStepsAutoSubmitLabel,
    nextStepsAutoSubmitSuggestionRef,
    nextStepsAutoSubmitTimerRef,
    autoSubmitStreakRef,
    autoSubmitCapWarnedRef,
    autoSubmitLoopGuardRef,
    cancelNextStepsCountdown,
  } = useNextStepsAutoSubmit({
    state,
    autonomyLive,
    agent: controllerProps.agent,
    getAutonomy: controllerProps.getAutonomy,
    getSettings: controllerProps.getSettings,
    getSuggestions: controllerProps.getSuggestions,
    getAutoSuggestions: controllerProps.getAutoSuggestions,
    getYolo: props.getYolo,
    setSuggestions: controllerProps.setSuggestions,
    autonomyNextPrompt: controllerProps.autonomyNextPrompt,
    dispatch,
    clearDraft,
    runBlocksRef,
  });
  useControllerThemeEvents({
    dispatch,
    controllerProps,
    props,
    openModelPicker,
    openFKeyPicker,
    projectRoot,
    openSettings,
    state,
    openStatuslinePicker,
    setHiddenItems,
    hiddenItemsRef,
    setMailboxPanelOpen,
    openPromptPicker,
    streamingTextRef,
    streamSegmentsRef,
    pendingDeltaRef,
    flushTimerRef,
    sessionGenerationRef,
    activeRunGenerationRef,
    assistantCommittedThisRunRef,
    setMemoryContextMonitor,
  });

  const {
    pasteAccumRef,
    pasteFlushTimerRef,
    commitPaste,
    pasteClipboardImage,
    pasteClipboardText,
  } = usePasteHandling({
    builderRef,
    dispatch,
    draftRef,
    setDraft,
    tokenPreviewsRef,
  });

  const queueManager = useQueueManager({
    queueStore: controllerProps.queueStore,
    queueStoreFor: controllerProps.queueStoreFor,
    onQueueChange: controllerProps.onQueueChange,
    slashRegistry: controllerProps.slashRegistry,
    stateRef,
    dispatch,
    getSettings: controllerProps.getSettings,
    saveSettings: controllerProps.saveSettings,
    midRunSendPickerRef,
  });

  useProviderWarmup(controllerProps.agent, state.buffer, state.status);

  const getActiveSessionId = useCallback(
    () => controllerProps.agent.ctx.session.id,
    [controllerProps.agent],
  );

  const getLeaderTranscript = useCallback(
    () => leaderTimelineFromEntries(stateRef.current.entries),
    [stateRef],
  );

  useTuiEventBridge({
    events: controllerProps.events,
    dispatch,
    stateRef,
    setActiveMaxContext,
    getSessionId: getActiveSessionId,
    subscribeGoal: controllerProps.subscribeGoal,
    onClearHistory: controllerProps.onClearHistory,
    sessionGenerationRef,
  });

  useTuiControllers({
    dispatch,
    fleetChat: state.fleetChat,
    enhanceEnabled: state.enhanceEnabled,
    agentsMonitorOpen: state.agentsMonitorOpen,
    fleetStreamController: controllerProps.fleetStreamController,
    enhanceController: controllerProps.enhanceController,
    agentsMonitorController: controllerProps.agentsMonitorController,
  });

  useSessionInterruptController({
    interruptController: controllerProps.interruptController,
    dispatch,
    stateRef,
    activeCtrlRef,
    activeRunSettledRef,
    sessionGenerationRef,
    streamingTextRef,
    streamSegmentsRef,
    pendingDeltaRef,
    assistantCommittedThisRunRef,
    flushTimerRef,
    eternalLoopRunningRef,
    parallelLoopRunningRef,
    tokenPreviewsRef,
    clearPendingConfirms,
    getEternalEngine: controllerProps.getEternalEngine,
    getParallelEngine: controllerProps.getParallelEngine,
    getSddRun: controllerProps.getSddRun,
    switchAutonomy: controllerProps.switchAutonomy,
  });

  useExitCommand({
    slashRegistry: controllerProps.slashRegistry,
    dispatch,
    exitConfirm: state.exitConfirm,
    stateRef,
    sessionGenerationRef,
    interruptController: controllerProps.interruptController,
    getDirector: liveDirector,
  });

  useDirectorFleetBridge({
    director: controllerProps.director,
    dispatch,
    stateRef,
    chatMode: state.fleetChat,
    sessionGenerationRef,
  });

  const { onPickerEnter } = useFileSearch({
    state,
    dispatch,
    projectRoot,
    builderRef,
    draftRef,
    setDraft,
    tokenPreviewsRef,
  });

  const { onThemePickerEnter, onThemePickerUndo } = useThemePickerHandler({
    configStore: controllerProps.configStore,
    saveThemePreset: props.saveThemePreset,
    dispatch,
    selectedIndex: state.themePicker.selected,
    filter: state.themePicker.filter,
    previous: state.themePicker.previous,
  });

  const { runInterruptLadder, stableOnKey } = useControllerKeyPipeline({
    sessionGenerationRef,
    switchQueueSession: queueManager.switchSession,
    props,
    state,
    dispatch,
    environment,
    statusbar,
    panelControllers,
    authPanelController,
    brainCtl,
    lastEnterAtRef,
    inputGateRef,
    submitRef,
    promptUsageRef,
    setDraft,
    acceptSlashPickerSelection,
    changeBrainRisk,
    handleModelPicked,
    handleShadowStart,
    handleShadowStop,
    subagentModelsCtl,
    statuslineHiddenForPicker,
    onPickerEnter,
    onThemePickerEnter,
    onThemePickerUndo,
    setPromptFavorite,
    stateRef,
    exitRequestedRef,
    agent: controllerProps.agent,
    liveDirector,
    onExit: controllerProps.onExit,
    exit,
    activeCtrlRef,
    clearPendingConfirms,
    getEternalEngine: controllerProps.getEternalEngine,
    getParallelEngine: controllerProps.getParallelEngine,
    eternalLoopRunningRef,
    parallelLoopRunningRef,
    switchAutonomy: controllerProps.switchAutonomy,
    getSddRun: controllerProps.getSddRun,
    confirmExitRef,
    historyScrollRef,
    onHistoryScrollActivity,
    enhanceCancelledRef,
    enhanceAbortRef,
    enhanceOriginalRef,
    enhanceEnabledRef,
    lastEscAtRef,
    dismissedEscAtRef,
    streamingTextRef,
    streamSegmentsRef,
    pendingDeltaRef,
    flushTimerRef,
    activeRunGenerationRef,
    activeRunSettledRef,
    assistantCommittedThisRunRef,
    chimeRef,
    openProjectPicker,
    loadLiveSessions,
    openStatuslinePicker,
    statuslineHiddenItems: controllerProps.statuslineHiddenItems,
    draftRef,
    clearDraft,
    mouseMode,
    nativeMouse,
    termRows,
    stdout,
    sidebarLayout,
    statusBarWrapRef,
    belowStatusBarRef,
    statusBarClickMapRef,
    inspectOverlayHeaderRef,
    openModelPicker,
    nextStepsAutoSubmitTimerRef,
    nextStepsAutoSubmitSuggestionRef,
    nextStepsAutoSubmitLabel,
    setNextStepsAutoSubmitCountdown,
    setNextStepsAutoSubmitLabel,
    cancelNextStepsCountdown,
    pasteClipboardText,
    pasteClipboardImage,
    onHistoryCopy,
    pasteAccumRef,
    pasteFlushTimerRef,
    commitPaste,
    builderRef,
    tokenPreviewsRef,
    runBlocksRef,
    liveModel,
    liveProvider,
    activeMaxContext,
    yoloLive,
    autonomyLive,
    liveModeLabel,
    setMouseMode,
    setNativeMouse,
    setLiveModel,
    setLiveProvider,
    setActiveMaxContext,
    setYoloLive,
    setAutonomyLive,
    setLiveModeLabel,
    setLiveToolCount,
    autoSubmitStreakRef,
    autoSubmitCapWarnedRef,
    autoSubmitLoopGuardRef,
    runEternalLoopRef,
    runParallelLoopRef,
    midRunSendPickerRef,
    openPromptPicker,
    refreshGoalSummary,
    setMemoryContextMonitor,
    runSteerSequence,
    setEnhanceStartedAt,
    setEnhanceDurationMs,
    setRefineProviderId,
    setRefineModel,
    bugHuntLoop,
  });

  useLeaderAutoWake({
    leaderAutoWake: props.leaderAutoWake,
    events: controllerProps.events,
    dispatch,
    getSessionId: () => controllerProps.agent.ctx.session?.id,
    activeController: activeCtrlRef,
    eternalLoopRunning: eternalLoopRunningRef,
    parallelLoopRunning: parallelLoopRunningRef,
    enhanceAbort: enhanceAbortRef,
    state: stateRef,
    runBlocks: runBlocksRef,
  });

  useInitialPrompt({
    initialGoal: controllerProps.initialGoal,
    initialAsk: controllerProps.initialAsk,
    builderRef,
    runBlocksRef,
    dispatch,
  });

  const viewState = deriveAppViewState({
    state,
    terminalColumns: stdout?.columns ?? 80,
    displayThinkingWord,
    fleetRunning: fleetCounts?.running ?? 0,
    liveAnimationStyle,
    panelPositions: effectivePanelPositions(state, liveSettings),
  });
  return {
    pendingUserInput,
    runInterruptLadder,
    props,
    state,
    dispatch,
    historyScrollRef,
    onScrollInfo,
    onRequestOlderEntries,
    activity,
    environment,
    statusbar,
    mailbox,
    gitInfo,
    viewState,
    mouseMode,
    termRows,
    statusBarRows,
    bottomRegionRef,
    statusBarWrapRef,
    belowStatusBarRef,
    statusBarClickMapRef,
    inspectOverlayHeaderRef,
    stableOnKey,
    liveTodos,
    liveSettings,
    liveAnimationStyle,
    liveStatuslineMode,
    projectName,
    workingDirChip,
    handleRewindTo,
    activeCtrlRef,
    clearPendingConfirms,
    liveDirector,
    dismissedEscAtRef,
    enhanceOriginalRef,
    enhanceStartedAt,
    enhanceDurationMs,
    refineProviderId,
    refineModel,
    setEnhanceCountdown,
    enhanceCountdown,
    nextStepsAutoSubmitCountdown,
    nextStepsAutoSubmitLabel,
    nextStepsAutoSubmitDeadlineMs,
    setDraft,
    focusedBoardId,
    getCronJobs,
    getLeaderTranscript,
    coordinatorRunning: controllerProps.coordinatorRunning,
    enhanceDelayMs: controllerProps.enhanceDelayMs,
    layoutStore,
  };
}
