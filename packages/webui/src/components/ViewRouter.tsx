import { lazy, Suspense, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores';
import { ChatView } from './ChatView';
import { AgentTabs } from './ChatView/AgentTabs';
import { ErrorBoundary } from './ErrorBoundary';
import { defaultOnCloseToChat, MainViewSlot } from './MainViewSlot';
import { PanelSuspense } from './PanelSuspense';

/**
 * Main view router — mounts every registered view at most once per session
 * and parks each one when another comes to the front, so the chat virtual
 * transcript + scroll position + composer draft are kept across trips.
 *
 * The per-view render used to be 26 hand-written `currentView === 'X' &&`
 * branches here. They now live in `view-registry.ts` and are rendered by
 * `MainViewSlot`. `chat` itself stays here because it is mounted for the
 * session lifetime (not conditionally on `currentView`) and parked instead
 * of remounted. The terminal bottom dock is also handled here because it is
 * an overlay rather than a "main view" — it can come and go without
 * swapping `currentView`.
 *
 * See docs/audit/webui-full-review-2026-09-03.md B-17.
 */
export function ViewRouter({
  sessionId,
  desktopShell,
}: {
  sessionId: string | null;
  desktopShell: boolean;
}): React.ReactElement {
  const { t } = useAppTranslation();
  const { currentView, terminalOpen, setTerminalOpen } = useUIStore(
    useShallow((s) => ({
      currentView: s.currentView,
      terminalOpen: s.terminalOpen,
      setTerminalOpen: s.setTerminalOpen,
    })),
  );

  const [terminalMounted, setTerminalMounted] = useState(terminalOpen);
  useEffect(() => {
    if (terminalOpen) setTerminalMounted(true);
  }, [terminalOpen]);

  const hasSession = sessionId;
  const onCloseToChat = defaultOnCloseToChat;

  return (
    <>
      {/* The AGENTS switcher belongs to the chat surface. It stays mounted
          across view changes, preserving its session state. Workspace
          controls live in the Session side panel. */}
      {hasSession && (
        <div
          className={cn('flex flex-col', currentView !== 'chat' && 'ws-view-parked')}
          {...(currentView !== 'chat' ? { inert: true, 'aria-hidden': true } : {})}
        >
          <AgentTabs />
        </div>
      )}

      {/* Chat is MOUNTED FOR THE LIFETIME OF THE SESSION and parked when
          another view is in front — never unmounted. It owns a virtualized
          transcript, a scroll position, an unsent composer draft and the live
          stream target; tearing all of that down on every trip to Files or
          Kanban is what made coming back to chat re-render from scratch. */}
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col',
          currentView !== 'chat' && 'ws-view-parked',
        )}
        {...(currentView !== 'chat' ? { inert: true, 'aria-hidden': true } : {})}
      >
        <ErrorBoundary level="panel" name={t('activity:panels.chat')}>
          <ChatView />
        </ErrorBoundary>
      </div>

      {/* Every other view is looked up by id in `view-registry.ts`. Adding
          a view means touching one file, not 30+ branches here. */}
      {currentView !== 'chat' && <MainViewSlot view={currentView} onCloseToChat={onCloseToChat} />}

      {/* Terminal bottom dock. Hiding it keeps its terminals running (the
          composer strip shows them); it unmounts once they are all closed. */}
      {terminalMounted && (
        <ErrorBoundary level="panel" name={t('activity:panels.terminal')}>
          <Suspense
            fallback={
              <PanelSuspense
                label={t('common:loadingNamed', { name: t('activity:panels.terminal') })}
              />
            }
          >
            <TerminalPanelLazy
              desktopShell={desktopShell}
              hidden={!terminalOpen}
              onClose={() => setTerminalOpen(false)}
              onDispose={() => {
                setTerminalOpen(false);
                setTerminalMounted(false);
              }}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  );
}

const TerminalPanelLazy = lazy(() =>
  import('./TerminalPanel').then((m) => ({ default: m.TerminalPanel })),
);
