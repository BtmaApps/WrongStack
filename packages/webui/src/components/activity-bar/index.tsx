import { Check, Pencil, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useIsFullChrome } from '@/hooks/useChromeLevel';
import { useAppTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  openMainView,
  openPanel,
  shortcutLabelForActivity,
  showPanel,
} from '@/lib/view-navigation';
import {
  type Activity,
  selectUnreadCount,
  useConfigStore,
  useMailboxStore,
  useSessionStore,
  useSessionTabStore,
  useUIStore,
} from '@/stores';
import {
  applyLockedAnchors,
  DESKTOP_CORE_PANEL_IDS,
  moveItemId,
  PANELS,
  resolveActivityOrder,
  splitDesktopActivityBarItems,
  useDesktopActivityCapacity,
  VIEWS,
} from './activity-bar-items.js';
import { ActivityIcon, UtilitiesMenu } from './activity-bar-utilities.js';
import { ToolsLauncher } from './tools-launcher';

export {
  applyLockedAnchors,
  calculateDesktopActivityCapacity,
  moveItemId,
  resolveActivityOrder,
  splitDesktopActivityBarItems,
} from './activity-bar-items.js';

/**
 * Calm chrome keeps this many main views (the first of the user's order) on
 * the bar; every view — these included — is in the ToolsLauncher map.
 */
const CALM_BAR_VIEW_COUNT = 4;
// Convenience set for O(1) `isLocked` checks during drag/drop.
const DESKTOP_CORE_PANEL_IDS_SET: ReadonlySet<string> = new Set(DESKTOP_CORE_PANEL_IDS);

export const PANEL_ORDER: readonly Activity[] = PANELS.map((p) => p.id);

