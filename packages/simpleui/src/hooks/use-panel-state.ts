import { useEffect, useRef, useState } from 'react';
import { onPanelActivation } from '../lib/panel-events.js';
import type { FileEditMeta } from '../types.js';

export interface UsePanelStateOptions {
  /** Owned by `useSettings`; closed by the exclusive-surface rule. */
  setSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** Owned by `useSimpleMailbox`; closed by the exclusive-surface rule. */
  setMailboxOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface UsePanelStateResult {
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: React.Dispatch<React.SetStateAction<boolean>>;
  contextBreakdownOpen: boolean;
  setContextBreakdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  diffFiles: FileEditMeta[] | null;
  setDiffFiles: React.Dispatch<React.SetStateAction<FileEditMeta[] | null>>;
  /** Live mirror for the global Escape chain; reads without re-rendering. */
  diffFilesRef: React.RefObject<FileEditMeta[] | null>;
  copiedMessageId: string | null;
  setCopiedMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  consumedNextSteps: Set<string>;
  setConsumedNextSteps: React.Dispatch<React.SetStateAction<Set<string>>>;
}

/**
 * Panel-surface state for the SimpleUI session: the command palette,
 * context-breakdown modal, file-diff viewer, transcript copy badge and
 * consumed next-steps marks — plus the exclusive-surface rule that closes
 * foreign drawers when a panel activates. Extracted from
 * `use-simple-ui-session.tsx` unchanged (facade contract preserved).
 */
export function usePanelState({
  setSettingsOpen,
  setMailboxOpen,
}: UsePanelStateOptions): UsePanelStateResult {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [contextBreakdownOpen, setContextBreakdownOpen] = useState(false);
  const [diffFiles, setDiffFiles] = useState<FileEditMeta[] | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [consumedNextSteps, setConsumedNextSteps] = useState<Set<string>>(new Set());
  const diffFilesRef = useRef<FileEditMeta[] | null>(null);
  diffFilesRef.current = diffFiles;

  // Settings, context, mailbox, file diff, and the independently mounted
  // utility panels share one exclusive surface rule. A newly activated panel
  // must not leave a prior drawer alive underneath its overlay.
  useEffect(() => {
    return onPanelActivation((panel) => {
      if (panel !== 'open-settings') setSettingsOpen(false);
      if (panel !== 'open-context-breakdown') setContextBreakdownOpen(false);
      if (panel !== 'open-mailbox') setMailboxOpen(false);
    });
  }, [setContextBreakdownOpen, setMailboxOpen, setSettingsOpen]);

  // The copy badge fades after a beat; owning the timer here keeps the
  // composition root free of panel-only concerns.
  useEffect(() => {
    if (!copiedMessageId) return;
    const timer = setTimeout(() => setCopiedMessageId(null), 1_800);
    return () => clearTimeout(timer);
  }, [copiedMessageId]);

  return {
    commandPaletteOpen,
    setCommandPaletteOpen,
    contextBreakdownOpen,
    setContextBreakdownOpen,
    diffFiles,
    setDiffFiles,
    diffFilesRef,
    copiedMessageId,
    setCopiedMessageId,
    consumedNextSteps,
    setConsumedNextSteps,
  };
}
