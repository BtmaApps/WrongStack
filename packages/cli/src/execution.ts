import * as path from 'node:path';
import { setQueuedMessagesSnapshot } from '@wrongstack/core/agent';
import { type CoordinatorEvent, LeaderAutoWakeController } from '@wrongstack/core/coordination';
import { noOpVault } from '@wrongstack/core/security';
import { attachTodosCheckpoint, QueueStore } from '@wrongstack/core/storage';
import { normalizeTokenSavingTier } from '@wrongstack/core/types';
import { mergeCustomModelDefs, sessionScopedPath } from '@wrongstack/core/utils';
import { capabilitiesFor, catalogProviderIdFor } from '@wrongstack/providers';
import { createToolVisionAdapters } from '@wrongstack/runtime/vision';
import { runSingleShotDispatch } from './boot/dispatch-singleshot.js';
import { runTuiDispatch } from './boot/dispatch-tui.js';
import { resolveExecutionMode } from './boot/execution-mode.js';
import { appendPipedStdin, readPipedStdin } from './boot/piped-stdin.js';
import { createTuiCoordinatorCallbacks } from './boot/tui-coordinator-callbacks.js';
import { setupAutonomousCoordinator } from './boot/tui-coordinator-setup.js';
import {
  registerDebugStreamCallback,
  restoreDebugStreamCallback,
} from './boot/tui-debug-stream.js';
import { wireGoal } from './boot/tui-goal-wiring.js';
import { getLiveSessions, onSwitchToSession } from './boot/tui-live-sessions.js';
import {
  getProjectPickerItems,
  onProjectSelect,
  type ProjectPickerContext,
} from './boot/tui-project-picker-callback.js';
import { handleProjectSwitchSpawn } from './boot/tui-project-spawn.js';
import {
  type ProjectSwitchContext,
  switchProjectInPlace as switchProjectInPlaceExtracted,
} from './boot/tui-project-switch.js';
import type { TuiRuntimeState } from './boot/tui-runtime-state.js';
import {
  getSDDContext as getSDDContextExtracted,
  onSDDOutput as onSDDOutputExtracted,
} from './boot/tui-sdd-callback.js';
import { createSettingsAdapter } from './boot/tui-settings-adapter.js';
import { createThemeAdapter } from './boot/tui-theme-adapter.js';
import { type WorktreeRef, withWorktreeSwitch } from './boot/worktree-sessions.js';
import { createBrainPanelHost } from './brain-menu/panel-service.js';
import type { ExecuteDeps } from './execute-deps.js';
import { installExecutionChimeraHandlers } from './execution-chimera-handlers.js';
import { finalizeExecutionCleanup } from './execution-cleanup.js';
import { createKanbanDispatchHandler } from './execution-kanban-dispatch.js';
import { createReplFleetCallbacks } from './execution-repl-fleet-callbacks.js';
import { createExecutionSessionCallbacks } from './execution-session-callbacks.js';
import { installStorageObservability } from './execution-storage-observability.js';
import { createTuiNextStepCallbacks } from './execution-tui-next-step-callbacks.js';
import { runExecutionWebui } from './execution-webui.js';
import { FleetStatusLine } from './fleet-statusline.js';
import { resolveActiveApiKey } from './provider-config-utils.js';
import { runRepl } from './repl.js';
import type { StandaloneAutoUpdate } from './standalone-auto-update.js';
import { createSubagentModelsPanelHost } from './subagent-models/panel-service.js';
import { createTuiResourceMenuGetter } from './tui-resource-menus.js';
import { createTuiResumeCallback } from './tui-resume-callback.js';
import type { UpdateInfo } from './update-check.js';
import { CLI_VERSION } from './version.js';

export {
  __resetReviewerRoundRobinCursor,
  applyChimeraReviewerReadOnlyPolicy,
  assignReviewerModels,
  assignReviewerModelsRoundRobin,
  CHIMERA_REVIEW_READ_ONLY_TOOLS,
  resolveReviewerFallbackModels,
} from './chimera-reviewer-policy.js';
export type {
  BrainData,
  BrainLogEntry,
  ExecuteDeps,
  McpPickerItem,
  PluginPickerItem,
  RestoredToolCall,
  ToolPickerItem,
} from './execute-deps.js';
export type { LiveSettingsInput } from './live-settings-input.js';

