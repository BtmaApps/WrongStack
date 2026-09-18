/**
 * The shell: a sidebar and the area the embedded WebUI covers.
 *
 * The stage is deliberately almost empty. A running project's WebUI is a
 * `WebContentsView` positioned over it by the main process, so anything drawn
 * here is only visible while there is no view to show — before the first
 * project opens, and during the moment a view is loading. Painting status
 * chips, ports and log tails underneath a view that covers them was part of
 * what made the old shell feel busy.
 */
import { type CSSProperties, useSyncExternalStore } from 'react';
import { getSidebarWidth } from '../../shared/layout.js';
import { Sidebar } from './Sidebar.js';
import { actions, getSnapshot, subscribe } from './store.js';
import { Icon, useT } from './ui.js';

export function App() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const width = useSyncExternalStore(
    subscribeResize,
    () => window.innerWidth,
    () => 1180,
  );

  return (
    <div
      className={`shell${state.sidebarCollapsed ? ' is-collapsed' : ''}`}
      style={
        {
          '--sidebar-width': `${getSidebarWidth(width, false)}px`,
          '--rail-width': `${getSidebarWidth(width, true)}px`,
        } as CSSProperties
      }
    >
      {state.sidebarCollapsed ? <CollapsedRail state={state} /> : <Sidebar state={state} />}
      <main className="stage">
        <Stage state={state} />
      </main>
    </div>
  );
}

function CollapsedRail({ state }: { state: ReturnType<typeof getSnapshot> }) {
  const t = useT();
  return (
    <aside className="rail" aria-label={t('projects')}>
      <button
        type="button"
        className="icon-button"
        onClick={() => actions.toggleSidebar()}
        title={t('expand')}
      >
        <span className="brand-mark" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="icon-button"
        disabled={state.busy}
        onClick={() => void actions.openProject()}
        title={t('openProject')}
        aria-label={t('openProject')}
      >
        <Icon name="folder-plus" />
      </button>
      {state.error ||
      (state.webuiStatus.runtimeId === state.desktop.activeRuntimeId &&
        state.webuiStatus.status === 'error') ? (
        <button
          type="button"
          className="icon-button rail-error"
          title={state.error || t('webuiError')}
          aria-label={t('operationFailed')}
          onClick={() => actions.toggleSidebar()}
        >
          <Icon name="x" />
        </button>
      ) : null}
      <button
        type="button"
        className="icon-button rail-settings"
        disabled={state.busy}
        onClick={() => void actions.openSettings()}
        title={t('settings')}
        aria-label={t('settings')}
      >
        <Icon name="settings" />
      </button>
    </aside>
  );
}

function Stage({ state }: { state: ReturnType<typeof getSnapshot> }) {
  const t = useT();
  const activeId = state.desktop.activeRuntimeId;
  const active = state.desktop.runtimes.find((runtime) => runtime.id === activeId);

  if (state.desktop.restoring) {
    return <StageMessage icon="refresh" title={t('restoring')} />;
  }
  if (!active) {
    return <Welcome state={state} />;
  }
  if (active.status === 'error' || active.status === 'stopped') {
    return (
      <StageMessage
        icon={active.status === 'error' ? 'x' : 'folder'}
        title={t(active.status)}
        hint={active.error ?? active.name}
        tone={active.status === 'error' ? 'error' : undefined}
        action={{
          label: t('retry'),
          run: () => void actions.resume(active.id, active.root),
          disabled: state.busy,
        }}
      />
    );
  }
  if (state.webuiStatus.runtimeId === active.id && state.webuiStatus.status === 'error') {
    return (
      <StageMessage
        icon="x"
        title={t('webuiError')}
        hint={state.webuiStatus.error}
        tone="error"
        action={{
          label: t('reload'),
          run: () => void actions.activateAndReload(active.id),
          disabled: state.busy,
        }}
      />
    );
  }
  if (active.status !== 'running' || state.webuiStatus.status === 'loading') {
    return <StageMessage icon="refresh" title={t('starting')} hint={active.name} />;
  }
  // Running and loaded: the WebContentsView is on top of this element.
  return null;
}

function Welcome({ state }: { state: ReturnType<typeof getSnapshot> }) {
  const t = useT();
  return (
    <section className="welcome" aria-label={t('workspace')}>
      <Icon name="folder" className="welcome-icon" />
      <h1>{t('workspace')}</h1>
      <p>{t('openProjectHint')}</p>
      <div className="welcome-actions">
        <button
          type="button"
          className="foot-button primary"
          disabled={state.busy}
          onClick={() => void actions.openProject()}
        >
          <Icon name="folder-plus" />
          {t('openProject')}
        </button>
        <button
          type="button"
          className="foot-button"
          disabled={state.busy}
          onClick={() => void actions.openSettings()}
        >
          <Icon name="settings" />
          {t('settings')}
        </button>
      </div>
      {state.desktop.recentProjects.length ? (
        <div className="welcome-recent">
          <h2>{t('recent')}</h2>
          {state.desktop.recentProjects.slice(0, 4).map((project) => (
            <button
              type="button"
              key={project.root}
              className="recent-project"
              title={project.root}
              disabled={state.busy}
              onClick={() => void actions.openProject(project.root)}
            >
              <Icon name="folder" />
              <span>
                <strong>{project.name}</strong>
                <small>{project.root}</small>
              </span>
              <Icon name="chevron" />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function StageMessage({
  icon,
  title,
  hint,
  tone,
  action,
}: {
  icon: 'folder' | 'refresh' | 'x';
  title: string;
  hint?: string | undefined;
  tone?: 'error' | undefined;
  action?: { label: string; run: () => void; disabled?: boolean } | undefined;
}) {
  return (
    <div className={`stage-message${tone ? ` ${tone}` : ''}`}>
      <Icon name={icon} className="stage-icon" />
      <p className="stage-title">{title}</p>
      {hint ? <p className="stage-hint">{hint}</p> : null}
      {action ? (
        <button
          type="button"
          className="foot-button primary"
          onClick={action.run}
          disabled={action.disabled}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

function subscribeResize(listener: () => void) {
  window.addEventListener('resize', listener);
  return () => window.removeEventListener('resize', listener);
}
