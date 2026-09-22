import { useCallback } from 'react';

import { copyText } from './lib/clipboard.js';

import type { CommandPaletteAction } from './lib/command-palette-model.js';

import { dispatchSimplePanel } from './lib/panel-events.js';

import { messageId } from './lib/session-helpers.js';

import { buildTranscriptMarkdown } from './lib/transcript-export.js';

export function useSessionCommandPalette({
  createSession,
  textareaRef,
  messagesRef,
  session,
  setNotice,
  toggleTheme,
  setSettingsOpen,
  openWorkspacePanel,
  setContextBreakdownOpen,
  sessionIdRef,
  runningRef,
  socketRef,
  setActivity,
}: {
  createSession: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  messagesRef: React.RefObject<import('./types.js').ChatMessage[]>;
  session: import('./types.js').SessionInfo | null;
  setNotice: (
    value:
      | import('./hooks/use-status-notice.js').StatusNotice
      | ((
          prev: import('./hooks/use-status-notice.js').StatusNotice | null,
        ) => import('./hooks/use-status-notice.js').StatusNotice | null)
      | null,
  ) => void;
  toggleTheme: () => void;
  setSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  openWorkspacePanel: (view: 'tools' | import('./lib/worklist-store.js').WorklistView) => void;
  setContextBreakdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sessionIdRef: React.RefObject<string | null>;
  runningRef: React.RefObject<boolean>;
  socketRef: React.RefObject<import('./lib/ws.js').SimpleSocket | null>;
  setActivity: React.Dispatch<React.SetStateAction<string>>;
}) {
  const runCommandPaletteAction = useCallback(
    (action: CommandPaletteAction) => {
      switch (action) {
        case 'new-session':
          createSession();
          return;
        case 'focus-composer':
          textareaRef.current?.focus();
          return;
        case 'copy-transcript': {
          const markdown = buildTranscriptMarkdown(messagesRef.current, {
            title: session?.projectName,
          });
          void copyText(markdown).then((copied) => {
            setNotice({
              id: messageId('notice'),
              text: copied ? 'Transcript copied to clipboard' : 'Could not copy transcript',
              tone: copied ? 'info' : 'error',
            });
          });
          return;
        }
        case 'toggle-theme':
          toggleTheme();
          return;
        case 'open-settings':
          dispatchSimplePanel('open-settings');
          setSettingsOpen(true);
          return;
        case 'open-tools':
          openWorkspacePanel('tools');
          return;
        case 'open-todos':
          openWorkspacePanel('todos');
          return;
        case 'open-tasks':
          openWorkspacePanel('tasks');
          return;
        case 'open-plan':
          openWorkspacePanel('plan');
          return;
        case 'open-memory':
          dispatchSimplePanel('open-memory-drawer');
          return;
        case 'open-vector-memory':
          dispatchSimplePanel('open-vector-memory-panel');
          return;
        case 'open-files':
          dispatchSimplePanel('open-file-explorer');
          return;
        case 'open-prompts':
          dispatchSimplePanel('open-prompt-library');
          return;
        case 'open-brain':
          dispatchSimplePanel('open-brain-panel');
          return;
        case 'open-health':
          dispatchSimplePanel('open-session-health');
          return;
        case 'open-context-breakdown':
          dispatchSimplePanel('open-context-breakdown');
          setContextBreakdownOpen(true);
          return;
        case 'compact-context':
          if (sessionIdRef.current && !runningRef.current) {
            socketRef.current?.send('context.compact', {
              sessionId: sessionIdRef.current,
              aggressive: false,
            });
            setActivity('Compacting context');
          }
          return;
      }
    },
    [createSession, openWorkspacePanel, toggleTheme, session],
  );
  return { runCommandPaletteAction };
}
