export const SIMPLEUI_SURFACE = 'simpleui' as const;

// Error boundary — isolated render crash handling
export { ErrorBoundary } from './error-boundary.js';
// Chat model — content extraction & replay
export { contentToText, replayToMessages, updateSubagents } from './lib/chat-model.js';

// Clipboard — copy-to-clipboard with fallback
export type { ClipboardWriter } from './lib/clipboard.js';
export { copyText } from './lib/clipboard.js';

// Composer draft — per-session persistence
export type { ComposerDraft, DraftStorage } from './lib/composer-draft.js';
export { clearComposerDraft, readComposerDraft, writeComposerDraft } from './lib/composer-draft.js';

// File mention — @file picker protocol
export type { FileMention } from './lib/file-mention.js';
export {
  composePromptWithFileReferences,
  detectFileMention,
  fileBasename,
  removeFileMention,
} from './lib/file-mention.js';

// Message projection — next-steps parsing
export type { AssistantMessageProjection } from './lib/message-projection.js';
export { projectAssistantMessage } from './lib/message-projection.js';
// Typed panel open/close events
export type { PanelActivation, SimplePanelEvent, WorkspacePanelView } from './lib/panel-events.js';
export {
  dispatchOpenWorkspacePanel,
  dispatchSimplePanel,
  onOpenWorkspacePanel,
  onPanelActivation,
  onSimplePanel,
} from './lib/panel-events.js';
// Versioned localStorage persistence with quota reporting
export type {
  PersistedStorage,
  PersistedWriteFailureListener,
  PersistedWriteFailureReason,
} from './lib/persisted.js';
export {
  onPersistedWriteFailure,
  readPersisted,
  removePersisted,
  writePersisted,
} from './lib/persisted.js';
export {
  parseSessionSummaries,
  relativeSessionTime,
  sessionDisplayName,
} from './lib/session-model.js';

// Correlated socket requests — request/reply over the shared WebSocket
export type {
  ServerFrame,
  SocketRequestConfig,
  SocketRequestHandle,
} from './lib/socket-request.js';
export { socketRequest } from './lib/socket-request.js';
// Status notices — transient composer bar messages
export type { StatusNoticeProjection } from './lib/status-notice.js';
export { projectStatusNotice } from './lib/status-notice.js';
// Session model — summaries & display names
export type { ChatMessage, SimpleSessionSummary, SimpleSubagent } from './types.js';