export async function execute(deps: ExecuteDeps): Promise<number> {
  const {
    core: {
      agent,
      events,
      config,
      configStore,
      vault,
      wpaths: initialWpaths,
      projectRoot: initialProjectRoot,
      flags,
      positional,
      slashRegistry,
      tokenCounter,
      sessionRef,
      activateSessionIdentity,
      updateInfo: initialUpdateInfo,
      webuiSessionChild,
    },
    session: {
      session,
      context,
      attachments,
      queueStore,
      mcpRegistry,
      mailbox,
      sessionStore,
      memoryStore,
      modeStore,
      detachTodosCheckpoint,
      restoredMessages,
      restoredToolCalls,
      restoredEvents,
    },
    provider: {
      modelsRegistry,
      savedProviderCfg,
      resolvedProvider,
      statusTracker,
      getPickableProviders,
      switchProviderAndModel,
      sddSubagentFactory,
    },
    ui: {
      renderer,
      reader,
      secretInputController,
      stats,
      effectiveMaxContext,
      getEffectiveMaxContext,
      skillLoader,
      modeId,
    },
    fleet: {
      director,
      getDirector,
      coordinatorController,
      fleetRoster,
      fleetStreamController,
      agentsMonitorController,
      agentTranscripts,
      authHost,
      onPanelOpen,
    },
    controllers: {
      interruptController,
      enhanceController,
      getEnhancerReasoning,
      getActiveModelReasoningEffortLevels,
      buildEnhancerProvider,
      getEnhanceFallbackRef,
      getConfiguredRefinerRef,
      statuslineHiddenItems,
      setStatuslineHiddenItems,
      saveStatuslineHiddenItems,
      statuslineLines,
      setStatuslineLines,
      saveStatuslineLines,
      statuslineDensities,
      setStatuslineDensities,
      saveStatuslineDensities,
      statuslineOrder,
      setStatuslineOrder,
      saveStatuslineOrder,
      getYolo,
      onYolo,
      getAutonomy,
      onAutonomy,
      getNextPredict,
      applyLiveSettings,
      onCountdownTick,
    },
    picker: {
      getPluginItems,
      onPluginToggle,
      getMcpServers,
      onMcpToggle,
      onMcpRestart,
      getToolsItems,
      onToolToggle,
      getBrainData,
      onBrainRiskLevel,
      brain,
      brainRuntime,
      getShadowData,
      onShadowStart,
      onShadowStop,
    } = {},
    lifecycles: {
      getSuggestions,
      getAutoSuggestions,
      onSuggestionsParsed,
      autonomyNextPrompt,
      autoProceedDelayMs,
      autoProceedMaxIterations,
      onValidateAutoProceed,
      getEternalEngine,
      getParallelEngine,
      getSddRun,
      onSddLifecycle,
      subscribeEternalIteration,
      subscribeEternalStage,
      onDestroy,
      onCoordinatorStop,
    } = {},
  } = deps;

  let onCoordinatorStopImpl: (() => void) | undefined = onCoordinatorStop;

  const wpaths = initialWpaths;
  const projectRoot = initialProjectRoot;
  const activeSessionStore = sessionStore;
  const detachActiveTodosCheckpoint: (() => void | Promise<void>) | undefined =
    detachTodosCheckpoint;
  const profileName = config.activeProfile ?? 'default';
  const bootUpdateInfo: UpdateInfo | undefined = initialUpdateInfo;

  const offStorageObservability = installStorageObservability(events, context.traceId);
  const { chimeraWork, chimeraTeardowns } = installExecutionChimeraHandlers(deps);

  let code = 0;
  let backgroundKanbanSupervisor: { dispose(): void } | undefined;
  let autoUpdate: StandaloneAutoUpdate | undefined;
  let fleetStatusLine: FleetStatusLine | null = null;
  try {
    const visionAdapters = () => createToolVisionAdapters(agent.tools);
    const supportsVision = async (): Promise<boolean> => {
      try {
        const providerConfig = config.providers?.[context.provider.id];
        const mergedModels = mergeCustomModelDefs(providerConfig?.customModels, config.models);
        const caps = await capabilitiesFor(
          modelsRegistry,
          context.provider.id,
          context.model,
          mergedModels,
          { catalogProviderId: catalogProviderIdFor(context.provider.id, providerConfig?.type) },
        );
        return caps.vision;
      } catch {
        return context.provider.capabilities.vision;
      }
    };
    const promptFlag = typeof flags['prompt'] === 'string' ? flags['prompt'] : undefined;
    if (promptFlag) {
      positional.unshift(promptFlag);
    }
    const goalFlag = typeof flags['goal'] === 'string' ? flags['goal'] : undefined;
    const askFlag = typeof flags['ask'] === 'string' ? flags['ask'] : undefined;
    const executionMode = resolveExecutionMode(positional, flags);
    if (projectRoot && executionMode !== 'webui') {
      backgroundKanbanSupervisor = (
        await import('./webui-server/kanban-supervisor.js')
      ).createKanbanSupervisor({
        projectRoot,
        broadcast: () => {},
        dispatchTask: createKanbanDispatchHandler({
          config,
          events,
          skillLoader,
          sddSubagentFactory,
        }).onKanbanDispatch,
        log: (message) => console.log(message),
      });
    }
    // Interactive sessions only: a one-shot run must not start a 100+ MB
    // download, and a WebUI session child leaves it to its parent.
    if (executionMode !== 'single-shot' && !webuiSessionChild) {
      autoUpdate = (await import('./standalone-auto-update.js')).startStandaloneAutoUpdate({
        getConfig: () => configStore.get(),
        updateInfo: bootUpdateInfo,
      });
    }
    const enteringTui = executionMode === 'tui';
    if (!enteringTui) {
      fleetStatusLine = new FleetStatusLine({ events, version: CLI_VERSION });
      fleetStatusLine.start();
    }
    if (executionMode === 'single-shot') {
      const piped = await readPipedStdin(process.stdin);
      if (piped.timedOut) {
        renderer.writeWarning(
          'No stdin data received in time; continuing without it. Redirect stdin (< /dev/null) to skip the wait.',
        );
      } else if (piped.truncated) {
        renderer.writeWarning('Piped stdin exceeded 2 MB and was truncated.');
      }
      // MCP servers start in the background. A one-shot run is a single turn,
      // and a turn takes the tool list as it is when it starts, so without
      // this wait their tools were never offered to it.
      await mcpRegistry.whenStarted();
      code = await runSingleShotDispatch({
        agent,
        query: appendPipedStdin(positional.join(' '), piped.text),
        flags,
        tokenCounter,
        renderer,
        events,
        interruptController,
      });
    } else if (executionMode === 'tui') {
      agent.disableInteractiveConfirmation();

      const state: TuiRuntimeState = {
        projectRoot,
        wpaths,
        activeSessionStore,
        activateSessionIdentity,
        detachActiveTodosCheckpoint,
        // Plumbed from cli-main.ts so `resumeSession` can repoint the ref
        // when an in-process `/resume` swaps the active writer. Optional
        // on TuiRuntimeState; tests/hosts that omit it revert to the
        // pre-refactor behavior where provider calls stay pinned to the
        // boot session.
        sessionRef,
        pendingProjectSwitch: null,
        autonomousCoordinator: null,
        coordinatorRun: null,
        coordinatorEvents: new Set(),
      };

      const banneredFamily = savedProviderCfg?.family ?? resolvedProvider?.family;
      const banneredKey =
        (savedProviderCfg ? resolveActiveApiKey(savedProviderCfg) : undefined) ??
        config.apiKey ??
        (resolvedProvider?.envVars ?? savedProviderCfg?.envVars ?? [])
          .map((v) => process.env[v])
          .find((v): v is string => !!v);
      const banneredKeyTail =
        banneredKey && banneredKey.length >= 3 ? banneredKey.slice(-3) : undefined;

      const goalWiring = wireGoal(events);
      const subscribeGoal = goalWiring.subscribe;
      const coordinatorEvents = new Set<(event: CoordinatorEvent) => void>();
      state.coordinatorEvents = coordinatorEvents;
      const autonomousCoordinationEnabled = config.features.autonomousCoordination !== false;
      const coordinatorSetup = autonomousCoordinationEnabled
        ? setupAutonomousCoordinator({
            state,
            events,
            context,
            brain,
            wpaths,
            mailbox,
            director,
            getDirector,
            coordinatorController,
            onCoordinatorStopSetter: (fn) => {
              onCoordinatorStopImpl = fn ?? undefined;
            },
          })
        : {
            ensure: () => null,
            cleanup: () => undefined,
          };
      const ensureAutonomousCoordinator = coordinatorSetup.ensure;
      const offDirectorSpawned = coordinatorSetup.cleanup;

      const switchCtx: ProjectSwitchContext = {
        state,
        context,
        events,
        agent,
        config,
        tokenCounter,
        modeId,
        modeStore,
        memoryStore,
        skillLoader,
        attachTodosCheckpoint,
      };
      const switchProjectInPlace = async (targetRoot: string, displayName: string) => {
        return switchProjectInPlaceExtracted(switchCtx, targetRoot, displayName);
      };
      // Sessions of other git worktrees in the last /resume listing.
      const worktreeSessions = new Map<string, WorktreeRef>();

      const pickerCtx: ProjectPickerContext = {
        state,
        renderer,
        director,
        getEternalEngine,
        getParallelEngine,
        switchCtx,
        switchProjectInPlace,
      };

      // Background-delegation auto-wake (TUI only — one-shot/print modes exit
      // and never wake). Config is read live from the user config; `fleet` is
      // denied in project config, so a repo cannot enable autonomous wakes.
      const leaderAutoWake = new LeaderAutoWakeController({
        events,
        config: () => {
          try {
            return configStore.get()?.fleet?.delegate;
          } catch {
            return undefined;
          }
        },
      });
      renderer.setTuiActive(true);
      try {
        code = await runTuiDispatch({
          leaderAutoWake,
          agent,
          // The session store's root. Without it /rewind, the checkpoint
          // timeline and /rewind redo resolve every session file against ''
          // and fail, and the layout store and history archive stay ephemeral.
          sessionsDir: wpaths.projectSessions,
          events,
          slashRegistry,
          skillLoader,
          getResourceMenu: createTuiResourceMenuGetter({
            configStore,
            paths: wpaths,
            memoryStore,
            statusTracker,
            projectRoot,
          }),
          secretInputController,
          attachments,
          tokenCounter,
          visionAdapters,
          supportsVision,
          model: context.model,
          banner: !flags['no-banner'],
          queueStore,
          // `/resume` brings the resumed session's queue along; the WebUI
          // keeps a session's queue in the same file.
          queueStoreFor: (sessionId: string) => {
            try {
              return new QueueStore({
                dir: sessionScopedPath(state.wpaths.projectSessions, sessionId, ''),
              });
            } catch {
              return undefined;
            }
          },
          onQueueChange: (items: string[]) => {
            setQueuedMessagesSnapshot(context, items);
          },
          mouse: flags.mouse ? true : undefined,
          yolo: !!config.yolo,
          getYolo,
          onYolo,
          getAutonomy,
          ...createTuiNextStepCallbacks({
            context,
            getNextPredict,
            getAutonomy,
            getSuggestions,
          }),
          getEternalEngine,
          getSddRun,
          onSddLifecycle,
          subscribeEternalIteration,
          subscribeEternalStage,
          subscribeGoal,
          appVersion: CLI_VERSION,
          latestVersion: bootUpdateInfo?.latest,
          updateAvailable: bootUpdateInfo?.outdated,
          subscribeUpdateReady: autoUpdate?.subscribe,
          provider: config.provider,
          family: banneredFamily,
          keyTail: banneredKeyTail,
          profile: profileName,
          profileConfigPath: (() => {
            const abs = wpaths.profileConfig(profileName);
            const home = wpaths.homeDir;
            return home && abs.startsWith(home) ? `~${abs.slice(home.length)}` : abs;
          })(),
          getPickableProviders,
          switchProviderAndModel,
          switchAutonomy: (mode: 'off' | 'suggest' | 'auto' | 'eternal' | 'eternal-parallel') => {
            onAutonomy?.(mode);
            return null;
          },
          ...createSettingsAdapter({
            configStore,
            wpaths,
            vault: vault ?? noOpVault,
            fleetStreamController,
            applyLiveSettings,
          }),
          ...createThemeAdapter({ configStore, wpaths }),
          configStore,
          effectiveMaxContext,
          titleAnimation:
            ((config.autonomy as Record<string, unknown> | undefined)?.[
              'terminalTitleAnimation'
            ] as boolean) ?? true,
          chime:
            ((config.autonomy as Record<string, unknown> | undefined)?.['chime'] as boolean) ??
            false,
          confirmExit:
            ((config.autonomy as Record<string, unknown> | undefined)?.[
              'confirmExit'
            ] as boolean) ?? true,
          director,
          getDirector,
          fleetRoster,
          ...createTuiCoordinatorCallbacks({
            state,
            context,
            coordinatorEvents,
            ensureAutonomousCoordinator,
          }),
          onClearHistory: (
            dispatch: (
              action:
                | {
                    type: 'clearHistory';
                    model?: string | undefined;
                    provider?: string | undefined;
                    /**
                     * Explicit `null` tells the reducer the boot-time restored
                     * transcript source has been discarded by `/clear`. The
                     * reducer resets `historyBudget`, `autoProceedHold`, and
                     * `nextId` to the fresh-boot values when all three are
                     * `null`; omitting them preserves the existing
                     * resume-derived behavior used by `session.rewound` /
                     * `project.switched`.
                     */
                    restoredMessages?: readonly unknown[] | null | undefined;
                    restoredToolCalls?: readonly unknown[] | null | undefined;
                    restoredEvents?: readonly unknown[] | null | undefined;
                  }
                | { type: 'resetContextChip' }
                | { type: 'streamReset' }
                | { type: 'toolStreamClear' },
            ) => void,
          ) => {
            void attachments.clear().catch(() => {});
            // `/clear` from the slash command lands here. Pass the three
            // boot-resume sources as explicit `null` so the reducer also
            // resets `historyBudget`, `autoProceedHold`, and `nextId` —
            // otherwise the boot-time restored transcript (set by
            // `wstack --resume <id>`) leaks back into the fresh session.
            dispatch({
              type: 'clearHistory',
              model: context.model,
              provider: context.provider.id,
              restoredMessages: null,
              restoredToolCalls: null,
              restoredEvents: null,
            });
            dispatch({ type: 'resetContextChip' });
            dispatch({ type: 'streamReset' });
            dispatch({ type: 'toolStreamClear' });
          },
          fleetStreamController,
          interruptController,
          enhanceController,
          getEnhancerReasoning,
          getActiveModelReasoningEffortLevels,
          buildEnhancerProvider,
          getEnhanceFallbackRef,
          getConfiguredRefinerRef,
          statuslineHiddenItems,
          setStatuslineHiddenItems,
          saveStatuslineHiddenItems,
          statuslineLines,
          setStatuslineLines,
          saveStatuslineLines,
          statuslineDensities,
          setStatuslineDensities,
          saveStatuslineDensities,
          statuslineOrder,
          setStatuslineOrder,
          saveStatuslineOrder,
          getPluginItems,
          onPluginToggle,
          getMcpServers,
          onMcpToggle,
          onMcpRestart,
          getToolsItems,
          onToolToggle,
          getBrainData,
          onBrainRiskLevel,
          brainPanelHost: brainRuntime ? createBrainPanelHost({ brainRuntime }) : undefined,
          subagentModelsHost: createSubagentModelsPanelHost({
            getContext: () => agent.ctx,
            getSessionTarget: () => ({ provider: config.provider, model: config.model }),
          }),
          getShadowData,
          onShadowStart,
          onShadowStop,
          authHost,
          agentsMonitorController,
          agentTranscripts,
          getLiveSessions: () => getLiveSessions({ state }),
          onSwitchToSession: (_sessionId: string, targetRoot: string, projectName: string) =>
            onSwitchToSession({ state }, _sessionId, targetRoot, projectName),
          initialGoal: goalFlag,
          initialAsk: askFlag,
          projectRoot,
          appConfig: config,
          hqTelemetryOwnedExternally: true,
          getSessionId: () => agent.ctx.session?.id ?? session.id,
          getSDDContext: () => getSDDContextExtracted(),
          onSDDOutput: (output: string) => onSDDOutputExtracted(output),
          modeLabel: modeId,
          getModeLabel: () => {
            const metaMode = context.meta?.['mode'];
            return typeof metaMode === 'string' ? metaMode : (modeId ?? 'default');
          },
          getModes: modeStore
            ? async () => {
                const [modes, active] = await Promise.all([
                  modeStore.listModes(),
                  modeStore.getActiveMode(),
                ]);
                return { modes, activeId: active?.id ?? null };
              }
            : undefined,
          switchMode: modeStore
            ? async (id: string) => {
                const prev = await modeStore.getActiveMode();
                await modeStore.setActiveMode(id);
                const active = await modeStore.getActiveMode();
                const from = prev?.id ?? 'default';
                if (agent.ctx.session && from !== id) {
                  void agent.ctx.session
                    .append({ type: 'mode_changed', ts: new Date().toISOString(), from, to: id })
                    .catch(() => {});
                }
                return active?.name ?? null;
              }
            : undefined,
          registerDebugStreamCallback,
          restoreDebugStreamCallback,
          restoredMessages,
          restoredToolCalls,
          restoredEvents,
          ...createExecutionSessionCallbacks({ state, agent, session, worktreeSessions }),
          onResumeSession: withWorktreeSwitch(
            createTuiResumeCallback({ state, agent, tokenCounter, switchProviderAndModel, events }),
            (id) => worktreeSessions.get(id),
            switchProjectInPlace,
          ),
          getProjectPickerItems: () => getProjectPickerItems(pickerCtx),
          onProjectSelect: (slug: string, kind: 'project' | 'action') =>
            onProjectSelect(pickerCtx, slug, kind),
          initialAgentsMonitorOpen: !!flags.quick,
          tokenSavingMode: normalizeTokenSavingTier(config.features.tokenSavingMode),
          toolCount: agent.tools.list().length,
          onPanelOpen,
          memoryStore,
        } as never as import('@wrongstack/tui').RunTuiOptions);

        const spawnResult = await handleProjectSwitchSpawn({
          code,
          pendingProjectSwitch: state.pendingProjectSwitch,
        });
        if (spawnResult !== null) return spawnResult;
      } finally {
        renderer.setTuiActive(false);
        leaderAutoWake.dispose();
        offDirectorSpawned();
      }
    } else if (executionMode === 'webui') {
      code = await runExecutionWebui(deps);
    } else {
      // Imported here rather than at module scope: this is the ONLY static
      // path from the always-loaded CLI graph into `@wrongstack/webui-server`
      // (831KB, +38.7MB heap / +80.2MB RSS standalone). `webui-server.ts`
      // itself is already loaded lazily from `boot/dispatch-webui.ts`, so this
      // one import was single-handedly defeating that boundary and making every
      // `wstack` invocation pay for a WebUI server that is off by default.
      const headlessKanbanMirror = projectRoot
        ? (await import('./webui-server/kanban-run-mirror.js')).createKanbanRunMirror({
            projectRoot,
            events,
            broadcast: () => {},
            log: (m) => console.log(m),
          })
        : null;
      try {
        code = await runRepl({
          agent,
          renderer,
          reader,
          slashRegistry,
          tokenCounter,
          visionAdapters,
          supportsVision,
          attachments,
          effectiveMaxContext,
          getEffectiveMaxContext,
          projectName: path.basename(projectRoot) || undefined,
          projectRoot,
          appConfig: config,
          getSessionId: () => agent.ctx.session?.id ?? session.id,
          getAutonomy,
          onAutonomy,
          getNextPredict,
          onSuggestionsParsed,
          getSuggestions,
          getAutoSuggestions,
          getYolo,
          autonomyNextPrompt,
          autoProceedDelayMs,
          onValidateAutoProceed,
          autoProceedMaxIterations,
          getEternalEngine,
          getParallelEngine,
          getSddRun,
          skillLoader,
          agentsMonitorController,
          fleetStreamController,
          interruptController,
          ...createReplFleetCallbacks({ director, getDirector }),
          onCountdownTick,
          onDestroy,
        });
      } finally {
        headlessKanbanMirror?.dispose();
      }
    }
  } finally {
    backgroundKanbanSupervisor?.dispose();
    autoUpdate?.dispose();
    // Release session-scoped wildcard listeners (chimera review/cascade)
    // BEFORE the cleanup drains below, so no stale listener survives into
    // teardown — the EventBus wildcard-disposer fix.
    for (const off of chimeraTeardowns.splice(0)) {
      try {
        off();
      } catch {
        /* best-effort — a throwing disposer must not block cleanup */
      }
    }
    await finalizeExecutionCleanup({
      offStorageObservability,
      fleetStatusLine,
      onCoordinatorStop: onCoordinatorStopImpl,
      stats,
      renderer,
      detachTodosCheckpoint,
      mcpRegistry,
      agent,
      session,
      tokenCounter,
      events,
      chimeraWork,
      director,
      reader,
    });
  }
  return code;
}
