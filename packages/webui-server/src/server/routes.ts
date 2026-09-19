/**
 * WebUI route-table construction.
 *
 * Phase 1a of the god-module split (issue: God-modules >1500 lines).
 * `startWebUI` in `./index.ts` previously inlined the construction of
 * 13 `*Routes` records (provider / session / project / mode / prefs /
 * shell-git / mailbox / mcp / brain / goal / specs / sdd-board /
 * sdd-wizard). They totalled 947 lines — the bulk of the file — and
 * were glued together by closure capture of mutable state (config,
 * projectRoot, workingDir, session, …).
 *
 * This module moves that block into a single `buildRoutes()` function.
 * The closures now read live values through `WebuiMutableState` getters
 * and write them through setters, exactly the way the original code
 * captured them by reference. No behaviour change: comments, message
 * shapes, ordering, and validation are preserved verbatim.
 *
 * The `*RouteHandlers` interfaces already living next door
 * (provider-routes.ts, prefs-routes.ts, …) define the type contracts
 * this file fulfils.
 */

import path from 'node:path';
import type { Context } from '@wrongstack/core/agent';
import {
  normalizeSubagentModelPlan,
  seedSessionSubagentPolicy,
  setSessionSubagentModelPlan,
  setSessionSubagentsAllowed,
} from '@wrongstack/core/coordination';
import { type DestructiveKind, resolveYoloConfirmKinds } from '@wrongstack/core/security';
import type { ProviderConfig } from '@wrongstack/core/types';
import { resolveWstackPaths } from '@wrongstack/core/utils';
import { makeProviderFromConfig, withCatalogCapabilities } from '@wrongstack/providers';
import type { WebSocket } from 'ws';
import { createAutonomyRouteHandlers } from './autonomy-routes.js';
import { patchConfig } from './boot.js';
import type { BrainHandlerContext } from './brain-handlers.js';
import { type BrainRouteHandlers, createBrainRouteHandlers } from './brain-routes.js';
import { type ChimeraRouteHandlers, createChimeraRouteHandlers } from './chimera-routes.js';
import { handleConfigDoctor } from './config-doctor.js';
import { computeConfigPrefUpdates } from './config-pref-updates.js';
import { emitFallbackChoice } from './fallback-choice.js';
import {
  handleGitChanges,
  handleGitCommit,
  handleGitCommitDetail,
  handleGitCommitFileDiff,
  handleGitDiff,
  handleGitDiscard,
  handleGitHistory,
  handleGitInfo,
  handleGitStage,
  handleGitUnstage,
} from './git-handlers.js';
import type { GoalRouteHandlers } from './goal-routes.js';
import { createMailboxRouteHandlers } from './mailbox-routes.js';
import {
  handleMcpAdd,
  handleMcpDisable,
  handleMcpDiscover,
  handleMcpEnable,
  handleMcpList,
  handleMcpPromptGet,
  handleMcpPrompts,
  handleMcpRemove,
  handleMcpResourceRead,
  handleMcpResources,
  handleMcpRestart,
  handleMcpSleep,
  handleMcpUpdate,
  handleMcpWake,
} from './mcp-handlers.js';
import type { McpRouteHandlers } from './mcp-routes.js';
import { createModeHandlers } from './mode-handlers.js';
import type { ModeRouteHandlers } from './mode-routes.js';
import { createModelOperations } from './model-operations.js';
import { resolvePendingConfirmsForSession } from './pending-confirms.js';
import { prefSnapshot as prefSnapshotImpl } from './pref-helpers.js';
import type { PrefsHandlerContext } from './prefs-handlers.js';
import { createPrefsRouteHandlers } from './prefs-routes.js';
import { authorizeWebUIAction } from './privileged-actions.js';
import { createProjectHandlers } from './project-handlers.js';
import type { ProjectRouteHandlers } from './project-routes.js';
import { loadSavedProviders } from './provider-config-io.js';
import { createProviderHandlers } from './provider-handlers.js';
import type { ProviderRouteHandlers } from './provider-routes.js';
import {
  applyWrongProxyPrefs as applyWrongProxyPrefsRuntime,
  routeProviderCfgThroughProxy,
} from './proxy-runtime.js';
import type { AllRoutes, WebuiCallbacks, WebuiDeps, WebuiMutableState } from './route-contracts.js';
import type { SddBoardRouteHandlers } from './sdd-board-routes.js';
import type { SddWizardRouteHandlers } from './sdd-wizard-routes.js';
import { createSessionHandlers } from './session-handlers.js';
import type { SessionRouteHandlers } from './session-routes.js';
import type { ShellGitRouteHandlers } from './shell-git-routes.js';
import {
  handleShellOpen,
  normalizeShellOpenTarget,
  type ShellOpenResult,
  type ShellOpenTarget,
} from './shell-open.js';
import type { SpecsRouteHandlers } from './specs-routes.js';
import { rebuildSystemPrompt } from './system-prompt-rebuild.js';
import {
  validateGitCommitPayload,
  validateGitDiffPayload,
  validateGitDiscardPayload,
  validateGitStagePayload,
  validateGitUnstagePayload,
  validateShellOpenPayload,
} from './ws-payload-validation.js';
import { broadcast, send, sendResult } from './ws-utils.js';

