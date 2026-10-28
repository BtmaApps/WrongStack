import {
  Activity,
  Brain,
  ChevronRight,
  Columns3,
  FileCode2,
  Folder,
  FolderPlus,
  GitCompareArrows,
  Layers3,
  LayoutGrid,
  Mail,
  Network,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Target,
  Workflow,
} from 'lucide-react';
import { useState } from 'react';
import { isLive } from './model';
import { ProjectToolsMenu } from './ProjectToolsMenu';
import { addProject, native } from './platform';

import type { DesktopController } from './useDesktop';

export function Sidebar({ vm }: { vm: DesktopController }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const {
    snapshot,
    project,
    setProject,
    selected,
    setSelected,
    section,
    setSection,
    setSearch,
    connected,
    setDialog,
    pending,
    run,
    active,
    jumpToSession,
  } = vm;
  return (
    <>
      {' '}
      <aside className="sidebar">
        <button
          type="button"
          className="brand"
          aria-label="WrongStack home"
          onClick={() => {
            setProject(null);
            setSection('fleet');
            setSelected(null);
          }}
        >
          <span className="brand-mark">
            <img src="/wrongstack-mark.svg" alt="" width="44" height="22" />
          </span>
          <strong>
            wrongstack<span className="brand-subtitle">DESKTOP</span>
          </strong>
          <span className="version">v2</span>
        </button>
        <button
          type="button"
          className="quick-search"
          onClick={() => {
            setSearch('');
            setDialog('palette');
          }}
        >
          <Search size={15} />
          <span>Find anything</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {(
            [
              { id: 'fleet', label: 'Mission control', icon: LayoutGrid, count: active.length },
              { id: 'projects', label: 'Projects', icon: Folder, count: snapshot.projects.length },
              { id: 'activity', label: 'Activity', icon: Activity },
              { id: 'engine', label: 'Appearance', icon: Settings2 },
              { id: 'wrongstack', label: 'WrongStack settings', icon: Layers3 },
            ] as const
          ).map((item) => (
            <button
              type="button"
              key={item.id}
              className={`nav-item ${section === item.id && !project ? 'active' : ''}`}
              onClick={() => {
                if (item.id === 'wrongstack') vm.openWrongStackSettings();
                setSection(item.id);
                setProject(null);
                setSelected(null);
              }}
            >
              <item.icon
                size={17}
                className={section === item.id ? 'active-nav-icon' : undefined}
              />
              <span>{item.label}</span>
              {'count' in item && <span className="nav-count">{item.count}</span>}
            </button>
          ))}
        </nav>
        <div className="nav-caption project-caption">
          YOUR PROJECTS
          <button
            type="button"
            aria-label="Add project"
            disabled={!native || pending}
            onClick={() => void run(addProject)}
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="project-tree">
          {snapshot.projects.map((p, i) => (
            <div key={p.id} className="project-branch">
              <div className="project-branch-heading">
                <button
                  type="button"
                  className="project-disclosure"
                  aria-label={`${collapsed[p.id] ? 'Expand' : 'Collapse'} ${p.name}`}
                  aria-expanded={!collapsed[p.id]}
                  onClick={() =>
                    setCollapsed((current) => ({ ...current, [p.id]: !current[p.id] }))
                  }
                >
                  <ChevronRight size={12} />
                </button>
                <button
                  type="button"
                  className={`project-item ${project === p.id ? 'selected' : ''}`}
                  onClick={() => {
                    vm.openProjectPage(p.id);
                  }}
                >
                  <span className={`project-symbol color-${i % 4}`}>
                    {p.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span>{p.name}</span>
                  <span className="project-count">
                    {snapshot.sessions.filter((s) => s.projectId === p.id && isLive(s)).length}
                  </span>
                </button>
                <button
                  type="button"
                  className="project-new-session"
                  aria-label={`New session in ${p.name}`}
                  disabled={!native || pending}
                  onClick={() => vm.newSession(p.id)}
                >
                  <Plus size={13} />
                </button>
              </div>
              {!collapsed[p.id] && project === p.id && (
                <nav className="project-tool-links" aria-label={`${p.name} workspace`}>
                  {(
                    [
                      { id: 'memory', label: 'Memory', Icon: Brain },
                      { id: 'kanban', label: 'Kanban', Icon: Columns3 },
                      { id: 'atlas', label: 'Code Atlas', Icon: Network },
                    ] as const
                  ).map(({ id, label, Icon }) => (
                    <button
                      type="button"
                      key={id}
                      aria-current={
                        section === 'project' && vm.projectPage === id ? 'page' : undefined
                      }
                      onClick={() => vm.openProjectPage(p.id, id)}
                    >
                      <Icon size={15} />
                      <span>{label}</span>
                    </button>
                  ))}
                  <ProjectToolsMenu
                    page={section === 'project' ? vm.projectPage : 'overview'}
                    onOpen={(page) => vm.openProjectPage(p.id, page)}
                  />
                  <div className="project-files-shortcuts">
                    <button
                      type="button"
                      className={
                        section === 'project' && vm.projectPage === 'files'
                          ? 'active-project-tool'
                          : ''
                      }
                      onClick={() => vm.openProjectPage(p.id, 'files')}
                    >
                      <FileCode2 size={13} />
                      Files
                    </button>
                    <button
                      type="button"
                      className={
                        section === 'project' && vm.projectPage === 'changes'
                          ? 'active-project-tool'
                          : ''
                      }
                      onClick={() => vm.openProjectPage(p.id, 'changes')}
                    >
                      <GitCompareArrows size={13} />
                      Changes
                    </button>
                  </div>
                  <button
                    type="button"
                    className="project-chronicle-link"
                    aria-current={
                      section === 'project' && vm.projectPage === 'sdd' ? 'page' : undefined
                    }
                    onClick={() => vm.openProjectPage(p.id, 'sdd')}
                  >
                    <Workflow size={13} />
                    <span>SDD</span>
                  </button>
                  <button
                    type="button"
                    className="project-chronicle-link"
                    aria-current={
                      section === 'project' && vm.projectPage === 'goals' ? 'page' : undefined
                    }
                    onClick={() => vm.openProjectPage(p.id, 'goals')}
                  >
                    <Target size={13} />
                    <span>Goals</span>
                  </button>
                  <button
                    type="button"
                    className="project-chronicle-link"
                    aria-current={
                      section === 'project' && vm.projectPage === 'chronicle' ? 'page' : undefined
                    }
                    onClick={() => vm.openProjectPage(p.id, 'chronicle')}
                  >
                    <Activity size={13} />
                    <span>Chronicle</span>
                  </button>
                  <button
                    type="button"
                    className="project-chronicle-link"
                    aria-current={
                      section === 'project' && vm.projectPage === 'mailbox' ? 'page' : undefined
                    }
                    onClick={() => vm.openProjectPage(p.id, 'mailbox')}
                  >
                    <Mail size={13} />
                    <span>Mailbox</span>
                  </button>
                </nav>
              )}
              {!collapsed[p.id] &&
                snapshot.sessions
                  .filter(
                    (s) => s.projectId === p.id && (isLive(s) || vm.openSessionIds.includes(s.id)),
                  )
                  .map((s) => (
                    <button
                      type="button"
                      key={s.id}
                      className={`tree-session ${selected === s.id ? 'chosen' : ''}`}
                      onClick={() => jumpToSession(s)}
                    >
                      <span className={`status-dot ${s.status}`} />
                      <span>{s.title}</span>
                      <small>{s.kind === 'terminal' ? '›_' : ''}</small>
                    </button>
                  ))}
            </div>
          ))}
          {!snapshot.projects.length && (
            <p className="sidebar-empty">
              Your projects, agents, and terminals.
              <br />
              Together in one place.
            </p>
          )}
          <button
            type="button"
            className="add-project"
            disabled={!native || pending}
            onClick={() => void run(addProject)}
          >
            <FolderPlus size={15} /> Add project
          </button>
        </div>
        <div className="sidebar-bottom">
          <div className="host-indicator">
            <span className={`status-dot ${connected ? 'running' : 'stopped'}`} />
            <span>
              {connected
                ? 'Local engine connected'
                : native
                  ? 'Connecting to session host'
                  : 'Browser preview'}
            </span>
          </div>
          <div className="account">
            <span className="avatar">WS</span>
            <div>
              <strong>Local workspace</strong>
              <small>Private · on your machine</small>
            </div>
            <ShieldCheck size={16} />
          </div>
        </div>
      </aside>
    </>
  );
}
