/**
 * ActivityBarCustomizeModal — one screen for deciding what lives on the
 * left icon menu.
 *
 * The rail is narrow, so "edit the icon order" used to mean dragging icons
 * inside a 48px column. This dialog replaces that with a single readable
 * surface: the icons that are pinned to the bar on the left, everything else
 * on the right. The user picks what to pin, reorders the pinned icons, and
 * saves — the bar re-renders from the store immediately.
 *
 * The icon budget (`ACTIVITY_BAR_MAX_ICONS`) is stated in the dialog header
 * so the limit is never a surprise.
 */

import { ArrowDown, ArrowUp, Lock, Pin, PinOff, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useIsFullChrome } from '@/hooks/useChromeLevel';
import { useAppTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { PANELS, type PanelDef, VIEWS, type ViewDef } from './activity-bar-items.js';
import {
  ACTIVITY_BAR_MAX_ICONS,
  createPinDraft,
  defaultPinnedIds,
  draftToOrder,
  isAtBudget,
  isFixedPanelId,
  movePinned,
  type PinDraft,
  pinnedCount,
  pinnedOrder,
  togglePin,
  unpinnedOrder,
} from './activity-bar-pins.js';

function RowButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean | undefined;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center border border-transparent text-muted-foreground transition-colors',
        'hover:border-border hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-35',
      )}
    >
      {children}
    </button>
  );
}

