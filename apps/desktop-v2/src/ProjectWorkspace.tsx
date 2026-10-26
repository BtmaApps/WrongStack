import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Brain,
  CalendarClock,
  Folder,
  Network,
  Plus,
  Terminal,
  Workflow,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AutomationWorkspace } from './AutomationWorkspace';
import { CodeAtlas } from './CodeAtlas';
import { projectHttp } from './engine-http';
import { entries, record } from './engine-values';
import { FileWorkspace } from './FileWorkspace';
import { isLive, type Project } from './model';
import { ProjectChronicle } from './ProjectChronicle';
import { ProjectKanban } from './ProjectKanban';
import { ProjectKnowledge } from './ProjectKnowledge';
import { PromptWorkspace } from './PromptWorkspace';
import { RuntimeGate } from './RuntimeGate';
import { SkillLibrary } from './SkillLibrary';
import type { DesktopController } from './useDesktop';
import { useProjectEngine } from './useEngine';

export function ProjectWorkspace({ project, vm }: { project: Project; vm: DesktopController }) {
  const [promptsOpen, setPromptsOpen] = useState(false);
  return (
    <div className="project-workspace">
      <div className="project-context-bar">
        <button
          type="button"
          className="project-home-button"
          onClick={() => vm.setProjectPage('overview')}
        >
          <ArrowLeft size={14} />
          <Folder size={15} />
          <strong>{project.name}</strong>
        </button>
        <span className="project-context-label">PROJECT WORKSPACE</span>
        <small className="project-context-path" title={project.root}>
          {project.root.replace(/^\\\\\?\\/, '')}
        </small>
        <button
          type="button"
          className="button secondary small"
          onClick={() => setPromptsOpen(true)}
        >
          <BookOpen size={13} /> Prompt library
        </button>
      </div>
      <RuntimeGate scope="project" projectId={project.id}>
        <ProjectContent project={project} vm={vm} />
      </RuntimeGate>
      {promptsOpen && (
        <PromptWorkspace
          key={project.id}
          projectId={project.id}
          sessionId=""
          kind="library"
          onClose={() => setPromptsOpen(false)}
        />
      )}
    </div>
  );
}
function ProjectContent({ project, vm }: { project: Project; vm: DesktopController }) {
  const { state, send, command } = useProjectEngine(project.id, vm.reportError);
  const http = useMemo(() => projectHttp(project.id), [project.id]);
  const [fileTarget, setFileTarget] = useState(''),
    [memoryTarget, setMemoryTarget] = useState('');
  useEffect(() => {
    if (vm.projectPage !== 'files' && vm.projectPage !== 'changes') setFileTarget('');
  }, [vm.projectPage]);
  if (!state.connected)
    return (
      <div className="runtime-state">
        <h2>Opening {project.name}…</h2>
        <p>Your project knowledge and tools are getting ready.</p>
      </div>
    );
  return (
    <div className="project-page-content">
      {vm.projectPage === 'files' || vm.projectPage === 'changes' ? (
        <FileWorkspace
          command={command}
          send={send}
          state={state}
          scopeKey={project.root}
          mode={vm.projectPage}
          initialPath={fileTarget}
        />
      ) : vm.projectPage === 'chronicle' ? (
        <ProjectChronicle
          command={command}
          onOpenFile={(path) => {
            setFileTarget(path);
            vm.setProjectPage('files');
          }}
        />
      ) : vm.projectPage === 'skills' ? (
        <SkillLibrary
          command={command}
          scope="project"
          onOpenFile={(path) => {
            setFileTarget(path);
            vm.setProjectPage('files');
          }}
        />
      ) : vm.projectPage === 'memory' ? (
        <ProjectKnowledge command={command} http={http} initialMemoryId={memoryTarget} />
      ) : vm.projectPage === 'kanban' ? (
        <ProjectKanban command={command} />
      ) : vm.projectPage === 'atlas' ? (
        <CodeAtlas
          http={http}
          send={send}
          state={state}
          command={command}
          projectRoot={project.root}
          onOpenFile={(path) => {
            setFileTarget(path);
            vm.setProjectPage('files');
          }}
          onOpenMemory={(id) => {
            setMemoryTarget(id);
            vm.setProjectPage('memory');
          }}
        />
      ) : vm.projectPage === 'automations' ? (
        <section className="project-automations">
          <header className="studio-heading">
            <div>
              <span className="eyebrow">WORK THAT KEEPS MOVING</span>
              <h1>
                Automations<span className="heading-dot">.</span>
              </h1>
              <p>Scheduled jobs and repeatable workflows for {project.name}.</p>
            </div>
          </header>
          <AutomationWorkspace http={http} />
        </section>
      ) : (
        <ProjectOverview project={project} vm={vm} command={command} http={http} />
      )}
    </div>
  );
}
function ProjectOverview({
  project,
  vm,
  command,
  http,
}: {
  project: Project;
  vm: DesktopController;
  command: ReturnType<typeof useProjectEngine>['command'];
  http: ReturnType<typeof projectHttp>;
}) {
  const [memories, setMemories] = useState<number | null>(null),
    [boards, setBoards] = useState<Record<string, unknown>[]>([]),
    [packages, setPackages] = useState<number | null>(null);
  useEffect(() => {
    let current = true;
    void Promise.allSettled([
      command('memory.sage.listPage', { statuses: ['active'], limit: 1 }, [
        'memory.sage.listPage',
      ]).then((data) => {
        if (current) setMemories(Number(data['total'] ?? entries(data['memories']).length));
      }),
      command('kanban.list', {}, ['kanban.list']).then((data) => {
        if (current)
          setBoards(
            entries(data['data']).filter(
              (board) => board['kind'] !== 'session_mirror' && board['kind'] !== 'archive',
            ),
          );
      }),
      http('/api/codemap/packages').then((data) => {
        if (current) setPackages(entries(record(data)['nodes']).length);
      }),
    ]);
    return () => {
      current = false;
    };
  }, [command, http]);
  const sessions = vm.snapshot.sessions.filter((session) => session.projectId === project.id);
  const tasks = boards.reduce((sum, board) => sum + Number(board['taskCount'] ?? 0), 0);
  return (
    <section className="project-overview">
      <header className="project-overview-heading">
        <div>
          <span className="eyebrow">YOUR PROJECT, CONNECTED</span>
          <h1>
            {project.name}
            <span className="heading-dot">.</span>
          </h1>
          <p>A shared home for the knowledge, work, and code behind every conversation.</p>
        </div>
        <button type="button" className="button primary" onClick={() => vm.newSession(project.id)}>
          <Plus size={15} />
          New session
        </button>
      </header>
      <div className="project-destination-grid">
        <button
          type="button"
          className="project-destination destination-memory"
          onClick={() => vm.setProjectPage('memory')}
        >
          <div className="destination-art memory-art" aria-hidden="true">
            <svg viewBox="0 0 360 150">
              <title>Project memory</title>
              <path d="M54 86L126 40L196 82L285 38M126 40L155 125L196 82L301 119M54 86L155 125" />
              <circle cx="54" cy="86" r="15" />
              <circle cx="126" cy="40" r="21" />
              <circle cx="196" cy="82" r="28" />
              <circle cx="155" cy="125" r="12" />
              <circle cx="285" cy="38" r="12" />
              <circle cx="301" cy="119" r="17" />
            </svg>
            <Brain size={24} />
          </div>
          <div className="destination-copy">
            <span className="eyebrow">PROJECT KNOWLEDGE</span>
            <h2>
              Memory
              <ArrowRight size={18} />
            </h2>
            <p>Keep decisions connected to the code and to each other.</p>
            <strong>
              {memories === null ? 'Opening project memory…' : `${memories} active memories`}
            </strong>
          </div>
        </button>
        <button
          type="button"
          className="project-destination destination-kanban"
          onClick={() => vm.setProjectPage('kanban')}
        >
          <div className="destination-art board-art" aria-hidden="true">
            {[3, 2, 2].map((count, index) => (
              <div key={index} className="board-art-column">
                <i className="board-art-line" />
                {Array.from({ length: count }, (_, card) => (
                  <span key={card}>
                    <b />
                    <b />
                  </span>
                ))}
              </div>
            ))}
          </div>
          <div className="destination-copy">
            <span className="eyebrow">PROJECT WORK</span>
            <h2>
              Kanban
              <ArrowRight size={18} />
            </h2>
            <p>Turn the next idea into a clear, visible path to done.</p>
            <strong>
              {tasks} tasks across {boards.length} boards
            </strong>
          </div>
        </button>
        <button
          type="button"
          className="project-destination destination-atlas"
          onClick={() => vm.setProjectPage('atlas')}
        >
          <div className="destination-art atlas-art" aria-hidden="true">
            <svg viewBox="0 0 360 150">
              <title>Code atlas</title>
              <path d="M68 55L180 34L292 60M68 55L84 116L180 98L292 60L270 129M180 34L180 98L270 129" />
              {[
                [68, 55],
                [180, 34],
                [292, 60],
                [84, 116],
                [180, 98],
                [270, 129],
              ].map(([x, y], index) => (
                <rect x={x! - 12} y={y! - 10} width={24} height={20} rx={4} key={index} />
              ))}
            </svg>
            <Network size={25} />
          </div>
          <div className="destination-copy">
            <span className="eyebrow">PROJECT STRUCTURE</span>
            <h2>
              Code Atlas
              <ArrowRight size={18} />
            </h2>
            <p>See the architecture. Follow dependencies into the source.</p>
            <strong>
              {packages === null ? 'Ready to map your code' : `${packages} indexed packages`}
            </strong>
          </div>
        </button>
      </div>
      <div className="project-secondary-links">
        <button type="button" onClick={() => vm.setProjectPage('skills')}>
          <BookOpen size={21} />
          <div>
            <strong>Skills</strong>
            <span>Discover, author, and maintain your project capabilities.</span>
          </div>
          <ArrowRight size={16} />
        </button>
        <button type="button" onClick={() => vm.setProjectPage('chronicle')}>
          <Activity size={21} />
          <div>
            <strong>Chronicle</strong>
            <span>Project timeline, event evidence, and relationships.</span>
          </div>
          <ArrowRight size={16} />
        </button>
        <button type="button" onClick={() => vm.setProjectPage('automations')}>
          <CalendarClock size={21} />
          <div>
            <strong>Automations</strong>
            <span>Repeatable workflows, schedules, and run evidence.</span>
          </div>
          <ArrowRight size={16} />
        </button>
        <button type="button" onClick={() => vm.openWrongStackSettings()}>
          <Workflow size={21} />
          <div>
            <strong>WrongStack settings</strong>
            <span>Models, capabilities, and execution defaults.</span>
          </div>
          <ArrowRight size={16} />
        </button>
      </div>
      <section className="project-session-summary">
        <header>
          <div>
            <h2>Sessions</h2>
            <p>
              {sessions.filter(isLive).length} active · projects keep their knowledge when
              conversations end.
            </p>
          </div>
          <button
            type="button"
            className="button secondary small"
            onClick={() => vm.newSession(project.id, 'terminal')}
          >
            <Terminal size={13} />
            Open terminal
          </button>
        </header>
        {sessions.length ? (
          <div className="project-session-rows">
            {sessions.slice(0, 8).map((session) => (
              <button type="button" key={session.id} onClick={() => vm.jumpToSession(session)}>
                <span className={`status-dot ${session.status}`} />
                {session.kind === 'terminal' ? <Terminal size={15} /> : <Workflow size={15} />}
                <strong>{session.title}</strong>
                <span>{session.status}</span>
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
        ) : (
          <div className="project-no-sessions">
            <Workflow size={20} />
            <span>No conversations yet. Your project workspace is ready whenever you are.</span>
            <button type="button" onClick={() => vm.newSession(project.id)}>
              Start a session
              <ArrowRight size={13} />
            </button>
          </div>
        )}
      </section>
    </section>
  );
}
