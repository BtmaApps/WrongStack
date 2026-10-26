import { ArrowUpRight, BookOpen, Folder, KeyRound, ListChecks, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

export function WorkspaceTools({
  onClose,
  onActivity,
  onSkills,
  onProject,
  onSettings,
}: {
  onClose: () => void;
  onActivity: () => void;
  onSkills: () => void;
  onProject: () => void;
  onSettings: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="tools-dialog session-tools-dialog"
      aria-label="Session tools"
      onCancel={onClose}
    >
      <header>
        <div>
          <span className="eyebrow">THIS CONVERSATION</span>
          <h2>Follow the work.</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close session tools"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>
      <div className="session-tool-choices">
        <button type="button" onClick={onActivity}>
          <ListChecks size={21} />
          <div>
            <strong>Run activity</strong>
            <span>Tool calls, execution output, and verification in this conversation.</span>
          </div>
          <ArrowUpRight size={15} />
        </button>
        <button type="button" onClick={onSkills}>
          <BookOpen size={21} />
          <div>
            <strong>Available skills</strong>
            <span>Read the skills available to this agent.</span>
          </div>
          <ArrowUpRight size={15} />
        </button>
      </div>
      <div className="session-tool-shared">
        <p>Project knowledge and settings have their own workspace.</p>
        <button type="button" onClick={onProject}>
          <Folder size={16} />
          Project workspace
          <span className="session-project-tools-hint">Memory · Kanban · Code Atlas</span>
          <ArrowUpRight size={14} />
        </button>
        <button type="button" onClick={onSettings}>
          <KeyRound size={16} />
          WrongStack settings
          <ArrowUpRight size={14} />
        </button>
      </div>
    </dialog>
  );
}