/**
 * Build the 13 route records referenced by `handleProviderRoute`,
 * `handleSessionRoute`, … `handleSddWizardRoute`. The construction is a
 * direct lift from `startWebUI`; behaviour is unchanged.
 */
export function buildRoutes(
  state: WebuiMutableState,
  deps: WebuiDeps,
  cb: WebuiCallbacks,
): AllRoutes {
  // ---- Provider/Key management helpers (extracted to provider-handlers.ts) ----
  const providerHandlers = createProviderHandlers({
    profileConfigPath: deps.profileConfigPath,
    vault: deps.vault,
    getConfigWriteLock: state.getConfigWriteLock,
    setConfigWriteLock: state.setConfigWriteLock,
    broadcast: (msg) => broadcast(state.getClients(), msg),
    clients: state.getClients(),
    modelsRegistry: deps.modelsRegistry,
    getDisabledModels: () => state.getConfig().disabledModels ?? [],
    hasActiveModel: () => Boolean(state.getConfig().model),
    onProvidersLoaded: (providers) => {
      state.setConfig(patchConfig(state.getConfig(), { providers }));
    },
    applyModelSwitch: applyModelSwitchCore,
  });

  // Apply a provider+model switch to the live session: sync config, rebuild the
  // provider, refresh the auto-compaction denominator, persist, and broadcast a
  // fresh session.start. Shared by the `model.switch` handler and the
  // adopt-on-first-add path. Throws on provider-construction failure.
  /**
   * Resolve the Context a session-scoped operation should act on. Each WebUI
   * tab owns its own Context (see backend-services' session agent registry);
   * `deps.context` is only the ROOT one, which is a different tab's state as
   * often as not once four sessions are live.
   */
  function sessionContext(sessionId?: string): Context {
    if (!sessionId) return deps.context;
    return deps.getAgent?.(sessionId)?.ctx ?? deps.context;
  }

  async function applyModelSwitchCore(
    newProvider: string,
    newModel: string,
    sessionId?: string,
  ): Promise<void> {
    // Target the requesting tab's context. Without a sessionId (the
    // adopt-first-provider boot path) this is still the root context.
    const targetCtx = sessionContext(sessionId);
    await targetCtx.runModelTransition(async () => {
      // provider.add persists the record directly to the profile file
      // (providerStore.save), while the credential watcher's state.setConfig
      // refresh is debounced — the adopt-on-first-add path can read memory
      // before that refresh lands and then persist the boot-stale (empty)
      // providers map, clobbering the just-added record (the fresh-home
      // setup-screen regression). Hydrate from the profile file first so the
      // switch's persist cannot lose it.
      if (!state.getConfig().providers?.[newProvider]) {
        try {
          const fresh = await loadSavedProviders(deps.profileConfigPath, deps.vault);
          if (fresh[newProvider]) {
            state.setConfig(patchConfig(state.getConfig(), { providers: fresh }));
            deps.configStore.update({ providers: fresh });
          }
        } catch (err) {
          deps.logger.warn(`model.switch provider hydration failed: ${String(err)}`);
        }
      }
      const cur = state.getConfig();
      const newCfg = patchConfig(cur, { provider: newProvider, model: newModel });
      const providerCfg: ProviderConfig = newCfg.providers?.[newProvider] ?? { type: newProvider };
      const factoryType = providerCfg.type ?? newProvider;
      // WrongProxy / WrongTrace: rewrite the switched provider's base URL
      // through the shared helper so the live WebUI session honors the
      // proxy toggle, same as the CLI's `/model` switch path. `newCfg.baseUrl`
      // is the fallback when the saved cfg carries no explicit baseUrl.
      const routedCfg = routeProviderCfgThroughProxy(providerCfg, newCfg.baseUrl, newProvider);
      const built = deps.providerRegistry.has(factoryType)
        ? deps.providerRegistry.create({ ...routedCfg, type: newProvider } as never, factoryType)
        : makeProviderFromConfig(newProvider, { ...routedCfg, type: factoryType });
      // Overlay the target model's catalog facts. A freshly constructed provider
      // only has the wire-family baseline, so without this the session keeps the
      // previous model's context window and loses `maxOutput` entirely.
      const newProv = deps.modelsRegistry
        ? await withCatalogCapabilities(deps.modelsRegistry, newProvider, built, {
            ...routedCfg,
            type: newProvider,
            model: newModel,
          })
        : built;
      // Persist only after the target provider has been constructed. A failed
      // build must leave both the live session and durable selection untouched.
      await cb.updateGlobalConfig((config) => {
        config.provider = newProvider;
        config.model = newModel;
      }, 'model.switch');

      // The global config keeps tracking the most recent choice so it is the
      // default a NEW tab starts from and survives a restart — but the LIVE
      // swap lands only on the session that asked for it.
      state.setConfig(newCfg);
      deps.configStore.update({ provider: newProvider, model: newModel });
      targetCtx.model = newModel;
      targetCtx.provider = newProv;
      // Capability refresh is best-effort after the atomic live swap. It must
      // never sit on the acknowledgement boundary: refresh() may make a
      // network request to models.dev, while the selected provider/model is
      // already safe to use for the next turn. Keep the modal's result and the
      // session re-announce on the fast path; apply revised context metadata
      // when the background refresh completes.
      // Pass the POST-rewrite routedCfg (the same config the provider was built
      // from) so maxContext resolution sees the effective proxy-target URL.
      void cb.updateAutoCompactionMaxContext(newProv, newProvider, routedCfg).catch((error) => {
        deps.logger.warn(`model.switch capability refresh failed: ${String(error)}`);
      });

      broadcast(state.getClients(), {
        type: 'session.start',
        payload: await cb.sessionStartPayload(
          sessionId ? { sessionId, model: newModel, provider: newProvider } : {},
        ),
      });
    });
  }

  const modelOperations = createModelOperations({
    context: deps.context,
    memoryStore: deps.memoryStore,
    modelsRegistry: deps.modelsRegistry,
    getConfig: state.getConfig,
    getLiveProviderId: () => state.getConfig().provider ?? '',
    buildProvider: (providerId, providerConfig) => {
      const factoryType = providerConfig.type ?? providerId;
      return deps.providerRegistry.has(factoryType)
        ? deps.providerRegistry.create(
            { ...providerConfig, type: providerId } as never,
            factoryType,
          )
        : makeProviderFromConfig(providerId, { ...providerConfig, type: factoryType });
    },
    applyModelSwitch: applyModelSwitchCore,
    isRunActive: state.isRunActive,
    getSessionContext: (sessionId?: string) => sessionContext(sessionId),
    send,
    broadcast: (message) => broadcast(state.getClients(), message),
    log: (message) => console.warn(message),
  });

  const providerRoutes: ProviderRouteHandlers = {
    providerHandlers,
    listProviders: (ws) => providerHandlers.handleProvidersList(ws),
    listSavedProviders: (ws) => providerHandlers.handleProvidersSaved(ws),
    listProviderModels: (ws, msg) =>
      providerHandlers.handleProviderModels(
        ws,
        (msg as { payload: { providerId: string } }).payload.providerId,
        {
          includeDisabled:
            (msg as { payload: { includeDisabled?: boolean | undefined } }).payload
              .includeDisabled === true,
        },
      ),
    searchProviderModels: (ws, query, limit) =>
      providerHandlers.handleProviderModelsSearch(ws, query, limit),
    switchModel: (ws, msg) => modelOperations.switchModel(ws, msg.payload),
    adoptDefaultProviderIfUnset: providerHandlers.adoptDefaultProviderIfUnset,
    refineModel: (ws, msg) =>
      modelOperations.refineModel(
        ws,
        msg.payload as import('./model-operations.js').ModelRefinePayload,
      ),
    fallbackChoice: async (ws, msg) => {
      const result = emitFallbackChoice(deps.events, msg);
      if (!result.ok) {
        send(ws, {
          type: 'error',
          payload: { phase: 'invalid_request', message: result.message },
        });
      }
    },
  };

  const systemPromptAdapter = {
    paths: () => {
      const wpaths = resolveWstackPaths({
        projectRoot: state.getProjectRoot(),
        globalRoot: deps.wpaths.globalRoot,
      });
      return {
        globalDir: wpaths.globalInstructions,
        projectDir: wpaths.inProjectInstructions,
      };
    },
    profileConfigPath: deps.profileConfigPath,
    current: () => state.getConfig().systemPrompt?.variant ?? 'default',
    // Move the in-memory default too: `persistPrefsToConfig` writes the file,
    // not the object, and everything that has no per-tab answer reads the
    // object — `current()` for a picker in a tab that never chose, and the
    // meta seed a NEWLY created session starts from.
    //
    // It is only a default. The rebuild below no longer reads it for a tab
    // that has its own variant (see `variantForContext`), so a pick here
    // cannot reach a tab that already made one.
    applyVariant: async (variant: string, sessionId?: string) => {
      const config = state.getConfig();
      state.setConfig(
        patchConfig(config, {
          systemPrompt: { ...(config.systemPrompt ?? {}), variant: variant as never },
        }),
      );
      // Rebuild the asking tab's prompt. The container rebind stays global on
      // purpose: it only changes which builder NEW subagents are composed
      // from, which is a default rather than live conversation state.
      const targetCtx = sessionContext(sessionId);
      const modeId =
        typeof targetCtx.meta['modeId'] === 'string' && targetCtx.meta['modeId']
          ? (targetCtx.meta['modeId'] as string)
          : state.getModeId();
      targetCtx.meta['systemPromptVariant'] = variant;
      await rebuildSystemPrompt(
        {
          modeStore: deps.modeStore,
          memoryStore: deps.memoryStore,
          skillLoader: deps.skillLoader,
          modelCapabilities: (() => state.getModelCapabilities()) as never,
          context: targetCtx,
          toolRegistry: deps.toolRegistry,
          getConfig: state.getConfig,
          projectRoot: state.getProjectRoot(),
          globalRoot: deps.wpaths.globalRoot,
          // Rebind the container ONLY when the tab that asked owns the root
          // context. The rebound builder carries the rebuilding tab's mode
          // and mode prompt as well as its variant, and `Agent`'s pre-run
          // refresh resolves that one token for every conversation — so a
          // rebind from tab A put tab A's MODE layer into tab B's prompt on
          // B's next turn. `mode-handlers` already omits the container for
          // this reason. Nothing is lost: the identity variant now travels
          // per conversation in `ctx.meta`, which that refresh reads, and
          // subagents compose from `host.deps.systemPromptBuilder` rather
          // than the token.
          ...(targetCtx === deps.context ? { container: deps.container } : {}),
        },
        modeId,
      );
    },
  };

  const sessionRoutes: SessionRouteHandlers = createSessionHandlers({
    withSessionTransition: state.withSessionTransition,
    config: state.getConfig(),
    clients: state.getClients(),
    context: deps.context,
    events: deps.events,
    toolRegistry: deps.toolRegistry,
    compactor: deps.compactor,
    customModeStore: deps.customModeStore,
    tokenCounter: deps.tokenCounter,
    getProjectRoot: state.getProjectRoot,
    getSession: state.getSession,
    getSessionStore: state.getSessionStore,
    sessionsDir: deps.wpaths.projectSessions,
    setSession: state.setSession,
    setSessionStartedAt: state.setSessionStartedAt,
    claimSession: cb.claimSession,
    onBeforeSessionTodosReplaced: cb.onBeforeSessionTodosReplaced,
    onSessionSwapped: cb.onSessionSwapped,
    abortActiveRun: state.abortRunLock,
    isRunActive: state.isRunActive,
    // A new tab's Context is cloned from the leader's; this re-points it at
    // the configured default so the record and the runtime agree.
    applyModelSwitch: applyModelSwitchCore,
    getAgent: deps.getAgent,
    ...(deps.peekAgent ? { peekAgent: deps.peekAgent } : {}),
    hasSession: deps.hasSession,
    isSessionLive: deps.isSessionLive,
    // A permission prompt raised in a tab that has since closed is
    // unanswerable: it was parked on that tab's lane, and the lane is gone.
    // Left pending it wedges `agent.run` forever, and a run that never settles
    // never releases its lock — the session then refuses to be stopped OR
    // deleted. The blanket drain in connection-lifecycle only fires when the
    // LAST socket goes away, which never happens while the other tabs are
    // open, so the per-session drain has to run here.
    onSessionsUndisplayed: (sessionIds: string[]) => {
      for (const sessionId of sessionIds) {
        const orphaned = resolvePendingConfirmsForSession(deps.pendingConfirms, sessionId);
        if (orphaned === 0) continue;
        console.warn(
          JSON.stringify({
            level: 'warn',
            event: 'webui.confirm_orphaned_by_tab_close',
            sessionId,
            count: orphaned,
            message: `Denied ${orphaned} unanswerable permission prompt(s) for closed session ${sessionId}.`,
          }),
        );
      }
    },
    sessionStartPayload: cb.sessionStartPayload,
    systemPrompt: systemPromptAdapter,
  });

  const projectRoutes: ProjectRouteHandlers = createProjectHandlers({
    globalConfigPath: deps.globalConfigPath,
    wpaths: deps.wpaths as never,
    clients: state.getClients(),
    context: deps.context,
    tokenCounter: deps.tokenCounter,
    config: state.getConfig(),
    getConfig: state.getConfig,
    getProjectRoot: state.getProjectRoot,
    getSession: state.getSession,
    setProjectRoot: state.setProjectRoot,
    setWorkingDir: state.setWorkingDir,
    setSession: state.setSession,
    setSessionStore: state.setSessionStore,
    setSessionStartedAt: state.setSessionStartedAt,
    abortRunLock: state.abortRunLock,
    onBeforeSessionTodosReplaced: cb.onBeforeSessionTodosReplaced,
    onSessionSwapped: cb.onSessionSwapped,
    sessionStartPayload: cb.sessionStartPayload,
  });

  const modeRoutes: ModeRouteHandlers = createModeHandlers({
    modeStore: deps.modeStore,
    memoryStore: deps.memoryStore,
    skillLoader: deps.skillLoader,
    modelCapabilities: (() => state.getModelCapabilities()) as never,
    context: deps.context,
    toolRegistry: deps.toolRegistry,
    config: state.getConfig(),
    getConfig: state.getConfig,
    projectRoot: state.getProjectRoot(),
    globalRoot: deps.wpaths.globalRoot,
    clients: state.getClients(),
    setModeId: state.setModeId,
    sessionStartPayload: cb.sessionStartPayload,
    getSessionContext: (sessionId?: string) => sessionContext(sessionId),
  });

  const prefsContext: PrefsHandlerContext = {
    meta: deps.context.meta,
    // Session-scoped prefs (autonomy, yolo, context strategy, prompt variant,
    // reasoning) land on the calling tab's own context meta.
    metaFor: (sessionId?: string) => sessionContext(sessionId).meta,
    // Session-aware: the scoped keys live on that tab's own context meta.
    snapshot: (sessionId?: string) => {
      const target = sessionContext(sessionId);
      seedSessionSubagentPolicy(target);
      return sessionId ? prefSnapshotImpl(target.meta) : cb.prefSnapshot();
    },
    setSubagentsAllowed: (allowed, sessionId) =>
      setSessionSubagentsAllowed(sessionContext(sessionId), allowed),
    setSubagentModelPlan: (plan, sessionId) =>
      setSessionSubagentModelPlan(sessionContext(sessionId), normalizeSubagentModelPlan(plan)),
    persist: cb.persistPrefsToConfig,
    pendingConfirms: deps.pendingConfirms,
    configStore: deps.configStore,
    systemPrompt: systemPromptAdapter,
    setYolo: (enabled) =>
      (deps.permissionPolicy as { setYolo?: (value: boolean) => void }).setYolo?.(enabled),
    setYoloConfirm: (preference) =>
      (
        deps.permissionPolicy as {
          setYoloConfirmKinds?: (kinds: Iterable<DestructiveKind>) => void;
        }
      ).setYoloConfirmKinds?.(resolveYoloConfirmKinds(preference)),
    applyConfigPrefs: (payload) => {
      const config = state.getConfig();
      const updates = computeConfigPrefUpdates(config, payload);
      // No-op payloads must not churn the config identity — subscribers and
      // equality checks downstream key on the object reference.
      if (Object.keys(updates).length === 0) return;
      state.setConfig(patchConfig(config, updates));
    },
    // WrongProxy / WrongTrace: reflect the standalone toggle/URL into the
    // shared `ProxyConfig` singleton immediately and await the re-probe so
    // `active` is fresh before a subsequent model.switch reads it. In the
    // CLI-hosted path this same key is the CLI's `applyWrongProxyPrefs`; when
    // running as its own process there is no CLI to inject it, so route it to
    // the server-local runtime module.
    applyWrongProxyPrefs: (payload) => applyWrongProxyPrefsRuntime(payload),
    setAutoCompact: (enabled) => {
      // Keep the middleware INSTALLED and let it decide per conversation.
      // Adding and removing it on the shared pipeline was a process-wide
      // switch driven by a per-tab preference: turning auto-compaction off in
      // one tab stopped it for the three running beside it, and turning it
      // back on re-armed it for all of them.
      if (!deps.autoCompactor) return;
      if (!deps.pipelines.contextWindow.list().includes('AutoCompaction')) {
        deps.pipelines.contextWindow.use({
          name: 'AutoCompaction',
          handler: deps.autoCompactor.handler(),
        });
      }
      deps.autoCompactor.setEnabled(enabled);
    },
    setLogLevel: (level) => {
      (deps.logger as { level: string }).level = level;
    },
    send,
    broadcast: (message) => broadcast(state.getClients(), message),
  };
  const doctorConfigHandler = (ws: WebSocket, apply: boolean) =>
    handleConfigDoctor(ws, apply, {
      profileConfigPath: deps.profileConfigPath,
      vault: deps.vault,
      updateConfig: cb.updateGlobalConfig,
      applyRuntimeConfig: (next) => {
        state.setConfig(next);
        deps.configStore.update(next);
      },
    });
  const prefsRoutes = createPrefsRouteHandlers(prefsContext, doctorConfigHandler);
  const autonomyRoutes = createAutonomyRouteHandlers(prefsContext);

  const shellGitRoutes: ShellGitRouteHandlers = {
    gitInfo: async (ws) => {
      await handleGitInfo(ws, state.getProjectRoot());
    },
    gitChanges: async (ws) => {
      await handleGitChanges(ws, state.getProjectRoot());
    },
    gitHistory: async (ws, msg) => {
      const payload = msg.payload as { ref?: unknown; limit?: unknown; skip?: unknown } | undefined;
      await handleGitHistory(ws, state.getProjectRoot(), {
        ref: typeof payload?.ref === 'string' ? payload.ref : undefined,
        limit: typeof payload?.limit === 'number' ? payload.limit : undefined,
        skip: typeof payload?.skip === 'number' ? payload.skip : undefined,
      });
    },
    gitCommitDetail: async (ws, msg) => {
      const payload = msg.payload as { hash?: unknown } | undefined;
      await handleGitCommitDetail(
        ws,
        state.getProjectRoot(),
        typeof payload?.hash === 'string' ? payload.hash : '',
      );
    },
    gitCommitFileDiff: async (ws, msg) => {
      const payload = msg.payload as
        | { hash?: unknown; path?: unknown; previousPath?: unknown }
        | undefined;
      await handleGitCommitFileDiff(ws, state.getProjectRoot(), {
        hash: typeof payload?.hash === 'string' ? payload.hash : '',
        path: typeof payload?.path === 'string' ? payload.path : '',
        previousPath: typeof payload?.previousPath === 'string' ? payload.previousPath : undefined,
      });
    },
    gitDiff: async (ws, msg) => {
      const parsed = validateGitDiffPayload(msg.payload);
      if (!parsed.ok) {
        sendResult(ws, false, parsed.message);
        return;
      }
      await handleGitDiff(ws, state.getProjectRoot(), parsed.value.path);
    },
    gitStage: async (ws, msg) => {
      const parsed = validateGitStagePayload(msg.payload);
      if (!parsed.ok) {
        sendResult(ws, false, parsed.message);
        return;
      }
      await handleGitStage(ws, state.getProjectRoot(), parsed.value.paths);
    },
    gitUnstage: async (ws, msg) => {
      const parsed = validateGitUnstagePayload(msg.payload);
      if (!parsed.ok) {
        sendResult(ws, false, parsed.message);
        return;
      }
      await handleGitUnstage(ws, state.getProjectRoot(), parsed.value.paths);
    },
    gitDiscard: async (ws, msg) => {
      const parsed = validateGitDiscardPayload(msg.payload);
      if (!parsed.ok) {
        sendResult(ws, false, parsed.message);
        return;
      }
      await handleGitDiscard(ws, state.getProjectRoot(), parsed.value.paths);
    },
    gitCommit: async (ws, msg) => {
      const parsed = validateGitCommitPayload(msg.payload);
      if (!parsed.ok) {
        sendResult(ws, false, parsed.message);
        return;
      }
      await handleGitCommit(ws, state.getProjectRoot(), parsed.value.message);
    },
    shellOpen: async (ws, msg) => {
      const parsed = validateShellOpenPayload(msg.payload);
      if (!parsed.ok) {
        sendResult(ws, false, parsed.message);
        return;
      }
      // Normalize the wire-format target ('file'|'terminal') to the
      // handler contract ('terminal'|'file-manager').
      const normalizedTarget: ShellOpenTarget = normalizeShellOpenTarget(parsed.value.target);
      const authorization = await authorizeWebUIAction(
        deps.trustBoundary,
        {
          capability: normalizedTarget === 'terminal' ? 'process.spawn' : 'filesystem.open-native',
          subject: {
            kind: 'path',
            id: parsed.value.path,
            attributes: { target: normalizedTarget },
          },
          risk: 'elevated',
          cwd: state.getProjectRoot(),
          metadata: { transport: 'websocket' },
        },
        deps.logger,
      );
      if (!authorization.allowed) {
        sendResult(ws, false, `Shell action denied: ${authorization.reason}`);
        return;
      }
      const result: ShellOpenResult = await handleShellOpen(
        { path: parsed.value.path, target: normalizedTarget },
        deps.logger,
        { projectRoot: state.getProjectRoot() },
      );
      sendResult(ws, result.success, result.message);
    },
  };

  const mailboxRoutes = createMailboxRouteHandlers({
    getProjectRoot: state.getProjectRoot,
    getGlobalRoot: () => path.dirname(deps.globalConfigPath),
    events: deps.events,
  });

  const chimeraRoutes: ChimeraRouteHandlers = createChimeraRouteHandlers({
    // Same layout resolution the systemPromptAdapter uses below: projectDir is
    // the per-project WrongStack home (~/.wrongstack/projects/<slug>) where the
    // CLI persists review-reports.jsonl. Read lazily — project switches re-root.
    projectDir: () =>
      resolveWstackPaths({
        projectRoot: state.getProjectRoot(),
        globalRoot: deps.wpaths.globalRoot,
      }).projectDir,
    send,
    log: (message) => deps.logger.warn(message),
  });

  // ---- MCP route (handleMcpRoute) ----
  // Issue #31 follow-on (after #118 PR 0 baseline, #119 prefs extraction).
  // Each callback delegates to the matching handleMcpXxx in mcp-handlers.ts
  // — that module already owns the WS-message logic, this is just the
  // chain-of-responsibility wiring. The 10 cases were pure delegations
  // inside the residual switch before this PR; now they're an explicit
  // sibling in the chain.
  const mcpRoutes: McpRouteHandlers = {
    list: (ws, msg) => handleMcpList(ws, msg, deps.profileConfigPath, deps.mcpRegistry),
    // add/update are the spawn-capable pair — they take a `command`/`args`
    // from the wire and start it. They go past the trust boundary (M1).
    add: (ws, msg) =>
      handleMcpAdd(ws, msg, deps.profileConfigPath, deps.mcpRegistry, deps.trustBoundary),
    update: (ws, msg) =>
      handleMcpUpdate(ws, msg, deps.profileConfigPath, deps.mcpRegistry, deps.trustBoundary),
    remove: (ws, msg) => handleMcpRemove(ws, msg, deps.profileConfigPath, deps.mcpRegistry),
    enable: (ws, msg) =>
      handleMcpEnable(ws, msg, deps.profileConfigPath, deps.mcpRegistry, deps.trustBoundary),
    disable: (ws, msg) =>
      handleMcpDisable(ws, msg, deps.profileConfigPath, deps.mcpRegistry, deps.trustBoundary),
    sleep: (ws, msg) => handleMcpSleep(ws, msg, deps.profileConfigPath, deps.mcpRegistry),
    wake: (ws, msg) =>
      handleMcpWake(ws, msg, deps.profileConfigPath, deps.mcpRegistry, deps.trustBoundary),
    restart: (ws, msg) =>
      handleMcpRestart(ws, msg, deps.profileConfigPath, deps.mcpRegistry, deps.trustBoundary),
    discover: (ws, msg) => handleMcpDiscover(ws, msg, deps.profileConfigPath, deps.mcpRegistry),
    resources: (ws, msg) => handleMcpResources(ws, msg, deps.profileConfigPath, deps.mcpRegistry),
    prompts: (ws, msg) => handleMcpPrompts(ws, msg, deps.profileConfigPath, deps.mcpRegistry),
    resourceRead: (ws, msg) =>
      handleMcpResourceRead(ws, msg, deps.profileConfigPath, deps.mcpRegistry),
    promptGet: (ws, msg) => handleMcpPromptGet(ws, msg, deps.profileConfigPath, deps.mcpRegistry),
  };

  const brainContext: BrainHandlerContext = {
    send,
    brainSettings: deps.brainSettings,
    brainRuntime: deps.brainRuntime,
    getBrainLog: () => deps.brainLog,
    resolveArbiter: () => deps.brain,
    getSessionId: () => deps.context.session?.id,
  };
  const brainRoutes: BrainRouteHandlers = createBrainRouteHandlers(brainContext);

  const goalRoutes: GoalRouteHandlers = {
    handleMessage: (ws, msg) => deps.goalHandler.handleMessage(ws, msg),
  };

  const specsRoutes: SpecsRouteHandlers = {
    handleMessage: (msg) => deps.specsHandler.handleMessage(msg),
  };

  const sddBoardRoutes: SddBoardRouteHandlers = {
    handleMessage: (msg) => deps.sddBoardHandler.handleMessage(msg),
  };

  const sddWizardRoutes: SddWizardRouteHandlers = {
    handleMessage: (msg) => deps.sddWizardHandler.handleMessage(msg),
  };

  return {
    providerRoutes,
    sessionRoutes,
    projectRoutes,
    modeRoutes,
    prefsRoutes,
    autonomyRoutes,
    shellGitRoutes,
    chimeraRoutes,
    mailboxRoutes,
    mcpRoutes,
    brainRoutes,
    goalRoutes,
    specsRoutes,
    sddBoardRoutes,
    sddWizardRoutes,
  };
}
export { computeConfigPrefUpdates } from './config-pref-updates.js';
export type { AllRoutes, WebuiCallbacks, WebuiDeps, WebuiMutableState } from './route-contracts.js';
