import { useEffect, useRef, useState } from 'react';
import { AutomationWorkspace } from './automation-workspace.js';
import { useFocusTrap } from './hooks/use-focus-trap.js';
import { onPanelActivation, onSimplePanel } from './lib/panel-events.js';

export function AutomationPanel({
  projectRoot,
  sessionId,
}: {
  projectRoot?: string | undefined;
  sessionId?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  useFocusTrap(dialog, open);
  useEffect(() => {
    const stopOpen = onSimplePanel('open-automation', () => setOpen(true));
    const stopPeers = onPanelActivation((panel) => {
      if (panel !== 'open-automation') setOpen(false);
    });
    return () => {
      stopOpen();
      stopPeers();
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);
  if (!open) return null;
  return (
    <div className="automation-overlay">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Automations"
        className="automation-dialog"
      >
        <button type="button" className="automation-close" onClick={() => setOpen(false)}>
          Close automations
        </button>
        <AutomationWorkspace key={`${projectRoot}:${sessionId}`} sessionId={sessionId} />
      </div>
    </div>
  );
}
