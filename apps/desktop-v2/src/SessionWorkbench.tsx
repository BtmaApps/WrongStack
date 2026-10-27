import { ArrowLeft, Plus, Square, Terminal, Workflow, X } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { EngineWorkspace } from './EngineWorkspace';
import { isLive } from './model';
import { request } from './platform';

const TerminalPane = lazy(() =>
  import('./TerminalPane').then((module) => ({ default: module.TerminalPane })),
);

import type { DesktopController } from './useDesktop';

export function SessionWorkbench({ vm }: { vm: DesktopController }) {
  const {
    snapshot,
    currentSession: session,
    openSessionIds,
    jumpToSession,
    closeSessionTab,
    showFleet,
    reportError,
    run,
    getDraft,
    setDraft,
  } = vm;
  if (!session) return null;
  return (
    <section className="session-workbench" aria-label="Session workbench">
      <nav className="session-tabs" aria-label="Open sessions">
        <button type="button" className="back-to-fleet" onClick={showFleet}>
          <ArrowLeft size={14} />
          Fleet
        </button>
        {openSessionIds
          .map((id) => snapshot.sessions.find((s) => s.id === id))
          .filter((s) => s !== undefined)
          .map((s) => (
            <div
              className={`session-tab ${s.id === session.id ? 'active-session-tab' : ''}`}
              key={s.id}
            >
              <button
                type="button"
                className="session-tab-label"
                aria-current={s.id === session.id ? 'page' : undefined}
                onClick={() => jumpToSession(s)}
              >
                {s.kind === 'terminal' ? <Terminal size={13} /> : <Workflow size={13} />}
                <span>
                  <small>{snapshot.projects.find((p) => p.id === s.projectId)?.name}</small>
                  {s.title}
                </span>
              </button>
              <button
                type="button"
                className="session-tab-close"
                title={`Detach ${s.title}`}
                aria-label={`Detach ${s.title}`}
                onClick={() => closeSessionTab(s.id)}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        <button
          type="button"
          className="icon-button new-session-tab"
          aria-label="New session in this project"
          onClick={() => vm.newSession(session.projectId)}
        >
          <Plus size={15} />
        </button>
      </nav>
      <section className="session-workspace focused-session">
        {session.error && <div className="session-error">{session.error}</div>}
        {session.kind === 'agent' && !Object.hasOwn(vm.drafts, session.id) ? (
          <div className="runtime-state">
            {vm.draftErrors[session.id] ? (
              <>
                <p role="alert">
                  Could not restore this session draft: {vm.draftErrors[session.id]}
                </p>
                <button type="button" className="button secondary" onClick={vm.retryDraft}>
                  Retry
                </button>
              </>
            ) : (
              <p>Restoring session draft…</p>
            )}
          </div>
        ) : session.kind === 'agent' ? (
          <EngineWorkspace
            key={session.id}
            id={session.id}
            scopeKey={session.workdir}
            projectId={session.projectId}
            projectRoot={
              vm.snapshot.projects.find((project) => project.id === session.projectId)?.root ??
              session.workdir
            }
            draft={getDraft(session.id)}
            mode={vm.draftModes[session.id] ?? 'btw'}
            onModeChange={(mode) => vm.setDraftMode(session.id, mode)}
            onDraftChange={(text) => setDraft(session.id, text)}
            references={vm.composerReferences[session.id] ?? []}
            attachments={vm.composerAttachments[session.id] ?? []}
            onAttachmentsChange={(items) => vm.setAttachments(session.id, items)}
            onReferencesChange={(refs) => vm.setComposerRefs(session.id, refs)}
            onError={reportError}
            inputDrafts={vm.inputDrafts}
            onInputDraftChange={vm.setInputDraft}
            onSettings={() => vm.openWrongStackSettings(session.id)}
            onProject={(page) => vm.openProjectPage(session.projectId, page)}
          />
        ) : (
          <Suspense fallback={<div className="runtime-state">Opening terminal…</div>}>
            <TerminalPane
              key={session.id}
              id={session.id}
              writable={isLive(session)}
              onError={reportError}
            />
          </Suspense>
        )}
        <footer>
          <span className="session-workdir" title={session.workdir}>
            {session.workdir.replace(/^\\\\\?\\/, '')}
          </span>
          {isLive(session) && (
            <button
              type="button"
              className="session-stop"
              title="Stop this session"
              onClick={() => void run(() => request('session.kill', { id: session.id }))}
            >
              <Square size={10} />
              Stop session
            </button>
          )}
        </footer>
      </section>
    </section>
  );
}
