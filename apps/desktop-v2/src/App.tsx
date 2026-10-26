import {
  Bell,
  Box,
  ChevronRight,
  ExternalLink,
  Moon,
  Plus,
  Radio,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { lazy, Suspense } from 'react';
import { FleetPanel } from './FleetPanel';
import { ProjectViews } from './ProjectViews';
import { native, openProjectWindow } from './platform';
import { Sidebar } from './Sidebar';
import { useDesktop } from './useDesktop';
import { WorkspaceDialogs } from './WorkspaceDialogs';

const SessionWorkbench = lazy(() =>
  import('./SessionWorkbench').then((module) => ({ default: module.SessionWorkbench })),
);
const ProjectWorkspace = lazy(() =>
  import('./ProjectWorkspace').then((module) => ({ default: module.ProjectWorkspace })),
);
const WrongStackSettings = lazy(() =>
  import('./WrongStackSettings').then((module) => ({ default: module.WrongStackSettings })),
);
export function App() {
  const vm = useDesktop();
  const {
    snapshot,
    setProject,
    section,
    setSection,
    setFilter,
    error,
    setError,
    connected,
    pending,
    run,
    newSession,
    currentProject,
    active,
    attention,
    currentSession,
    setSelected,
  } = vm;
  const focused = section === 'fleet' && currentSession !== undefined;
  return (
    <div className="app-shell">
      <Sidebar vm={vm} />
      <div
        className={`workspace-shell ${focused ? 'workspace-focused' : ''} ${section === 'project' ? 'project-focused' : ''} ${section === 'wrongstack' ? 'settings-focused' : ''}`}
      >
        <header className="topbar">
          <div className="breadcrumbs">
            <Box size={15} />
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {section === 'wrongstack'
                ? 'WrongStack settings'
                : (currentProject?.name ??
                  {
                    fleet: 'Mission control',
                    projects: 'Projects',
                    activity: 'Activity',
                    engine: 'Settings',
                    project: 'Project workspace',
                    wrongstack: 'WrongStack settings',
                  }[section])}
            </strong>
            {focused && (
              <>
                <ChevronRight size={13} />
                <strong className="breadcrumb-session">{currentSession.title}</strong>
              </>
            )}
          </div>
          <div className="topbar-right">
            {focused && (
              <button
                type="button"
                className="button secondary small"
                disabled={pending}
                onClick={() => newSession()}
              >
                <Plus size={14} />
                New session
              </button>
            )}
            <button
              type="button"
              className="icon-button"
              title={`Switch to ${vm.mode === 'dark' ? 'light' : 'dark'} mode`}
              aria-label={`Switch to ${vm.mode === 'dark' ? 'light' : 'dark'} mode`}
              onClick={() => vm.changeAppearance({ mode: vm.mode === 'dark' ? 'light' : 'dark' })}
            >
              {vm.mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <span className="local-badge">
              <span className={`status-dot ${connected ? 'running' : 'stopped'}`} />
              LOCAL
            </span>
            <button
              type="button"
              className="icon-button"
              title="Sessions needing attention"
              onClick={() => {
                setFilter('attention');
                setProject(null);
                setSection('fleet');
                setSelected(null);
              }}
            >
              <Bell size={17} />
              {attention.length > 0 && <span className="notification-dot" />}
            </button>
          </div>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button type="button" aria-label="Dismiss error" onClick={() => setError('')}>
              <X size={15} />
            </button>
          </div>
        )}
        {!native && (
          <div className="preview-banner">
            <Radio size={15} /> Shell preview · Launch with <code>bun run desktop:v2</code> to
            connect your local projects and sessions.
          </div>
        )}
        <main className="main-content">
          {!focused && section !== 'project' && section !== 'wrongstack' && (
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  <span className="tiny-cross">+</span>{' '}
                  {section === 'engine' ? 'WORKSPACE PREFERENCES' : 'YOUR WORKSPACE'}
                </div>
                <h1>
                  {(focused ? currentSession.title : currentProject?.name) ??
                    {
                      fleet: 'Mission control',
                      projects: 'Your projects',
                      activity: 'Activity timeline',
                      engine: 'Your workspace, your way',
                      project: 'Project workspace',
                      wrongstack: 'WrongStack settings',
                    }[section]}
                  <span className="heading-dot">.</span>
                </h1>
                <p>
                  {currentProject
                    ? currentProject.root.replace(/^\\\\\?\\/, '')
                    : section === 'fleet'
                      ? 'Every project. Every session. One clear picture.'
                      : section === 'projects'
                        ? 'Independent codebases. A shared command center.'
                        : section === 'activity'
                          ? 'A persistent record of your workspace sessions.'
                          : 'Appearance and preferences for every project.'}
                </p>
              </div>
              <div className="heading-actions">
                {currentProject && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => void run(() => openProjectWindow(currentProject.id))}
                  >
                    <ExternalLink size={14} />
                    Project window
                  </button>
                )}
                <button
                  type="button"
                  className="button primary"
                  disabled={!native || !snapshot.projects.length || pending}
                  onClick={() => newSession()}
                >
                  <Plus size={16} />
                  New session
                </button>
              </div>
            </div>
          )}

          <Suspense fallback={<div className="runtime-state">Opening your workspace…</div>}>
            {section === 'fleet' &&
              (focused ? <SessionWorkbench vm={vm} /> : <FleetPanel vm={vm} />)}
            <ProjectViews vm={vm} />
            {section === 'project' && currentProject && (
              <ProjectWorkspace key={currentProject.id} project={currentProject} vm={vm} />
            )}
            {section === 'wrongstack' && <WrongStackSettings vm={vm} />}
          </Suspense>
        </main>
        <footer className="statusbar">
          <div>
            <span className={`status-dot ${connected ? 'running' : 'stopped'}`} />
            <span>{connected ? 'All systems local' : 'Native host disconnected'}</span>
            <span className="statusbar-separator" />
            <span>{snapshot.projects.length} projects</span>
            <span>{active.length} active sessions</span>
          </div>
          <div>
            <ShieldCheck size={12} />
            <span>Your machine. Your models. Your work.</span>
            <span className="statusbar-separator" />
            <span>WrongStack Desktop v2</span>
          </div>
        </footer>
      </div>
      <WorkspaceDialogs vm={vm} />
    </div>
  );
}
