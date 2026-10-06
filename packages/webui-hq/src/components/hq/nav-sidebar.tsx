/**
 * The HQ navigation rail.
 *
 * Collapses below 1280px and behind Ctrl+B; on narrow screens it becomes an
 * overlay with a scrim, which is why the scrim is a real <button> rather than
 * a div — a click target that dismisses UI has to be reachable by keyboard.
 */
import { PanelLeftClose } from 'lucide-react';
import type * as React from 'react';
import { useEffect, useRef } from 'react';
import type { HqViewId } from '../../data/store/index.js';
import { cn } from '../../lib/utils.js';
import { Button } from '../ui/button.js';
import { HQ_VIEW_GROUPS, HQ_VIEWS } from './views.js';

export function NavSidebar({
  open,
  activeView,
  unreadCount,
  attentionCount,
  approvalCount = 0,
  narrow = false,
  onNavigate,
  onClose,
}: {
  open: boolean;
  activeView: HqViewId;
  unreadCount: number;
  attentionCount: number;
  approvalCount?: number;
  narrow?: boolean;
  onNavigate: (view: HqViewId) => void;
  onClose: () => void;
}): React.ReactElement {
  const railRef = useRef<HTMLElement>(null);
  const overlayProps: React.HTMLAttributes<HTMLElement> =
    narrow && open ? { role: 'dialog', 'aria-modal': true } : {};
  useEffect(() => {
    if (!open || !narrow) return;
    const previous = document.activeElement;
    const rail = railRef.current;
    if (rail === null) return;
    const buttons = (): HTMLButtonElement[] => [
      ...rail.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
    ];
    (rail.querySelector<HTMLButtonElement>('[aria-current="page"]') ?? buttons()[0])?.focus();
    const trapFocus = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return;
      const targets = buttons();
      const first = targets[0];
      const last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    rail.addEventListener('keydown', trapFocus);
    return () => {
      rail.removeEventListener('keydown', trapFocus);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [open, narrow]);
  const badgeFor = (view: HqViewId): number =>
    view === 'mailbox'
      ? unreadCount
      : view === 'alerts'
        ? attentionCount
        : view === 'approvals'
          ? approvalCount
          : 0;

  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close HQ navigation"
        data-testid="nav-scrim"
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-30 bg-background/70 backdrop-blur-[1px] xl:hidden',
          open ? 'block' : 'hidden',
        )}
      />

      <aside
        id="hq-navigation"
        ref={railRef}
        {...overlayProps}
        aria-label="HQ navigation"
        data-testid="nav-sidebar"
        data-open={open}
        className={cn(
          'z-40 flex h-full w-60 shrink-0 flex-col border-r border-border bg-card',
          'max-xl:fixed max-xl:inset-y-0 max-xl:left-0',
          open ? 'flex' : 'hidden',
        )}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <img
            src="/wrongstack.svg"
            alt=""
            aria-hidden="true"
            draggable={false}
            className="size-5"
          />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
              Command center
            </span>
            <strong className="font-display text-xs">WrongStack HQ</strong>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Collapse HQ navigation"
            title="Collapse navigation (Ctrl+B)"
            className="ml-auto"
          >
            <PanelLeftClose className="size-3.5" />
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          {HQ_VIEW_GROUPS.map((group) => (
            <section key={group} className="mb-3 last:mb-0">
              <div className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/80">
                {group}
              </div>
              {HQ_VIEWS.filter((view) => view.group === group).map((view) => {
                const Icon = view.icon;
                const badge = badgeFor(view.id);
                const active = view.id === activeView;
                return (
                  <button
                    key={view.id}
                    type="button"
                    data-testid="nav-item"
                    data-view={view.id}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => onNavigate(view.id)}
                    title={view.description}
                    className={cn(
                      'flex w-full items-center gap-2 border-l-2 px-2 py-1.5 text-left text-xs transition-colors',
                      active
                        ? 'border-primary bg-accent/60 font-medium text-foreground'
                        : 'border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    <Icon className="size-3.5 shrink-0" />
                    <span className="truncate">{view.label}</span>
                    {badge > 0 && (
                      <span
                        data-testid="nav-badge"
                        className="tabular ml-auto min-w-4 bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-primary-foreground"
                      >
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                    {view.shortcut !== undefined && badge === 0 && (
                      <kbd className="ml-auto text-[9px] text-muted-foreground/60">
                        Alt {view.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </section>
          ))}
        </nav>
        <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
          <span>Ctrl K · Search</span>
          <span className="float-right">Ctrl B · Navigation</span>
        </div>
      </aside>
    </>
  );
}
