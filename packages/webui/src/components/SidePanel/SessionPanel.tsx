/**
 * SessionPanel — the default side panel ("Session" activity).
 *
 * Single home for everything about the current run: quick actions, model,
 * context usage, live stats, the agent's plan, pinned answers, and the
 * handful of settings you actually flip mid-session (autonomy, YOLO,
 * refine, sound). Rarely-touched configuration stays in Settings.
 */
import {
  Cpu,
  Crosshair,
  Download,
  Eraser,
  Gauge,
  History,
  ListTodo,
  MoreHorizontal,
  PanelsTopLeft,
  Pin,
  Plus,
  Shrink,
  SlidersHorizontal,
  Square,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIsFullChrome } from '@/hooks/useChromeLevel';
import { usePagination } from '@/hooks/usePagination';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAppTranslation } from '@/i18n';
import { agentBelongsToSession } from '@/lib/agent-session';
import { playCompletionChime } from '@/lib/chime';
import { getWSClient } from '@/lib/ws-client';
import {
  MAX_OPEN_TABS,
  useActiveSessionId,
  useBugHuntRunStore,
  useChatStore,
  useConfigStore,
  useFleetStore,
  useHistoryStore,
  useSessionStore,
  useSessionTabStore,
  useUIStore,
} from '@/stores';
import { useLocalPrefs } from '@/stores/local-prefs';
import { describeSessionActivity, isTabBusy } from '@/stores/session-tab-store';
import { useSystemPromptStore } from '@/stores/system-prompt-store';
import { fmtTok } from '../ChatView/utils';
import { downloadChatAsMarkdown } from '../CommandPalette';
import { confirmModal } from '../ConfirmModal';
import { toast } from '../Toaster';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { WorkspaceDock } from '../WorkspaceDock';
import { ProviderQuotaPanel } from './ProviderQuotaPanel';
import { ActionButton, QuickSegmented, QuickToggle, StatBox } from './SessionPanelControls.js';
import { SessionHistoryList, SessionPinnedList, SessionPlanList } from './SessionPanelLists';
import { type SessionSection, SessionSections } from './SessionSections';

// ── Formatting helpers ────────────────────────────────────────────────

