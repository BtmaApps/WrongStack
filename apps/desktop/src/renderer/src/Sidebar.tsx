/**
 * The left menu: one scrollable Projects -> Sessions tree.
 *
 * This replaces three competing panels (workspace / projects / quick) that each
 * showed a slice of the same data, plus the ports, PIDs and log tails that used
 * to sit on screen. What stays visible is what identifies a project and tells
 * you whether it is running; everything operational moved behind the row's
 * hover controls or into the detail panel.
 *
 * Rows are memoised and keyed by a stable identity (project root, session id),
 * so a runtime status change re-renders one dot rather than the whole list.
 */
import { memo, useCallback, useMemo, useRef } from 'react';
import type { DesktopOpenSessionEntry } from '../../shared/types.js';
import {
  buildProjectTree,
  filterProjectTree,
  type ProjectRowProps,
  projectRowProps,
} from './project-tree.js';
import { actions, clearError, type ShellState, setFilter, toggleExpanded } from './store.js';
import { Icon, useT } from './ui.js';

interface SidebarProps {
  state: ShellState;
}

export function Sidebar({ state }: SidebarProps) {
  const t = useT();
  const webuiError =
    state.webuiStatus.runtimeId === state.desktop.activeRuntimeId &&
    state.webuiStatus.status === 'error';
  const tree = useMemo(() => buildProjectTree(state.desktop), [state.desktop]);
  const visible = useMemo(() => filterProjectTree(tree, state.filter), [tree, state.filter]);
  const filterRef = useRef<HTMLInputElement>(null);

  const onFilter = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setFilter(event.target.value);
  }, []);

  return (
    <aside className="sidebar" aria-label={t('projects')}>
      <header className="sidebar-head">
        <button
          type="button"
          className="brand"
          onClick={() => actions.toggleSidebar()}
          title={t('collapse')}
        >
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">WrongStack</span>
        </button>
      </header>

      <div className="sidebar-filter">
        <Icon name="search" />
        <input
          ref={filterRef}
          type="search"
          value={state.filter}
          onChange={onFilter}
          placeholder={t('searchProjects')}
          spellCheck={false}
          aria-label={t('searchProjects')}
        />
        {state.filter ? (
          <button
            type="button"
            className="icon-button subtle"
            onClick={() => {
              setFilter('');
              filterRef.current?.focus();
            }}
            title={t('clear')}
          >
            <Icon name="x" />
          </button>
        ) : null}
      </div>

      <nav className="project-tree" aria-label={t('projects')}>
        {visible.length === 0 ? (
          <p className="tree-empty">{state.filter ? t('noMatches') : t('noProject')}</p>
        ) : (
          visible.map((node) => <ProjectRow key={node.root} {...projectRowProps(node, state)} />)
        )}
      </nav>

      <div className="sidebar-bottom">
        {state.error ? (
          <div className="shell-error" role="alert">
            <span>{state.error}</span>
            <button
              type="button"
              className="icon-button"
              onClick={clearError}
              title={t('dismiss')}
              aria-label={t('dismiss')}
            >
              <Icon name="x" />
            </button>
          </div>
        ) : null}
        {webuiError && !state.error ? (
          <div className="shell-error" role="alert">
            <span>{state.webuiStatus.error || t('webuiError')}</span>
            <button
              type="button"
              className="icon-button"
              disabled={state.busy}
              onClick={() => void actions.reloadWebui()}
              title={t('reload')}
              aria-label={t('reload')}
            >
              <Icon name="refresh" />
            </button>
          </div>
        ) : null}
        {state.desktop.activeRuntimeId ? (
          <fieldset className="project-tools" aria-label={t('quickActions')}>
            <button
              type="button"
              disabled={state.busy}
              onClick={() => void actions.activateAndReload(state.desktop.activeRuntimeId!)}
              title={t('reload')}
              aria-label={t('reload')}
            >
              <Icon name="refresh" />
            </button>
            <button
              type="button"
              disabled={state.busy}
              onClick={() => void actions.revealRoot(state.desktop.activeRuntimeId!)}
              title={t('revealProjectFolder')}
              aria-label={t('revealProjectFolder')}
            >
              <Icon name="folder" />
            </button>
            <button
              type="button"
              disabled={state.busy}
              onClick={() => void actions.openInBrowser(state.desktop.activeRuntimeId!)}
              title={t('openInBrowser')}
              aria-label={t('openInBrowser')}
            >
              <Icon name="external" />
            </button>
          </fieldset>
        ) : null}
        <footer className="sidebar-foot">
          <button
            type="button"
            className="foot-button primary"
            onClick={() => void actions.openProject()}
            disabled={state.busy}
          >
            <Icon name="folder-plus" />
            <span>{t('openProject')}</span>
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => void actions.openSettings()}
            title={t('settings')}
            aria-label={t('settings')}
            disabled={state.busy}
          >
            <Icon name="settings" />
          </button>
        </footer>
      </div>
    </aside>
  );
}