export function ActivityBarCustomizeModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useAppTranslation();
  const fullChrome = useIsFullChrome();
  const chromeLevel = fullChrome ? 'full' : 'calm';
  const [draft, setDraft] = useState<PinDraft | null>(null);

  // Seed the draft from the persisted selection every time the dialog opens
  // so an abandoned edit never leaks into the bar.
  useEffect(() => {
    if (!open) return;
    const order = useUIStore.getState().activityBarOrder;
    const seed = order?.pinned ?? defaultPinnedIds(chromeLevel);
    setDraft(createPinDraft(order, { panels: seed.panels, views: seed.views }));
  }, [open, chromeLevel]);

  const panelById = useMemo(
    () => new Map<string, PanelDef>(PANELS.map((panel) => [panel.id, panel])),
    [],
  );
  const viewById = useMemo(
    () => new Map<string, ViewDef>(VIEWS.map((view) => [view.id, view])),
    [],
  );

  if (!draft) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('activity:customize.title')}</DialogTitle>
            <DialogDescription>{t('activity:customize.description')}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  const count = pinnedCount(draft);
  const atBudget = isAtBudget(draft);
  const pinnedPanels = pinnedOrder(draft, 'panels');
  const pinnedViews = pinnedOrder(draft, 'views');
  const othersPanels = unpinnedOrder(draft, 'panels');
  const othersViews = unpinnedOrder(draft, 'views');

  const label = (id: string, fallback: string) => t(`activity:nav.${id}`, fallback);

  const renderPinnedRow = (group: 'panels' | 'views', id: string, fallback: string) => {
    const def = group === 'panels' ? panelById.get(id) : viewById.get(id);
    const order = group === 'panels' ? pinnedPanels : pinnedViews;
    const index = order.indexOf(id);
    const fixed = group === 'panels' && isFixedPanelId(id);
    const name = label(id, fallback);
    return (
      <li
        key={`${group}:${id}`}
        data-testid={`customize-pinned-${id}`}
        className="flex items-center gap-2 border-b border-border/40 py-1 last:border-b-0"
      >
        <span className="shrink-0 text-muted-foreground">{def?.icon}</span>
        <span className="truncate text-sm">{name}</span>
        {fixed && (
          <span
            role="img"
            aria-label={t('activity:customize.fixed')}
            title={t('activity:customize.fixed')}
            className="shrink-0 text-muted-foreground"
          >
            <Lock size={12} />
          </span>
        )}
        <span className="ml-auto flex items-center gap-0.5">
          <RowButton
            label={t('activity:customize.moveUp', { label: name })}
            disabled={fixed || index <= 0}
            onClick={() =>
              setDraft((current) => (current ? movePinned(current, group, id, -1) : current))
            }
          >
            <ArrowUp size={14} />
          </RowButton>
          <RowButton
            label={t('activity:customize.moveDown', { label: name })}
            disabled={fixed || index >= order.length - 1}
            onClick={() =>
              setDraft((current) => (current ? movePinned(current, group, id, 1) : current))
            }
          >
            <ArrowDown size={14} />
          </RowButton>
          {!fixed && (
            <RowButton
              label={t('activity:customize.unpin', { label: name })}
              onClick={() =>
                setDraft((current) => (current ? togglePin(current, group, id) : current))
              }
            >
              <PinOff size={14} />
            </RowButton>
          )}
        </span>
      </li>
    );
  };

  const renderOtherRow = (group: 'panels' | 'views', id: string, fallback: string) => {
    const def = group === 'panels' ? panelById.get(id) : viewById.get(id);
    const name = label(id, fallback);
    return (
      <li
        key={`${group}:${id}`}
        data-testid={`customize-other-${id}`}
        className="flex items-center gap-2 border-b border-border/40 py-1 last:border-b-0"
      >
        <span className="shrink-0 text-muted-foreground/70">{def?.icon}</span>
        <span className="truncate text-sm text-muted-foreground">{name}</span>
        <span className="ml-auto">
          <RowButton
            label={t('activity:customize.pin', { label: name })}
            disabled={atBudget}
            onClick={() =>
              setDraft((current) => (current ? togglePin(current, group, id) : current))
            }
          >
            <Pin size={14} />
          </RowButton>
        </span>
      </li>
    );
  };

  const save = () => {
    useUIStore.getState().setActivityBarOrder(draftToOrder(draft));
    onOpenChange(false);
  };

  const reset = () => {
    const seed = defaultPinnedIds(chromeLevel);
    setDraft(createPinDraft(null, seed));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl" data-testid="activity-bar-customize-dialog">
        <DialogHeader>
          <DialogTitle>{t('activity:customize.title')}</DialogTitle>
          <DialogDescription>{t('activity:customize.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <span className="tabular font-medium text-foreground">
            {t('activity:customize.counter', { count, max: ACTIVITY_BAR_MAX_ICONS })}
          </span>
          <span className="text-muted-foreground">
            {atBudget
              ? t('activity:customize.maxReached', { max: ACTIVITY_BAR_MAX_ICONS })
              : t('activity:customize.budgetHint', { max: ACTIVITY_BAR_MAX_ICONS })}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* ── Pinned column ── */}
          <section
            aria-label={t('activity:customize.pinnedColumn')}
            className="border border-border/70 bg-muted/20 p-3"
          >
            <h3 className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('activity:customize.pinnedColumn')}
            </h3>
            <h4 className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground/80">
              {t('activity:customize.groupPanels')}
            </h4>
            <ul>
              {pinnedPanels.map((id) =>
                renderPinnedRow('panels', id, panelById.get(id)?.label ?? id),
              )}
            </ul>
            <h4 className="mb-1 mt-3 text-[11px] uppercase tracking-wide text-muted-foreground/80">
              {t('activity:customize.groupViews')}
            </h4>
            <ul>
              {pinnedViews.map((id) => renderPinnedRow('views', id, viewById.get(id)?.label ?? id))}
            </ul>
          </section>

          {/* ── Others column ── */}
          <section
            aria-label={t('activity:customize.othersColumn')}
            className="border border-border/70 bg-muted/20 p-3"
          >
            <h3 className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('activity:customize.othersColumn')}
            </h3>
            <h4 className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground/80">
              {t('activity:customize.groupPanels')}
            </h4>
            <ul>
              {othersPanels.length > 0 ? (
                othersPanels.map((id) =>
                  renderOtherRow('panels', id, panelById.get(id)?.label ?? id),
                )
              ) : (
                <li className="py-1 text-sm text-muted-foreground">
                  {t('activity:customize.emptyOthers')}
                </li>
              )}
            </ul>
            <h4 className="mb-1 mt-3 text-[11px] uppercase tracking-wide text-muted-foreground/80">
              {t('activity:customize.groupViews')}
            </h4>
            <ul>
              {othersViews.length > 0 ? (
                othersViews.map((id) => renderOtherRow('views', id, viewById.get(id)?.label ?? id))
              ) : (
                <li className="py-1 text-sm text-muted-foreground">
                  {t('activity:customize.emptyOthers')}
                </li>
              )}
            </ul>
          </section>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            <RotateCcw size={14} />
            {t('activity:customize.reset')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('activity:customize.cancel')}
          </Button>
          <Button type="button" size="sm" onClick={save}>
            {t('activity:customize.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
