/**
 * Dependency contract for the SimpleUI message handler factory.
 *
 * Split into its own module so `message-handler-session-start.ts` can import
 * the type without importing the handler factory — a type-level cycle that
 * the architecture gate (ARCH-CYCLE-TYPE check) would otherwise flag.
 *
 * The contract is sliced by owning domain (session, composer, agent, panel,
 * catalog, settings, view) so handlers can declare exactly the surface they
 * consume; `MessageHandlerDeps` is the intersection every composition root
 * assembles. The runtime object shape is unchanged — this is type-level
 * organization only, and existing deps objects satisfy the intersection.
 */

import type { FallbackPendingProjection } from '../fallback-modal.js';
import type {
  AgentMode,
  AgentTranscriptEntry,
  ChatMessage,
  ContextInfo,
  FileEditMeta,
  ModelDescriptor,
  PendingConfirm,
  ResumeProgressInfo,
  SessionInfo,
  SimpleSessionSummary,
  SimpleSubagent,
  ToolCallInfo,
} from '../types.js';
import type { FileMention } from './file-mention.js';
import type { SimplePrefs } from './prefs-model.js';
import type { QueuedItem } from './queue-model.js';
import type { RefineState } from './refine-model.js';
import type { StatusNoticeProjection } from './status-notice.js';
import type { PendingUserInputRequest } from './user-input-queue.js';
import type { WorklistStore } from './worklist-store.js';

/** Session lifecycle: transcript, run state, session identity and context. */
export interface SessionHandlerSlice {
  sessionIdRef: { current: string | null };
  messagesRef: { current: ChatMessage[] };
  runningRef: { current: boolean };
  socketRef: {
    current: { send: (type: string, payload?: Record<string, unknown>) => void } | null;
  };
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setRunning: React.Dispatch<React.SetStateAction<boolean>>;
  setActivity: React.Dispatch<React.SetStateAction<string>>;
  setToolCalls: React.Dispatch<React.SetStateAction<ToolCallInfo[]>>;
  setSession: React.Dispatch<React.SetStateAction<SessionInfo | null>>;
  setResumeProgress?: React.Dispatch<React.SetStateAction<ResumeProgressInfo | null>>;
  setSessionMenuOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  setSessions: React.Dispatch<React.SetStateAction<SimpleSessionSummary[]>>;
  setContext: React.Dispatch<React.SetStateAction<ContextInfo>>;
  setSessionStart: React.Dispatch<React.SetStateAction<number | null>>;
  resetAgentNameCache: () => void;
  /** Called when a run completes and the user has chime enabled. */
  onChime?: (() => void) | undefined;
  /** Called when session.start contains version/update info. */
  onUpdateInfo?:
    | ((info: { appVersion: string; latestVersion: string; updateAvailable: boolean }) => void)
    | undefined;
}

/** Composer state: draft, file mentions, queue, refine round-trip, sends. */
export interface ComposerHandlerSlice {
  draftRef: { current: string };
  fileRefsRef: { current: string[] };
  queueRef: { current: QueuedItem[] };
  refineStateRef: { current: RefineState | null };
  refineEpochRef: { current: number };
  setDraft: React.Dispatch<React.SetStateAction<string>>;
  setFileRefs: React.Dispatch<React.SetStateAction<string[]>>;
  setFileMention: React.Dispatch<React.SetStateAction<FileMention | null>>;
  setQueue: React.Dispatch<React.SetStateAction<QueuedItem[]>>;
  setRefineState: React.Dispatch<React.SetStateAction<RefineState | null>>;
  setPendingConfirm: React.Dispatch<React.SetStateAction<PendingConfirm | null>>;
  setFileMatches: React.Dispatch<React.SetStateAction<string[]>>;
  setFilePickerIndex: React.Dispatch<React.SetStateAction<number>>;
  setFileSearching: React.Dispatch<React.SetStateAction<boolean>>;
  setAttachedImages: React.Dispatch<
    React.SetStateAction<Array<{ id: string; data: string; mime: string; name: string }>>
  >;
  /** Returns `true` when the message was dispatched, `false` when dropped
   *  (no session / empty content / no socket). Queue-drain callers gate on
   *  this so a dropped drain does not silently consume the queued item. */
  dispatchUserMessage: (
    content: string,
    images?: { data: string; mime: string; mediaType?: string }[],
  ) => boolean;
  writeComposerDraft: (sessionId: string, draft: { text: string; fileRefs: string[] }) => void;
  clearComposerDraft: (sessionId: string) => void;
  readComposerDraft: (sessionId: string) => { text: string; fileRefs: string[] };
}

/** Agent roster: subagent list, transcripts and lane selection. */
export interface AgentHandlerSlice {
  setSubagents: React.Dispatch<React.SetStateAction<SimpleSubagent[]>>;
  setAgentTranscripts: React.Dispatch<React.SetStateAction<Record<string, AgentTranscriptEntry[]>>>;
  setSelectedAgentId: React.Dispatch<React.SetStateAction<string>>;
}

/** Panel surfaces: notices, fallback modal, user-input queue, diff viewer. */
export interface PanelHandlerSlice {
  setNotice: React.Dispatch<React.SetStateAction<(StatusNoticeProjection & { id: string }) | null>>;
  /** Show/dismiss the fallback model modal. */
  setFallbackPending?: React.Dispatch<React.SetStateAction<FallbackPendingProjection | null>>;
  setUserInputRequests?:
    | React.Dispatch<React.SetStateAction<PendingUserInputRequest[]>>
    | undefined;
  setCopiedMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setDiffFiles: React.Dispatch<React.SetStateAction<FileEditMeta[] | null>>;
}

/** Provider/model catalog population and mode catalog. */
export interface CatalogHandlerSlice {
  activeModelRef: { current: { provider: string; model: string } | null };
  requestedModelsRef: { current: Set<string> };
  setModels: React.Dispatch<React.SetStateAction<Record<string, ModelDescriptor[]>>>;
  setModes: React.Dispatch<React.SetStateAction<AgentMode[]>>;
  setActiveModeId: React.Dispatch<React.SetStateAction<string>>;
  setProviderLabels: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  requestProviderModels: (providerId: string) => void;
}

/** Preferences mirrored for live reads and server-driven updates. */
export interface SettingsHandlerSlice {
  prefsRef: { current: SimplePrefs };
  setPrefs: React.Dispatch<React.SetStateAction<SimplePrefs>>;
}

/** Scroll surface: stick-to-bottom mirror and jump-to-latest control. */
export interface ViewHandlerSlice {
  stickToBottomRef: { current: boolean };
  setShowJumpToLatest: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * The full dependency surface the message handler factory consumes — the
 * intersection of every domain slice plus the external worklist store. The
 * composition root assembles one object with exactly this shape.
 */
export type MessageHandlerDeps = SessionHandlerSlice &
  ComposerHandlerSlice &
  AgentHandlerSlice &
  PanelHandlerSlice &
  CatalogHandlerSlice &
  SettingsHandlerSlice &
  ViewHandlerSlice & {
    // External store
    worklists: WorklistStore;
  };
