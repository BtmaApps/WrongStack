import { ArrowDown, Sparkles } from 'lucide-react';
import { AgentChatPane } from './agent-chat-pane.js';
import { ChatMessageList } from './chat-message-list.js';
import { Composer } from './composer.js';
import { ErrorBoundary } from './error-boundary.js';
import { dispatchSimplePanel } from './lib/panel-events.js';
import { removeQueuedAt } from './lib/queue-model.js';
import {
  compactTokens,
  isIncomingMailboxPayload,
  messageId,
  payloadSucceeded,
  payloadText,
} from './lib/session-helpers.js';
import { SessionAgentStrip } from './session-agent-strip.js';
import { SessionMailboxDrawer } from './session-mailbox-drawer.js';
import { SessionModals } from './session-modals.js';
import { SessionTopbar } from './session-topbar.js';
import { ToolSidebar } from './tool-sidebar.js';
import { UpdateBanner } from './update-banner.js';
import { useSimpleUiSession } from './use-simple-ui-session.js';
import { UserInputModal } from './user-input-modal.js';

export { compactTokens, isIncomingMailboxPayload, messageId, payloadSucceeded, payloadText };

export function SimpleUiSession() {
  const {
    session,
    sessions,
    running,
    selectedModel,
    groupedModels,
    providerLabels,
    pendingModelSwitch,
    selectModel,
    confirmModelSwitch,
    cancelModelSwitch,
    context,
    load,
    connection,
    theme,
    commandPaletteOpen,
    mailboxOpen,
    mailboxUnreadCount,
    settingsOpen,
    updateInfo,
    hasUpdate,
    createSession,
    resumeSession,
    sessionIdRef,
    socketRef,
    setContextBreakdownOpen,
    setCommandPaletteOpen,
    toggleTheme,
    refreshMailbox,
    setMailboxOpen,
    setSettingsOpen,
    setUpdateInfo,
    activeAgentId,
    finishedAgentTabs,
    liveAgentTabs,
    setSelectedAgentId,
    leaderSelected,
    scrollRef,
    onScrollSticky,
    displayMessages,
    toolCalls,
    fileEdits,
    copiedMessageId,
    activity,
    resumeProgress,
    resolvedTheme,
    prefs,
    setDiffFiles,
    copyAssistantMessage,
    selectNextStep,
    consumedNextSteps,
    agentTabs,
    agentTranscripts,
    activeAgent,
    selectedToolCalls,
    worklists,
    requestWorklist,
    updateTodoStatus,
    updateTaskStatus,
    updatePlanStatus,
    mailboxStore,
    sendMailboxMessage,
    handleMailboxAction,
    runCommandPaletteAction,
    setDraft,
    textareaRef,
    messages,
    sessionStart,
    contextBreakdownOpen,
    setActivity,
    fallbackPending,
    setFallbackPending,
    modes,
    activeModeId,
    palette,
    switchAutonomy,
    switchMode,
    setPalette,
    updatePrefs,
    resetPrefs,
    isAtDefaults,
    subagentModelOptions,
    fileEditSummary,
    diffFiles,
    outageDismissed,
    outage,
    dismissOutage,
    userInputRequests,
    showJumpToLatest,
    jumpToLatest,
    draft,
    fileRefs,
    setFileRefs,
    fileMention,
    setFileMention,
    fileMatches,
    filePickerIndex,
    setFilePickerIndex,
    fileSearching,
    pendingConfirm,
    notice,
    queue,
    refineState,
    submitWith,
    abort,
    decideConfirm,
    selectFile,
    setQueue,
    refineDecision,
    refineRetry,
    refineRetryFallback,
    refineStartNow,
    refineSendEdited,
    refineEditInComposer,
    prefsRef,
    attachedImages,
    attachImages,
    removeImage,
    visionSupported,
  } = useSimpleUiSession();

  return (
    <div className="app-shell">
      <ErrorBoundary section="topbar">
        <SessionTopbar
          session={session}
          sessions={sessions}
          running={running}
          models={{
            selectedModel,
            groupedModels,
            providerLabels,
            pendingModelSwitch,
            selectModel,
            confirmModelSwitch,
            cancelModelSwitch,
          }}
          contextTokens={context.tokens}
          contextMaxContext={context.maxContext}
          load={load}
          cache={context.cache}
          connection={connection}
          theme={theme}
          commandPaletteOpen={commandPaletteOpen}
          mailboxOpen={mailboxOpen}
          mailboxUnreadCount={mailboxUnreadCount}
          settingsOpen={settingsOpen}
          appVersion={updateInfo.appVersion}
          latestVersion={updateInfo.latestVersion}
          hasUpdate={hasUpdate}
          onCreateSession={createSession}
          onResumeSession={resumeSession}
          onRefreshSessions={() => {
            if (sessionIdRef.current) {
              socketRef.current?.send('sessions.list', {
                sessionId: sessionIdRef.current,
                limit: 12,
              });
            }
          }}
          onOpenContextBreakdown={() => {
            dispatchSimplePanel('open-context-breakdown');
            setContextBreakdownOpen(true);
          }}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          onToggleTheme={toggleTheme}
          onToggleMailbox={() => {
            if (!mailboxOpen) {
              dispatchSimplePanel('open-mailbox');
              refreshMailbox();
            }
            setMailboxOpen(!mailboxOpen);
          }}
          onOpenSettings={() => {
            dispatchSimplePanel('open-settings');
            setSettingsOpen(true);
          }}
        />
      </ErrorBoundary>

      <UpdateBanner
        appVersion={updateInfo.appVersion}
        latestVersion={updateInfo.latestVersion}
        show={hasUpdate}
        onDismiss={() =>
          // Dismiss the *update banner* only — preserve `appVersion` so
          // the persistent topbar version chip stays visible (functional
          // form avoids a stale-closure race if a newer `session.start`
          // lands between render and click). Clearing `appVersion` here
          // would unmount the chip the moment the user dismisses the
          // upgrade call-to-action, contradicting its "visible at all
          // times" contract and diverging from the WebUI sibling
          // (UpdateBanner.tsx keeps appVersion after dismissal).
          setUpdateInfo((prev) => ({
            ...prev,
            latestVersion: '',
            updateAvailable: false,
          }))
        }
      />

      <SessionAgentStrip
        activeAgentId={activeAgentId}
        finishedAgentTabs={finishedAgentTabs}
        liveAgentTabs={liveAgentTabs}
        onSelectAgent={setSelectedAgentId}
      />

      <ErrorBoundary>
        <main
          id="agent-panel-leader"
          className="chat-scroll"
          role="tabpanel"
          aria-labelledby="agent-tab-leader"
          hidden={!leaderSelected}
          ref={scrollRef}
          onScroll={onScrollSticky}
        >
          <ChatMessageList
            messages={displayMessages}
            toolCalls={leaderSelected ? toolCalls : undefined}
            fileEdits={leaderSelected ? fileEdits : undefined}
            copiedMessageId={copiedMessageId}
            running={running}
            activity={activity}
            resumeProgress={resumeProgress}
            theme={resolvedTheme}
            showTimestamps={prefs.showTimestamps}
            onOpenDiff={(meta) => setDiffFiles([meta])}
            emptyState={
              <div className="empty-state">
                <Sparkles size={25} strokeWidth={1.5} />
                <span>READY IN</span>
                <h1>{session?.projectName ?? 'your project'}</h1>
                <p>Describe the job. WrongStack will handle the rest.</p>
              </div>
            }
            onCopyMessage={copyAssistantMessage}
            onSelectNextStep={selectNextStep}
            consumedNextSteps={consumedNextSteps}
          />
        </main>
        {agentTabs
          .filter((agent) => !agent.isLeader)
          .map((agent) => (
            <AgentChatPane
              key={agent.id}
              agentId={agent.id}
              agentName={agent.name}
              entries={agentTranscripts[agent.id] ?? []}
              running={agent.status === 'running' || agent.status === 'busy'}
              hidden={activeAgentId !== agent.id}
              theme={resolvedTheme}
            />
          ))}
      </ErrorBoundary>

      <ErrorBoundary section="workspace">
        <ToolSidebar
          agentId={activeAgentId}
          agentName={activeAgent?.name ?? activeAgentId}
          calls={selectedToolCalls}
          worklists={worklists}
          requestWorklist={requestWorklist}
          onTodoStatusChange={updateTodoStatus}
          onTaskStatusChange={updateTaskStatus}
          onPlanStatusChange={updatePlanStatus}
        />
      </ErrorBoundary>

      <ErrorBoundary section="mailbox">
        <SessionMailboxDrawer
          open={mailboxOpen}
          onClose={() => setMailboxOpen(false)}
          store={mailboxStore}
          onRefresh={refreshMailbox}
          onSend={sendMailboxMessage}
          onAction={handleMailboxAction}
        />
      </ErrorBoundary>

      <SessionModals
        socketRef={socketRef}
        session={session}
        running={running}
        leaderSelected={leaderSelected}
        commandPaletteOpen={commandPaletteOpen}
        onCloseCommandPalette={() => setCommandPaletteOpen(false)}
        onRunCommandPaletteAction={runCommandPaletteAction}
        onRecallPrompt={(text) => {
          setDraft(text);
          textareaRef.current?.focus();
        }}
        context={context}
        messages={messages}
        sessionStart={sessionStart}
        contextBreakdownOpen={contextBreakdownOpen}
        onCloseContextBreakdown={() => setContextBreakdownOpen(false)}
        onOpenContextBreakdown={() => {
          dispatchSimplePanel('open-context-breakdown');
          setContextBreakdownOpen(true);
        }}
        onCompactContext={() => {
          if (sessionIdRef.current) {
            socketRef.current?.send('context.compact', {
              sessionId: sessionIdRef.current,
              aggressive: false,
            });
            setActivity('Compacting context');
          }
          setContextBreakdownOpen(false);
        }}
        fallbackPending={fallbackPending}
        onCloseFallbackModal={() => setFallbackPending(null)}
        settingsOpen={settingsOpen}
        onCloseSettings={() => setSettingsOpen(false)}
        prefs={prefs}
        modes={modes}
        activeModeId={activeModeId}
        palette={palette}
        connection={connection}
        onAutonomyChange={switchAutonomy}
        onModeChange={switchMode}
        onPaletteChange={setPalette}
        onPrefChange={updatePrefs}
        onResetPrefs={resetPrefs}
        isAtDefaults={isAtDefaults}
        modelOptions={subagentModelOptions}
        fileChangeCount={fileEditSummary.fileCount}
        onOpenFileChanges={() => {
          dispatchSimplePanel('open-file-diff');
          setDiffFiles(fileEditSummary.files);
        }}
        diffFiles={diffFiles}
        onCloseDiffFiles={() => setDiffFiles(null)}
        outageDismissed={outageDismissed}
        outage={outage}
        onDismissOutage={dismissOutage}
        sessionId={sessionIdRef.current}
      />
      <UserInputModal
        pending={userInputRequests[0] ?? null}
        queuedCount={userInputRequests.length}
        send={(type, payload) => socketRef.current?.send(type, payload)}
      />

      {leaderSelected && showJumpToLatest && (
        <button type="button" className="jump-to-latest" onClick={jumpToLatest}>
          <ArrowDown size={13} aria-hidden="true" />
          LATEST
        </button>
      )}

      {leaderSelected && (
        <ErrorBoundary>
          <footer className="composer-wrap">
            <Composer
              skillSocket={socketRef.current}
              draft={draft}
              setDraft={setDraft}
              fileRefs={fileRefs}
              setFileRefs={setFileRefs}
              fileMention={fileMention}
              setFileMention={setFileMention}
              fileMatches={fileMatches}
              filePickerIndex={filePickerIndex}
              setFilePickerIndex={setFilePickerIndex}
              fileSearching={fileSearching}
              running={running}
              connection={connection}
              session={session}
              pendingConfirm={pendingConfirm}
              notice={notice}
              textareaRef={textareaRef}
              queue={queue}
              refineState={refineState}
              submitWith={submitWith}
              abort={abort}
              decideConfirm={decideConfirm}
              selectFile={selectFile}
              clearQueue={() => setQueue([])}
              removeQueued={(id) =>
                setQueue((current) =>
                  removeQueuedAt(
                    current,
                    current.findIndex((item) => item.id === id),
                  ),
                )
              }
              onRefineDecision={refineDecision}
              onRefineRetry={refineRetry}
              onRefineRetryFallback={refineRetryFallback}
              onRefineStartNow={refineStartNow}
              onRefineSendEdited={refineSendEdited}
              onRefineEditInComposer={refineEditInComposer}
              preRefineSeconds={prefsRef.current.preRefineSeconds}
              attachedImages={attachedImages}
              onAttachImages={attachImages}
              onRemoveImage={removeImage}
              visionSupported={visionSupported}
            />
          </footer>
        </ErrorBoundary>
      )}
    </div>
  );
}
