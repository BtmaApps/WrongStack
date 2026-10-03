import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { useAppTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import { type SessionPanelSectionId, useSessionPanelLayout } from '@/stores/session-panel-layout';

export interface SessionSection {
  id: SessionPanelSectionId;
  label: string;
  icon: ReactNode;
  content: ReactNode;
  right?: ReactNode;
  visible?: boolean;
  defaultCollapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
}

/** Collapse hides rather than unmounts live workspace subscriptions. */
export function SessionSections({ sections }: { sections: SessionSection[] }) {
  const { t } = useAppTranslation();
  const prefix = useId();
  const savedOrder = useSessionPanelLayout((state) => state.order);
  const collapsed = useSessionPanelLayout((state) => state.collapsed);
  const [dragged, setDragged] = useState<SessionPanelSectionId | null>(null);
  const [target, setTarget] = useState<SessionPanelSectionId | null>(null);
  const order = [
    ...savedOrder,
    ...sections.map(({ id }) => id).filter((id) => !savedOrder.includes(id)),
  ];
  const visible = order.flatMap((id) => {
    const section = sections.find((section) => section.id === id);
    return section && section.visible !== false ? [section] : [];
  });
  const move = (id: SessionPanelSectionId, to: SessionPanelSectionId) => {
    if (id === to) return;
    const next = order.filter((item) => item !== id);
    next.splice(order.indexOf(to), 0, id);
    useSessionPanelLayout.getState().setOrder(next);
  };
  const finish = () => {
    setDragged(null);
    setTarget(null);
  };

  return visible.map((section, index) => {
    const { id, label, icon, right, content } = section;
    const folded = collapsed[id] ?? section.defaultCollapsed ?? false;
    const bodyId = `${prefix}-${id}`;
    const moveBy = (direction: number) => {
      const neighbour = visible[index + direction];
      if (neighbour) move(id, neighbour.id);
    };
    return (
      <section
        key={id}
        aria-label={label}
        data-session-section={id}
        className={cn(
          'shrink-0 border-b border-border/70',
          dragged === id && 'opacity-50',
          target === id && 'ring-2 ring-inset ring-primary/60',
        )}
        onDragOver={(event) => {
          if (!dragged) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setTarget(id);
          const scroller = event.currentTarget.parentElement;
          if (scroller) {
            const rect = scroller.getBoundingClientRect();
            if (event.clientY < rect.top + 32) scroller.scrollTop -= 12;
            if (event.clientY > rect.bottom - 32) scroller.scrollTop += 12;
          }
        }}
        onDrop={(event) => {
          if (!dragged) return;
          event.preventDefault();
          move(dragged, id);
          finish();
        }}
      >
        <div className="flex min-w-0 items-center gap-1 px-2 py-1.5 bg-muted/15">
          <button
            type="button"
            draggable
            aria-label={t('activity:sessionLayout.drag', { label })}
            title={t('activity:sessionLayout.dragHint')}
            className="flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', id);
              setDragged(id);
            }}
            onDragEnd={finish}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
              event.preventDefault();
              moveBy(event.key === 'ArrowUp' ? -1 : 1);
            }}
          >
            <GripVertical size={12} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-expanded={!folded}
            aria-controls={bodyId}
            onClick={() => {
              useSessionPanelLayout.getState().setCollapsed(id, !folded);
              section.onCollapse?.(!folded);
            }}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded py-1 text-left text-[10px] font-semibold uppercase text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
          >
            {folded ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            {icon}
            <span className="truncate">{label}</span>
          </button>
          {right}
          {[-1, 1].map((direction) => (
            <button
              key={direction}
              type="button"
              disabled={!visible[index + direction]}
              aria-label={t(
                direction === -1
                  ? 'activity:sessionLayout.moveUp'
                  : 'activity:sessionLayout.moveDown',
                { label },
              )}
              onClick={() => moveBy(direction)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground disabled:opacity-20 focus-visible:ring-2 focus-visible:ring-primary"
            >
              {direction === -1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
            </button>
          ))}
        </div>
        <div id={bodyId} hidden={folded}>
          {content}
        </div>
      </section>
    );
  });
}