function fmtCost(v: number): string {
  if (v <= 0) return '$0.000';
  if (v >= 0.01) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(4)}`;
}

function fmtElapsed(ms: number): string {
  if (ms <= 0) return '--';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function _shortSessionId(sessionId: string): string {
  const leaf = sessionId.split('/').pop() ?? sessionId;
  return leaf.length > 18 ? leaf.slice(0, 18) : leaf;
}

// ── Panel ─────────────────────────────────────────────────────────────

export function SessionPanel() {
  const { updatePrefs, switchAutonomy } = useWebSocket();
  const { t } = useAppTranslation();
  const wsConnected = useConfigStore((s) => s.wsConnected);
  const wsUrl = useConfigStore((s) => s.wsUrl);
  const soundOnComplete = useConfigStore((s) => s.soundOnComplete);

  const session = useSessionStore((s) => s.session);
  const totalTokens = useSessionStore((s) => s.totalTokens);
  const cost = useSessionStore((s) => s.cost);
  const iteration = useSessionStore((s) => s.iteration);
  const todos = useSessionStore((s) => s.todos);

  const messages = useChatStore((s) => s.messages);
  const isLoading = useChatStore((s) => s.isLoading);
  const fleetAgents = useFleetStore((s) => s.agents);

  const pinnedIds = useUIStore((s) => s.pinnedIds);
  const unpinAll = useUIStore((s) => s.unpinAll);
  const historyEntries = useHistoryStore((s) => s.entries);

  const localPrefs = useLocalPrefs();
  const fullChrome = useIsFullChrome();
  const statsExpanded = localPrefs.sessionStatsExpanded;
  // Tracks the last non-'off' autonomy mode so the binary toggle can
  // restore it after a kill-switch. Persisted in module scope so it
  // survives component remounts but resets on a hard page reload.
  const lastAutonomyRef = useRef<typeof localPrefs.autonomy>(
    localPrefs.autonomy === 'off' ? 'auto' : localPrefs.autonomy,
  );
  const syncPref = useCallback(
    (key: string, value: unknown) => {
      localPrefs.set({ [key]: value } as Parameters<typeof localPrefs.set>[0]);
      updatePrefs({ [key]: value });
    },
    [localPrefs, updatePrefs],
  );

  // Elapsed time ticks every second while a session exists — the old
  // sidebar computed Date.now() in render and showed a frozen value.
  const startedAt = session?.startedAt ?? null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  const currentSessionId = useActiveSessionId() ?? session?.id;
  const bugHuntRun = useBugHuntRunStore((state) =>
    currentSessionId ? state.runs[currentSessionId] : undefined,
  );
  const runningAgents = useMemo(
    () =>
      Array.from(fleetAgents.values()).filter(
        (a) => a.status === 'running' && agentBelongsToSession(a.sessionId, currentSessionId),
      ).length,
    [fleetAgents, currentSessionId],
  );
  const sessionAgents = useMemo(
    () =>
      Array.from(fleetAgents.values()).filter((a) =>
        agentBelongsToSession(a.sessionId, currentSessionId),
      ),
    [fleetAgents, currentSessionId],
  );

  useEffect(() => {
    lastAutonomyRef.current = localPrefs.autonomy === 'off' ? 'auto' : localPrefs.autonomy;
  }, [currentSessionId]);

  const pinnedRows = pinnedIds
    .map((id) => messages.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => !!m && m.content.length > 0);
  const todoPage = usePagination(todos, 12, session?.id);
  const pinnedPage = usePagination(pinnedRows, 8, session?.id);

  /**
   * Send, addressed at the tab this panel is describing.
   *
   * The panel is one surface over four sessions, so a bare `send` lands on
   * whichever session the server is currently pointing at: Stop aborted
   * another tab's run, Compact compacted another tab's conversation and Clear
   * emptied it.
   *
   * Every send in this file goes through here.
   * session-stamping: stamped-at-helper
   */
  // Memoised on `wsUrl` alone, which is all it closes over. A fresh function
  // each render would make every effect that depends on it fire each render —
  // the history fetch below would become a request per paint.
  const send = useCallback(
    (msg: { type: string; payload?: Record<string, unknown> | undefined }) => {
      const client = getWSClient(wsUrl);
      if (!client?.send) return;
      client.send({ ...msg, payload: client.withSession({ ...(msg.payload ?? {}) }) } as Parameters<
        NonNullable<typeof client.send>
      >[0]);
    },
    [wsUrl],
  );

  /**
   * New session in a NEW tab — the same funnel as the tab bar's `+` and
   * Ctrl+N: the identity-prompt picker applies the variant, then sends
   * `session.new`, which never touches the sessions other tabs hold.
   */
  const handleNewSession = useCallback(() => {
    const { openTabIds } = useSessionTabStore.getState();
    if (openTabIds.length < MAX_OPEN_TABS) {
      useSystemPromptStore.getState().openPicker({ startsSession: true });
      return;
    }
    toast.info(
      t('activity:sessions.allTabsRunning', {
        defaultValue: 'All 4 tab slots are full. Close a tab before opening a new session.',
      }),
    );
  }, [t]);

  /**
   * Clear retires THIS tab's session and starts a fresh record in the SAME
   * tab: `session.new` with `replaceSessionId`. The server closes the old
   * session's journal (aborting its run) and answers with a reset
   * `session.start` carrying `clearedSessionId`, which rebinds this tab's
   * slot to the new id — see `swapTabSession` in session-tab-store. The old
   * session stays in History as a closed record; nothing is deleted.
   */
  const handleClear = useCallback(async () => {
    const client = getWSClient(wsUrl);
    if (!client?.newSession || !wsConnected || !currentSessionId) return;
    // Retiring a busy session aborts its run — the same guard the tab-close
    // path uses, with the wording the old panel flow established.
    if (isTabBusy(currentSessionId)) {
      const report = describeSessionActivity(currentSessionId);
      const ok = await confirmModal({
        title: t('activity:sessionPanel.actions.newSessionConfirm'),
        message: t('activity:sessionPanel.actions.newSessionConfirmMessage'),
        details: report.lines,
        confirmLabel: t('common:action.clear'),
        cancelLabel: t('common:action.cancel', { defaultValue: 'Cancel' }),
        danger: true,
        // Enter/Escape must land on the safe side of a destructive clear.
        defaultAction: 'cancel',
      });
      if (!ok) return;
    }
    // The lane swap that lands later disposes the retired conversation; here
    // only the composer's pending input goes, so nothing of the old session
    // is left sitting in the input the new record starts with.
    const ui = useUIStore.getState();
    ui.setDraftInput('');
    ui.setDraftImages([]);
    ui.setRefinePanel(null);
    ui.setQueuePanelOpen(false);
    client.newSession({ replaceSessionId: currentSessionId });
  }, [wsUrl, wsConnected, currentSessionId, t]);

  // Fetch the session list when connected so the History section populates.
  // Through the addressed `send` above, not a bare client call: the reply's
  // `isCurrent` marks the ASKING tab's session, and an untagged ask is
  // answered about whichever session the runtime last touched.
  useEffect(() => {
    if (!wsConnected) return;
    send({ type: 'sessions.list', payload: { limit: 8 } });
  }, [wsConnected, send]);

  const actionsSection = (
    <>
      {/* ── Quick actions ── */}
      <div className="grid grid-cols-2 gap-1.5 bg-card/55 px-3 pb-2.5">
        {isLoading && (
          <ActionButton
            icon={<Square className="h-3 w-3" />}
            label={t('activity:sessionPanel.actions.abort')}
            tone="danger"
            onClick={() => send({ type: 'abort', payload: {} })}
            disabled={!wsConnected}
          />
        )}
        <ActionButton
          icon={<Plus className="h-3 w-3" />}
          label={t('activity:sessionPanel.actions.newSession')}
          onClick={handleNewSession}
          disabled={!wsConnected}
          title={t('activity:sessionPanel.actions.newSessionTitle')}
        />
        <ActionButton
          icon={<Download className="h-3 w-3" />}
          label={t('activity:sessionPanel.actions.export')}
          onClick={() => downloadChatAsMarkdown()}
          title={t('activity:sessionPanel.actions.exportTitle')}
        />
        <ActionButton
          icon={<Shrink className="h-3 w-3" />}
          label={t('activity:sessionPanel.actions.compact')}
          onClick={() => send({ type: 'context.compact', payload: { aggressive: false } })}
          disabled={!wsConnected}
          title={t('activity:sessionPanel.actions.compactTitle')}
        />
        <ActionButton
          icon={<Eraser className="h-3 w-3" />}
          label={t('common:action.clear')}
          onClick={handleClear}
          disabled={!wsConnected}
          title={t('activity:sessionPanel.actions.clearTitle')}
        />
      </div>
    </>
  );
  const dockSection = (
    <>
      {/* Workspace controls stay with the session they describe. */}
      <div className="px-3 pb-2.5">
        <WorkspaceDock />
      </div>
    </>
  );
  const statsSection = (
    <>
      <div className="px-3 pb-2.5">
        <div className="grid grid-cols-2 gap-1.5">
          <StatBox label={t('activity:sessionPanel.stats.messages')} value={messages.length} />
          <StatBox
            label={t('activity:sessionPanel.stats.elapsed')}
            value={startedAt ? fmtElapsed(now - startedAt) : '--'}
          />
          <StatBox
            label={t('activity:sessionPanel.stats.tokens')}
            value={fmtTok(totalTokens.input + totalTokens.output)}
            sub={t('activity:sessionPanel.stats.tokensSub', {
              in: fmtTok(totalTokens.input),
              out: fmtTok(totalTokens.output),
            })}
          />
          <StatBox label={t('activity:sessionPanel.stats.cost')} value={fmtCost(cost)} />
          {iteration && (
            <StatBox
              label={t('activity:sessionPanel.stats.iteration')}
              value={iteration.index}
              sub={
                iteration.max
                  ? t('activity:sessionPanel.stats.iterationOf', { max: iteration.max })
                  : undefined
              }
            />
          )}
          {sessionAgents.length > 0 && (
            <StatBox
              label={t('activity:sessionPanel.stats.agents')}
              value={sessionAgents.length}
              sub={
                runningAgents > 0
                  ? t('activity:sessionPanel.stats.agentsRunning', { count: runningAgents })
                  : undefined
              }
            />
          )}
        </div>
      </div>
    </>
  );
  const quotaSection = (
    <>
      {/* ── Subscription plan quota (Codex, MiniMax, Z.AI) ── */}
      <ProviderQuotaPanel embedded />
    </>
  );
  const planSection = <SessionPlanList todos={todos} todoPage={todoPage} />;
  const pinnedSection = <SessionPinnedList pinnedRows={pinnedRows} pinnedPage={pinnedPage} />;
  const bugHuntSection = (
    <>
      {bugHuntRun && (
        <div className="bg-primary/[0.06] px-3 pb-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-primary">
            <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t('activity:sessionPanel.bugHuntInProgress')}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('activity:sessionPanel.bugHuntRoundOf', {
              current: bugHuntRun.currentRound,
              total: bugHuntRun.totalRounds,
            })}
            {bugHuntRun.scope
              ? ` · ${bugHuntRun.scope}`
              : ` · ${t('activity:message.wholeProject')}`}
          </p>
        </div>
      )}
    </>
  );
  const quickSettingsSection = (
    <>
      {/* ── Quick settings — the mid-session knobs ── */}
      <div className="space-y-1 px-3 pb-2.5">
        <QuickToggle
          label={t('activity:sessionPanel.autonomy')}
          title={t('activity:sessionPanel.autonomyTitle')}
          value={localPrefs.autonomy !== 'off'}
          onChange={() => {
            const next = localPrefs.autonomy === 'off' ? lastAutonomyRef.current : 'off';
            if (next !== 'off') lastAutonomyRef.current = next;
            localPrefs.set({ autonomy: next });
            switchAutonomy(next);
          }}
        />
        <QuickSegmented
          label={t('activity:sessionPanel.yolo')}
          title={t('activity:sessionPanel.yoloTitle')}
          value={localPrefs.yolo ? (localPrefs.yoloPlus ? 'plus' : 'on') : 'off'}
          options={[
            {
              value: 'off',
              label: t('activity:sessionPanel.yoloOff'),
              title: t('activity:sessionPanel.yoloOffTitle'),
            },
            {
              value: 'on',
              label: t('activity:sessionPanel.yoloOn'),
              title: t('activity:sessionPanel.yoloOnTitle'),
            },
            {
              value: 'plus',
              label: t('activity:sessionPanel.yoloPlus'),
              title: t('activity:sessionPanel.yoloPlusTitle'),
              tone: 'danger',
            },
          ]}
          onChange={(level) => {
            // YOLO+ never outlives YOLO: leave it before turning YOLO off, and
            // turn YOLO on before entering it — the order the settings tab uses.
            if (level === 'off') {
              if (localPrefs.yoloPlus) syncPref('yoloPlus', false);
              syncPref('yolo', false);
            } else if (level === 'on') {
              if (!localPrefs.yolo) syncPref('yolo', true);
              if (localPrefs.yoloPlus) syncPref('yoloPlus', false);
            } else {
              if (!localPrefs.yolo) syncPref('yolo', true);
              syncPref('yoloPlus', true);
            }
          }}
        />
        <QuickToggle
          label={t('activity:sessionPanel.sound')}
          title={t('activity:sessionPanel.soundTitle')}
          value={soundOnComplete}
          onChange={() => {
            const next = !useConfigStore.getState().soundOnComplete;
            useConfigStore.getState().setSoundOnComplete(next);
            if (next) playCompletionChime();
          }}
        />
      </div>
    </>
  );
  const historySection = (
    <SessionHistoryList historyEntries={historyEntries} fullChrome={fullChrome} />
  );
  // Calm chrome: one primary action (New session, plus Abort while running);
  // Export / Compact / Clear move into the row's "more" menu with the same
  // handlers and the same disabled rules.
  const calmActionsSection = (
    <div className="flex items-center gap-1.5 bg-card/55 px-3 pb-2.5">
      <div className="grid flex-1">
        <ActionButton
          icon={<Plus className="h-3 w-3" />}
          label={t('activity:sessionPanel.actions.newSession')}
          onClick={handleNewSession}
          disabled={!wsConnected}
          title={t('activity:sessionPanel.actions.newSessionTitle')}
        />
      </div>
      {isLoading && (
        <div className="grid flex-1">
          <ActionButton
            icon={<Square className="h-3 w-3" />}
            label={t('activity:sessionPanel.actions.abort')}
            tone="danger"
            onClick={() => send({ type: 'abort', payload: {} })}
            disabled={!wsConnected}
          />
        </div>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-testid="session-actions-menu"
            title={t('activity:sessionPanel.actions.more')}
            aria-label={t('activity:sessionPanel.actions.more')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground/80 transition-colors hover:bg-accent"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => downloadChatAsMarkdown()} className="gap-2">
            <Download className="h-4 w-4" />
            {t('activity:sessionPanel.actions.export')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!wsConnected}
            onSelect={() => send({ type: 'context.compact', payload: { aggressive: false } })}
            className="gap-2"
          >
            <Shrink className="h-4 w-4" />
            {t('activity:sessionPanel.actions.compact')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!wsConnected}
            onSelect={handleClear}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <Eraser className="h-4 w-4" />
            {t('common:action.clear')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const sections: SessionSection[] = [
    {
      id: 'actions',
      label: t('activity:sessionLayout.actions'),
      icon: <Plus size={12} />,
      content: fullChrome ? actionsSection : calmActionsSection,
    },
    {
      id: 'workspace',
      label: t('activity:sessionLayout.workspace'),
      icon: <PanelsTopLeft size={12} />,
      content: dockSection,
    },
    {
      id: 'stats',
      label: t('activity:sessionPanel.sessionLabel'),
      icon: <Cpu size={12} />,
      content: statsSection,
      defaultCollapsed: !fullChrome && !statsExpanded,
      onCollapse: (folded) => localPrefs.set({ sessionStatsExpanded: !folded }),
    },
    {
      id: 'quota',
      label: t('activity:quotaPanel.title'),
      icon: <Gauge size={12} />,
      content: quotaSection,
    },
    {
      id: 'plan',
      label: t('activity:sessionPanel.plan'),
      icon: <ListTodo size={12} />,
      content: planSection,
      visible: todos.length > 0,
      right: (
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {todos.filter((todo) => todo.status === 'completed').length}/{todos.length}
        </span>
      ),
    },
    {
      id: 'pinned',
      label: t('activity:sessionPanel.pinned'),
      icon: <Pin size={12} />,
      content: pinnedSection,
      visible: pinnedRows.length > 0,
      right: (
        <button
          type="button"
          onClick={unpinAll}
          className="text-[10px] text-muted-foreground hover:text-destructive"
        >
          {t('common:action.clear')}
        </button>
      ),
    },
    {
      id: 'bug-hunt',
      label: t('activity:sessionLayout.bugHunt'),
      icon: <Crosshair size={12} />,
      content: bugHuntSection,
      visible: Boolean(bugHuntRun),
    },
    {
      id: 'settings',
      label: t('activity:sessionPanel.quickSettings'),
      icon: <SlidersHorizontal size={12} />,
      content: quickSettingsSection,
    },
    {
      id: 'history',
      label: t('activity:nav.history', 'History'),
      icon: <History size={12} />,
      content: historySection,
      visible: historyEntries.length > 0,
      right: (
        <button
          type="button"
          onClick={() => {
            const ui = useUIStore.getState();
            ui.setCurrentView('sessions');
            ui.setSidebarOpen(false);
          }}
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          {t('activity:history.openDashboard', 'Open Dashboard')}
        </button>
      ),
    },
  ];
  const defaultOrder = fullChrome
    ? [
        'actions',
        'workspace',
        'stats',
        'quota',
        'plan',
        'pinned',
        'bug-hunt',
        'settings',
        'history',
      ]
    : [
        'actions',
        'workspace',
        'plan',
        'pinned',
        'history',
        'stats',
        'quota',
        'bug-hunt',
        'settings',
      ];

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-[hsl(var(--surface-2)/0.28)] [scrollbar-gutter:stable]">
      <SessionSections
        sections={defaultOrder.flatMap((id) => sections.filter((section) => section.id === id))}
      />
    </div>
  );
}