const ProjectRow = memo(function ProjectRow({
  root,
  name,
  status,
  active,
  primaryRuntimeId: runtimeId,
  primaryRuntimeStatus,
  expanded,
  sessions,
  busy,
}: ProjectRowProps) {
  const t = useT();

  // A row click means "take me to this project": activate what is already
  // running, otherwise start it. One gesture, not a start button plus a
  // separate select.
  const open = useCallback(() => {
    if (runtimeId && (primaryRuntimeStatus === 'stopped' || primaryRuntimeStatus === 'error'))
      void actions.resume(runtimeId, root);
    else if (runtimeId) void actions.activate(runtimeId);
    else void actions.openProject(root);
  }, [runtimeId, root, primaryRuntimeStatus]);

  return (
    <div className={`project${active ? ' is-active' : ''}`}>
      <div className="project-row">
        <button
          type="button"
          className="disclosure"
          onClick={() => toggleExpanded(root)}
          aria-expanded={expanded}
          title={expanded ? t('collapse') : t('expand')}
          aria-label={`${expanded ? t('collapse') : t('expand')} ${name}`}
        >
          <Icon name="chevron" className={expanded ? 'rotated' : undefined} />
        </button>

        <button type="button" className="project-main" onClick={open} disabled={busy} title={root}>
          <span className={`dot ${status}`} aria-hidden="true" />
          <span className="project-label">
            <span className="project-name">{name}</span>
            <span className="project-status">
              {t(status)}
              {sessions.length ? ` · ${t('sessions')}: ${sessions.length}` : ''}
            </span>
          </span>
        </button>

        <div className="row-actions">
          {runtimeId ? (
            <button
              type="button"
              className="icon-button subtle"
              onClick={() => void actions.newSession(runtimeId)}
              title={t('newSession')}
              aria-label={`${t('newSession')} — ${name}`}
              disabled={busy || primaryRuntimeStatus !== 'running'}
            >
              <Icon name="plus" />
            </button>
          ) : null}
          {runtimeId ? (
            <button
              type="button"
              className="icon-button subtle"
              onClick={() => void actions.close(runtimeId)}
              title={t('close')}
              aria-label={`${t('close')} — ${name}`}
              disabled={busy}
            >
              <Icon name="x" />
            </button>
          ) : null}
        </div>
      </div>

      {expanded ? <SessionRows sessions={sessions} /> : null}
    </div>
  );
});

function SessionRows({
  sessions,
}: {
  sessions: Array<DesktopOpenSessionEntry & { runtimeId: string }>;
}) {
  const t = useT();
  if (sessions.length === 0) {
    return <p className="session-note">{t('noSessions')}</p>;
  }
  return (
    <ul className="session-list">
      {sessions.map((entry) => (
        <SessionRow key={`${entry.runtimeId}:${entry.id}`} entry={entry} />
      ))}
    </ul>
  );
}

const SessionRow = memo(function SessionRow({
  entry,
}: {
  entry: DesktopOpenSessionEntry & { runtimeId: string };
}) {
  const open = useCallback(() => {
    void actions.focusSession(entry.runtimeId, entry.id, entry.title);
  }, [entry.id, entry.runtimeId, entry.title]);

  return (
    <li>
      <button
        type="button"
        className={`session-row${entry.active ? ' is-active' : ''}`}
        onClick={open}
        title={entry.title}
      >
        <span className={`dot ${entry.running ? 'starting' : 'stopped'}`} aria-hidden="true" />
        <span className="session-title">{entry.title}</span>
        <span className="session-meta">{entry.slot + 1}</span>
      </button>
    </li>
  );
});