export function ActivityBar({ desktopShell = false }: { desktopShell?: boolean | undefined }) {
  const activeActivity = useUIStore((s) => s.activeActivity);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const currentView = useUIStore((s) => s.currentView);
  const projectName = useSessionStore((s) => s.projectName);
  const wsConnected = useConfigStore((s) => s.wsConnected);
  const { t } = useAppTranslation();
  // Translate nav labels at render time (arrays are module-level constants;
  // `def.label` is kept as the English fallback for any missing key).
  const navLabel = (id: string, fallback: string) => t(`activity:nav.${id}`, fallback);
  const unreadMail = useMailboxStore(selectUnreadCount);
  // Active session-tab count — rendered as the chat icon's badge.
  const openTabCount = useSessionTabStore((s) => s.openTabIds.length);
  // Subscribe (not getState()) so the utility trigger updates its active
  // highlight when the inspector opens or closes.
  const inspectorOpen = useUIStore((s) => s.inspectorOpen);
  // ── User-customized icon order (drag/drop) ──
  // Local-only reorder UI mode; the actual order itself lives in the
  // persisted store so it survives F5 + reload.
  const customOrder = useUIStore((s) => s.activityBarOrder);
  const setCustomOrder = useUIStore((s) => s.setActivityBarOrder);
  const [reorderMode, setReorderMode] = useState(false);
  // ── Effective ordering ──
  // Panels: locked anchors (chat/files/changes/mailbox) stay at top in
  // default relative order; the rest fill the remaining slots in
  // `customOrder.panels` (filtered/deduped). Views: full reorder (no
  // locked items below the panels).
  const orderedPanels = useMemo(
    () => applyLockedAnchors(PANELS, customOrder?.panels, DESKTOP_CORE_PANEL_IDS_SET),
    [customOrder?.panels],
  );
  const orderedViews = useMemo(
    () => resolveActivityOrder(VIEWS, customOrder?.views),
    [customOrder?.views],
  );
  // Calm chrome (outside reorder mode): the bar carries only the first
  // CALM_BAR_VIEW_COUNT views plus the ToolsLauncher, which maps them all.
  // Reorder mode shows every view again so any of them can be dragged into
  // those first slots.
  const fullChrome = useIsFullChrome();
  const calmBar = !fullChrome && !reorderMode;
  const barViews = useMemo(
    () => (calmBar ? orderedViews.slice(0, CALM_BAR_VIEW_COUNT) : orderedViews),
    [calmBar, orderedViews],
  );
  // Always calculate capacity — when icons don't fit the viewport they
  // overflow into the "…" menu instead of scrolling. The launcher takes a slot.
  const desktopCapacity = useDesktopActivityCapacity(desktopShell);
  const desktopSplit = useMemo(
    () =>
      splitDesktopActivityBarItems(
        calmBar ? desktopCapacity - 1 : desktopCapacity,
        orderedPanels,
        barViews,
      ),
    [calmBar, desktopCapacity, orderedPanels, barViews],
  );
  const visiblePanelIdSet = useMemo(
    () => new Set(desktopSplit.visiblePanelIds),
    [desktopSplit.visiblePanelIds],
  );
  const overflowPanelIdSet = useMemo(
    () => new Set(desktopSplit.overflowPanelIds),
    [desktopSplit.overflowPanelIds],
  );
  const visibleViewIdSet = useMemo(
    () => new Set(desktopSplit.visibleViewIds),
    [desktopSplit.visibleViewIds],
  );
  const overflowViewIdSet = useMemo(
    () => new Set(desktopSplit.overflowViewIds),
    [desktopSplit.overflowViewIds],
  );
  const visiblePanels = orderedPanels.filter((def) => visiblePanelIdSet.has(def.id));
  const overflowPanels = orderedPanels.filter((def) => overflowPanelIdSet.has(def.id));
  const visibleViews = barViews.filter((def) => visibleViewIdSet.has(def.id));
  // Calm: the launcher already lists every view, so "…" does not repeat them.
  const overflowViews = calmBar ? [] : barViews.filter((def) => overflowViewIdSet.has(def.id));

  const badgeFor = (id: Activity): number | undefined => {
    if (id === 'mailbox') return unreadMail || undefined;
    if (id === 'chat') return openTabCount > 0 ? openTabCount : undefined;
    return undefined;
  };

  // Drag state (transient; lives only while `reorderMode` is on).
  // HTML5 DnD handles only same-group drops; locked items are never
  // valid drop targets (anchors).
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const isLockedId = (id: string) => DESKTOP_CORE_PANEL_IDS_SET.has(id);
  const closeReorder = () => {
    setReorderMode(false);
    setDragId(null);
    setDragOverId(null);
  };
  const resetCustomOrder = () => {
    setCustomOrder(null);
    closeReorder();
  };
  // ── Drag handlers ──
  const onDragStart = (group: 'panel' | 'view', id: string) => (e: React.DragEvent) => {
    if (!reorderMode) return;
    if (group === 'panel' && isLockedId(id)) {
      e.preventDefault();
      return;
    }
    setDragId(id);
    setDragOverId(null);
    e.dataTransfer.effectAllowed = 'move';
  };
  // `_group` is part of the call shape every handler factory here shares; this
  // one decides purely from `id`.
  const onDragOver = (_group: 'panel' | 'view', id: string) => (e: React.DragEvent) => {
    if (!reorderMode || dragId == null || dragId === id) return;
    if (isLockedId(id)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverId !== id) setDragOverId(id);
  };
  const onDragLeave = (id: string) => (e: React.DragEvent) => {
    if (dragOverId === id) setDragOverId(null);
    e.preventDefault();
  };
  const onDrop = (group: 'panel' | 'view', id: string) => (e: React.DragEvent) => {
    if (!reorderMode || dragId == null || dragId === id) return;
    if (isLockedId(id)) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    if (group === 'panel') {
      const current = orderedPanels.map((p) => p.id);
      const next = moveItemId(current, dragId, id);
      setCustomOrder({ panels: next, views: orderedViews.map((v) => v.id) });
    } else {
      const current = orderedViews.map((v) => v.id);
      const next = moveItemId(current, dragId, id);
      setCustomOrder({ panels: orderedPanels.map((p) => p.id), views: next });
    }
    setDragId(null);
    setDragOverId(null);
  };
  const onDragEnd = () => {
    setDragId(null);
    setDragOverId(null);
  };

  return (
    <div
      className={cn(
        'flex h-full min-h-0 shrink-0 flex-col border-r border-border/70 bg-card/75 backdrop-blur-xl',
        desktopShell ? 'w-10' : 'w-12',
      )}
    >
      {/* ── Branding — edge-to-edge logo (pinned top) ── */}
      <div className="flex flex-col items-center shrink-0 border-b border-border/60">
        <button
          type="button"
          onClick={() => {
            // "Home" — open the Session panel, back to chat.
            showPanel('chat');
          }}
          title={
            projectName
              ? t('activity:brand.returnToChat', { name: projectName })
              : t('activity:brand.returnToChatDefault')
          }
          className={cn(
            'relative flex items-center justify-center overflow-hidden bg-foreground transition-shadow hover:shadow-[0_3px_12px_-2px_hsl(var(--primary)/0.5)]',
            desktopShell ? 'w-full h-8' : 'w-full h-11',
          )}
        >
          <img
            src="/wrongstack.svg"
            alt=""
            aria-hidden="true"
            draggable={false}
            className="ws-brand-logo h-full w-full"
          />
        </button>
      </div>

      {/* ── Icon column ──
            Panels + main-view icons. When the viewport is too short to fit
            all icons, overflow items are moved into the "…" menu instead of
            scrolling. Note: `overflow-hidden` means browser WebUI (full) mode
            also loses scroll fallback — ensure enough slots for core icons. */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col items-center pt-2 pb-1">
        {/* Panel icons */}
        {visiblePanels.map((def) => {
          const locked = isLockedId(def.id);
          return (
            <ActivityIcon
              key={def.id}
              compact={desktopShell}
              icon={def.icon}
              label={`${navLabel(def.id, def.label)} (${shortcutLabelForActivity(def.id)})`}
              active={sidebarOpen && activeActivity === def.id}
              badge={badgeFor(def.id)}
              onClick={() => openPanel(def.id)}
              reorderMode={reorderMode}
              draggable={reorderMode && !locked}
              locked={locked}
              isDragOver={reorderMode && dragOverId === def.id}
              isDragging={reorderMode && dragId === def.id}
              onDragStart={onDragStart('panel', def.id)}
              onDragOver={onDragOver('panel', def.id)}
              onDragLeave={onDragLeave(def.id)}
              onDrop={onDrop('panel', def.id)}
              onDragEnd={onDragEnd}
            />
          );
        })}

        {/* Divider between panels and main-view switchers */}
        {visibleViews.length > 0 && <div className="my-1.5 h-px w-6 shrink-0 bg-border/70" />}

        {/* Main-view icons */}
        {visibleViews.map((def) => (
          <ActivityIcon
            key={def.id}
            compact={desktopShell}
            icon={def.icon}
            label={navLabel(def.id, def.label)}
            active={currentView === def.id}
            onClick={() => openMainView(def.id)}
            reorderMode={reorderMode}
            draggable={reorderMode}
            isDragOver={reorderMode && dragOverId === def.id}
            isDragging={reorderMode && dragId === def.id}
            onDragStart={onDragStart('view', def.id)}
            onDragOver={onDragOver('view', def.id)}
            onDragLeave={onDragLeave(def.id)}
            onDrop={onDrop('view', def.id)}
            onDragEnd={onDragEnd}
          />
        ))}

        {calmBar && (
          <ToolsLauncher compact={desktopShell} onCustomize={() => setReorderMode(true)} />
        )}
      </div>

      {/* ── Connection indicator — compact dot between icon column and utilities ── */}
      <div
        role="status"
        aria-label={
          wsConnected
            ? t('activity:connection.connected', 'Connected')
            : t('activity:connection.disconnected', 'Disconnected')
        }
        className="flex items-center justify-center py-1"
      >
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            wsConnected ? 'bg-success' : 'bg-muted-foreground/40',
          )}
          title={
            wsConnected
              ? t('activity:connection.connected', 'Connected')
              : t('activity:connection.disconnected', 'Disconnected')
          }
        />
      </div>

      {/* ── Utilities overflow menu — pinned bottom ──
            App-wide controls (palette, command, shortcuts, monitors,
            Settings) collapsed into one popover. Items that don't fit
            the visible icon slots also land here. */}
      <div className="flex flex-col items-center shrink-0 pt-1 pb-2 border-t border-border/60">
        {/* ── Edit / done / reset toggles (drag/drop edit mode) ──
              Lives in the same bottom sticky column as the utilities
              "…" so it stays discoverable without crowding the icon
              column. Click-cycle: pencil → done. Reset is a one-tap
              escape back to the default priority order. */}
        {reorderMode ? (
          <>
            <button
              type="button"
              data-testid="activity-bar-reorder-done"
              onClick={closeReorder}
              aria-label={t('activity:reorder.done', 'Done')}
              title={t('activity:reorder.done', 'Done')}
              className={cn(
                'ws-nav-button relative flex shrink-0 items-center justify-center rounded-md transition-colors',
                desktopShell ? 'h-9 w-9' : 'h-11 w-11',
                'text-primary bg-primary/10 ring-1 ring-primary/30 hover:bg-primary/15',
              )}
            >
              <span className="h-5 w-5 shrink-0">
                <Check size={16} />
              </span>
            </button>
            <button
              type="button"
              data-testid="activity-bar-reorder-reset"
              onClick={resetCustomOrder}
              aria-label={t('activity:reorder.reset', 'Reset to default')}
              title={t('activity:reorder.reset', 'Reset to default')}
              className={cn(
                'ws-nav-button relative flex shrink-0 items-center justify-center rounded-md transition-colors',
                desktopShell ? 'h-9 w-9' : 'h-11 w-11',
                'text-muted-foreground hover:border-border/70 hover:text-foreground hover:bg-muted/60',
              )}
            >
              <span className="h-5 w-5 shrink-0">
                <RotateCcw size={16} />
              </span>
            </button>
          </>
        ) : (
          <button
            type="button"
            data-testid="activity-bar-reorder-edit"
            onClick={() => setReorderMode(true)}
            aria-label={t('activity:reorder.edit', 'Edit order')}
            title={t('activity:reorder.edit', 'Edit order')}
            className={cn(
              'ws-nav-button relative flex shrink-0 items-center justify-center rounded-md transition-colors',
              desktopShell ? 'h-9 w-9' : 'h-11 w-11',
              'text-muted-foreground hover:border-border/70 hover:text-foreground hover:bg-muted/60',
            )}
          >
            <span className="h-5 w-5 shrink-0">
              <Pencil size={16} />
            </span>
          </button>
        )}
        <UtilitiesMenu
          compact={desktopShell}
          monitorOpen={inspectorOpen}
          overflowPanels={overflowPanels}
          overflowViews={overflowViews}
        />
      </div>
    </div>
  );
}
