import {
  Activity,
  Brain,
  FileDiff,
  FileText,
  KeyRound,
  LibraryBig,
  ListChecks,
  Map as MapIcon,
  MoreHorizontal,
  PanelRight,
  Workflow,
  Wrench,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  dispatchOpenWorkspacePanel,
  dispatchSimplePanel,
  type SimplePanelEvent,
  type WorkspacePanelView,
} from './lib/panel-events.js';

type DockAction = {
  label: string;
  icon: typeof Brain;
} & (
  | { kind: 'utility'; event: SimplePanelEvent }
  | { kind: 'workspace'; view: WorkspacePanelView }
);

const WORKSPACE_ACTIONS: ReadonlyArray<DockAction> = [
  { kind: 'workspace', view: 'tools', label: 'Tools', icon: Wrench },
  { kind: 'workspace', view: 'flow', label: 'Flow', icon: Workflow },
  { kind: 'workspace', view: 'todos', label: 'To-dos', icon: ListChecks },
  { kind: 'workspace', view: 'tasks', label: 'Tasks', icon: PanelRight },
  { kind: 'workspace', view: 'plan', label: 'Plan', icon: MapIcon },
];

const UTILITY_ACTIONS: ReadonlyArray<DockAction> = [
  { kind: 'utility', event: 'open-auth', label: 'Provider credentials', icon: KeyRound },
  { kind: 'utility', event: 'open-memory-drawer', label: 'Project memory', icon: Brain },
  { kind: 'utility', event: 'open-file-explorer', label: 'Files', icon: FileText },
  { kind: 'utility', event: 'open-prompt-library', label: 'Prompt library', icon: LibraryBig },
  { kind: 'utility', event: 'open-brain-panel', label: 'Brain status', icon: Brain },
  { kind: 'utility', event: 'open-session-health', label: 'Session health', icon: Activity },
];

/**
 * One entry point for secondary work surfaces. Individual panels retain
 * ownership of their event and focus lifecycle after a selection is made.
 */
export function UtilityDock({
  fileChangeCount = 0,
  onOpenFileChanges,
}: {
  fileChangeCount?: number | undefined;
  onOpenFileChanges?: (() => void) | undefined;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return (
    <nav className={`utility-dock${open ? ' open' : ''}`} aria-label="Workspace and utilities">
      <button
        type="button"
        className="utility-dock-toggle"
        aria-expanded={open}
        aria-controls="simpleui-utility-actions"
        aria-label={open ? 'Close workspace menu' : 'Open workspace menu'}
        title={open ? 'Close workspace menu' : 'Workspace and utilities'}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={17} aria-hidden="true" />
      </button>
      {open && (
        <div id="simpleui-utility-actions" className="utility-dock-actions">
          <DockSection
            label="Workspace"
            actions={WORKSPACE_ACTIONS}
            onSelect={() => setOpen(false)}
          />
          {fileChangeCount > 0 && (
            <section className="utility-dock-changes">
              <button
                type="button"
                title={`${fileChangeCount} changed file${fileChangeCount === 1 ? '' : 's'}`}
                onClick={() => {
                  setOpen(false);
                  onOpenFileChanges?.();
                }}
              >
                <FileDiff size={15} aria-hidden="true" />
                <span>Changes</span>
                <b>{fileChangeCount}</b>
              </button>
            </section>
          )}
          <DockSection
            label="Utilities"
            actions={UTILITY_ACTIONS}
            onSelect={() => setOpen(false)}
          />
        </div>
      )}
    </nav>
  );
}

function DockSection({
  label,
  actions,
  onSelect,
}: {
  label: string;
  actions: ReadonlyArray<DockAction>;
  onSelect: () => void;
}) {
  return (
    <section>
      <span className="utility-dock-heading">{label}</span>
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            type="button"
            key={action.kind === 'workspace' ? action.view : action.event}
            title={action.label}
            onClick={() => {
              onSelect();
              if (action.kind === 'workspace') dispatchOpenWorkspacePanel(action.view);
              else dispatchSimplePanel(action.event);
            }}
          >
            <Icon size={15} aria-hidden="true" />
            <span>{action.label}</span>
          </button>
        );
      })}
    </section>
  );
}
