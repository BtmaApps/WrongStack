# Codebase Atlas

Generated from the codebase index. Do not edit by hand — run `/codebase-map --write`.

- Indexed files: 8856
- Indexed symbols: 69931
- Packages: 30

Ranking is PageRank over the reference graph (calls, imports, type references,
inheritance). `1.0000` is the most central file in this repository; the scores
are relative to this repository only.

## Packages

| Package | Files | Hub | Rank |
| --- | ---: | --- | ---: |
| @wrongstack/kanban | 161 | `packages/kanban/src/types.ts` | 1.0000 |
| @wrongstack/acp | 90 | `packages/acp/src/types/acp-v1.ts` | 0.8616 |
| @wrongstack/core | 2214 | `packages/core/src/types/provider.ts` | 0.8612 |
| @wrongstack/webui | 996 | `packages/webui/src/lib/ws-client-actions.ts` | 0.7188 |
| @wrongstack/sage | 202 | `packages/sage/src/types.ts` | 0.6817 |
| @wrongstack/tools | 448 | `packages/tools/src/codebase-index/writer.ts` | 0.6691 |
| @wrongstack/mcp | 79 | `packages/mcp/src/client.ts` | 0.5499 |
| @wrongstack/webui-server | 453 | `packages/webui-server/src/server/ws-payload-validation.ts` | 0.5128 |
| @wrongstack/providers | 140 | `packages/providers/src/openai-codex.ts` | 0.4983 |
| @wrongstack/techstack | 91 | `packages/techstack/src/types.ts` | 0.4375 |
| @wrongstack/desktop | 75 | `apps/desktop/src/main/runtime-manager.ts` | 0.4112 |
| @wrongstack/governance | 71 | `packages/governance/src/capability-grant.ts` | 0.4024 |
| @wrongstack/requirement-intake | 32 | `packages/requirement-intake/src/types.ts` | 0.3927 |
| @wrongstack/plugins | 221 | `packages/plugins/src/todo-tracker/index.ts` | 0.3857 |
| @wrongstack/telegram | 64 | `packages/telegram/src/api-client.ts` | 0.3676 |
| wrongstack-monorepo | 665 | `scripts/release-check-matrix.mjs` | 0.3349 |
| @wrongstack/bench | 89 | `packages/bench/src/types.ts` | 0.2967 |
| @wrongstack/primitives | 14 | `packages/primitives/src/regex-ambiguity.ts` | 0.2955 |
| @wrongstack/cli | 1014 | `packages/cli/src/tuneup.ts` | 0.2824 |
| @wrongstack/tui | 769 | `packages/tui/src/components/settings-picker-constants.ts` | 0.2433 |
| @wrongstack/webui-hq | 176 | `packages/webui-hq/src/data/transport/hq-socket.ts` | 0.2422 |
| @wrongstack/sdd | 80 | `packages/sdd/src/sdd-board-store.ts` | 0.2256 |
| @wrongstack/security-scanner | 49 | `packages/security-scanner/src/types.ts` | 0.2156 |
| @wrongstack/runtime | 35 | `packages/runtime/src/governance-bootstrap.ts` | 0.2096 |
| @wrongstack/vector-memory | 38 | `packages/vector-memory/src/store.ts` | 0.2057 |
| @wrongstack/simpleui | 175 | `packages/simpleui/src/lib/agent-model.ts` | 0.2029 |
| @wrongstack/plug-lsp | 99 | `packages/plug-lsp/src/types.ts` | 0.1937 |
| @wrongstack/wrongtrace | 21 | `packages/wrongtrace/src/client.ts` | 0.1901 |
| @wrongstack/persistence | 20 | `packages/persistence/src/atomic-write.ts` | 0.1871 |
| wrongstack-website | 105 | `website/src/components/site/KanbanLiveDemo.tsx` | 0.1807 |

## Most central files (top 60 of 300)

The full ranking, with every declaration, is in `atlas.json`.

| Rank | File | In | Out | Declarations |
| ---: | --- | ---: | ---: | --- |
| 1.0000 | `packages/kanban/src/types.ts` | 1727 | 78 | `KanbanTaskPriority`, `KanbanTaskType`, `KanbanTaskStatus` |
| 0.8616 | `packages/acp/src/types/acp-v1.ts` | 264 | 99 | `ACP_PROTOCOL_VERSION`, `ACPProtocolVersion`, `SessionId` |
| 0.8612 | `packages/core/src/types/provider.ts` | 1786 | 85 | `ReasoningEffort`, `REASONING_EFFORT_LEVELS`, `isReasoningEffort` |
| 0.7188 | `packages/webui/src/lib/ws-client-actions.ts` | 102 | 98 | `WsClientActionHost`, `WsClientActionMethods`, `actionMethods` |
| 0.6817 | `packages/sage/src/types.ts` | 604 | 91 | `SAGE_SCHEMA_VERSION`, `SageScope`, `PersistenceClass` |
| 0.6795 | `packages/kanban/src/test-support-session.ts` | 52 | 70 | `TEST_EVENT_CONTEXT`, `WithBoundTail`, `WithBoundOptions` |
| 0.6691 | `packages/tools/src/codebase-index/writer.ts` | 170 | 252 | `DB_FILE`, `MAX_STATEMENT_CACHE`, `IndexStore` |
| 0.6620 | `packages/core/src/types/session.ts` | 810 | 39 | `SessionMetadata`, `SessionEvent`, `SessionEventAttribution` |
| 0.6295 | `packages/webui/src/lib/ws-client-domain-methods.ts` | 67 | 77 | `WsClientDomainHost`, `domainMethods`, `getGitInfo` |
| 0.6064 | `packages/kanban/src/server/kanban-store.ts` | 48 | 66 | `DomainModule`, `DomainArgs`, `DomainResult` |
| 0.6038 | `packages/core/src/hq/protocol/core.ts` | 107 | 205 | `HqWelcomePayload`, `HqUsagePayload`, `HqMachineRecord` |
| 0.5878 | `packages/core/src/coordination/knowledge-graph.ts` | 206 | 121 | `NodeType`, `FactCategory`, `GoalStatus` |
| 0.5690 | `packages/webui/src/types/server-message.ts` | 0 | 294 | `WSServerMessage` |
| 0.5499 | `packages/mcp/src/client.ts` | 66 | 136 | `Transport`, `MCPClientOptions`, `MCPRequestOptions` |
| 0.5156 | `packages/core/src/coordination/brain.ts` | 442 | 85 | `BrainDecisionSource`, `BrainRisk`, `BRAIN_RISK_LEVELS` |
| 0.5128 | `packages/webui-server/src/server/ws-payload-validation.ts` | 181 | 130 | `PayloadValidationResult`, `isRecord`, `clampLimit` |
| 0.4983 | `packages/providers/src/openai-codex.ts` | 82 | 242 | `DEFAULT_CODEX_BASE`, `isReasoningReplayRejection`, `CODEX_TURN_STATE_HEADER` |
| 0.4910 | `packages/mcp/src/authorization.ts` | 209 | 167 | `MCPAccessToken`, `MCPAuthorizationContext`, `MCPAuthorizationChallenge` |
| 0.4741 | `packages/tools/src/codebase-index/schema.ts` | 424 | 21 | `SymbolLang`, `SymbolKind`, `Symbol` |
| 0.4624 | `packages/core/src/types/multi-agent.ts` | 541 | 36 | `SubagentSpawnLineage`, `SubagentConfig`, `SubagentErrorKind` |
| 0.4495 | `packages/tools/src/codebase-index/background-indexer.ts` | 199 | 210 | `DEFAULT_FULL_INDEX_TIMEOUT_MS`, `DEFAULT_INCREMENTAL_TIMEOUT_MS`, `DEFAULT_QUERY_TIMEOUT_MS` |
| 0.4375 | `packages/techstack/src/types.ts` | 460 | 16 | `EcosystemId`, `SourceType`, `DependencyScope` |
| 0.4371 | `packages/core/src/security/yolo-risk.ts` | 160 | 108 | `PROTECTED_STATE_BASENAMES`, `CATASTROPHIC_PATTERNS`, `HIGH_IMPACT_PATTERNS` |
| 0.4308 | `packages/tools/src/session-kanban.ts` | 148 | 243 | `SESSION_BOARD_TAG`, `MIRROR_DISABLED_ENV`, `PURGE_AFTER_ARCHIVE_DAYS_ENV` |
| 0.4291 | `packages/sage/src/sqlite-store.ts` | 200 | 236 | `isSqliteAvailable`, `SqliteSageStore`, `paths` |
| 0.4262 | `packages/tools/src/languages/types.ts` | 302 | 42 | `LanguageProfileId`, `LanguageOperation`, `EvidenceKind` |
| 0.4112 | `apps/desktop/src/main/runtime-manager.ts` | 79 | 245 | `DesktopStateFile`, `DesktopProjectSessionState`, `RuntimeInternal` |
| 0.4031 | `packages/tools/src/browser/tools.ts` | 68 | 153 | `managers`, `cleanupSignalByContext`, `signalFor` |
| 0.4024 | `packages/governance/src/capability-grant.ts` | 158 | 67 | `DEFAULT_GOVERNANCE_GRANT_MAX_TTL_MS`, `DEFAULT_GOVERNANCE_MAX_GRANTS`, `GovernanceCapabilityGrantStatus` |
| 0.4022 | `packages/kanban/src/client-domain.ts` | 1431 | 93 | `DomainModule`, `DomainFunction`, `operationSet` |
| 0.4005 | `packages/governance/src/event-store.ts` | 104 | 134 | `GOVERNANCE_EVENT_STORE_SCHEMA_VERSION`, `EventRow`, `ReceiptRow` |
| 0.3952 | `packages/core/src/storage/session-store.ts` | 80 | 190 | `DefaultSessionStore`, `dir`, `events` |
| 0.3927 | `packages/requirement-intake/src/types.ts` | 204 | 46 | `IntakeActor`, `IntakeContext`, `IntakeAttachment` |
| 0.3916 | `packages/core/src/coordination/mailbox-types.ts` | 303 | 60 | `RegisteredAgent`, `MailboxAgentStatus`, `MailboxQuery` |
| 0.3901 | `packages/kanban/src/storage.ts` | 185 | 199 | `KANBANS_DIR`, `BOARD_ID_RE`, `testMetadata` |
| 0.3860 | `packages/core/src/types/errors.ts` | 469 | 62 | `ERROR_CODES`, `ErrorCode`, `ErrorSubsystem` |
| 0.3857 | `packages/plugins/src/todo-tracker/index.ts` | 77 | 161 | `Status`, `Priority`, `STATUSES` |
| 0.3835 | `packages/webui/src/stores/chat-lanes.ts` | 426 | 146 | `MAX_LANES`, `DEFAULT_LANE_ID`, `ChatLaneData` |
| 0.3824 | `packages/core/src/core/context.ts` | 879 | 87 | `RunOptions`, `ContextInit`, `Context` |
| 0.3806 | `packages/webui/src/types/protocol-core.ts` | 149 | 37 | `WSSessionStart`, `WSSessionEnd`, `SessionScopedPayload` |
| 0.3774 | `packages/core/src/chronicle/journal.ts` | 108 | 134 | `DEFAULT_MAX_PARTITION_BYTES`, `DEFAULT_ROTATION_WINDOW_MS`, `RETENTION_CHECKPOINT_VERSION` |
| 0.3676 | `packages/telegram/src/api-client.ts` | 182 | 65 | `TelegramApiUser`, `TelegramApiChatType`, `TelegramApiChat` |
| 0.3668 | `packages/kanban/src/types-operations.ts` | 241 | 139 | `CreateKanbanBoardInput`, `UpdateKanbanBoardInput`, `DuplicateKanbanBoardInput` |
| 0.3651 | `packages/governance/src/daemon-metadata.ts` | 165 | 144 | `GOVERNANCE_DAEMON_METADATA_SCHEMA_VERSION`, `GOVERNANCE_DAEMON_STARTUP_LEASE_SCHEMA_VERSION`, `GOVERNANCE_DAEMON_ATTACHMENT_BROKER_SCHEMA_VERSION` |
| 0.3626 | `packages/core/src/chronicle/project-server.ts` | 448 | 219 | `DEFAULT_IDLE_MS`, `MAX_APPEND_BATCH`, `MAX_CLIENT_WRITE_BUFFER_BYTES` |
| 0.3598 | `packages/mcp/src/registry.ts` | 101 | 173 | `MCPRegistry`, `servers`, `disabledServers` |
| 0.3580 | `packages/core/src/coordination/director.ts` | 4 | 175 | `BUSY_REARM_FLOOR_MS`, `isHumanPinnedSpawn`, `Director` |
| 0.3578 | `packages/acp/src/client/acp-session.ts` | 54 | 168 | `PendingRequest`, `State`, `LATE_CANCEL_SEND_TIMEOUT_MS` |
| 0.3457 | `packages/requirement-intake/src/service.ts` | 69 | 194 | `RequirementIntakeServiceOptions`, `IntakeCreateResult`, `IntakeSubmitResult` |
| 0.3416 | `packages/core/src/utils/tool-output-serializer.ts` | 67 | 112 | `ToolOutputSerializerOptions`, `ToolOutputSerializeContext`, `RecordValue` |
| 0.3368 | `packages/core/src/execution/prompt-enhancer.ts` | 94 | 123 | `ENHANCER_SYSTEM_PROMPT`, `AFFIRMATION_RE`, `shouldEnhance` |
| 0.3349 | `scripts/release-check-matrix.mjs` | 1232 | 97 | `LOG_DIRS`, `CACHE_SCHEMA_VERSION`, `CACHEABLE_GATES` |
| 0.3329 | `packages/core/src/coordination/sqlite-mailbox.ts` | 45 | 204 | `SQLITE_MAILBOX_FILE`, `HEARTBEAT_TRACKING_MAX_ENTRIES`, `HEARTBEAT_TRACKING_TTL_MS` |
| 0.3279 | `apps/desktop/src/shared/types.ts` | 212 | 17 | `DesktopProjectEntry`, `DesktopOpenSessionEntry`, `DesktopOpenSessionsSnapshot` |
| 0.3275 | `packages/plugins/src/accessibility-auditor/index.ts` | 36 | 101 | `API_VERSION`, `A11yRule`, `A11yFinding` |
| 0.3273 | `packages/requirement-intake/src/validation.ts` | 62 | 69 | `requestTypeSchema`, `prioritySchema`, `intakeQuestionStatusSchema` |
| 0.3237 | `packages/core/src/coordination/fleet-bus.ts` | 245 | 37 | `FleetEvent`, `FleetHandler`, `FleetBus` |
| 0.3228 | `packages/governance/src/runtime-compatibility.ts` | 84 | 142 | `GOVERNANCE_COMPATIBILITY_ADMIN_TTL_MS`, `GOVERNANCE_COMPATIBILITY_MODEL_TTL_MS`, `GovernanceModelCapability` |
| 0.3223 | `packages/requirement-intake/src/constants.ts` | 134 | 1 | `INTAKE_ID_PREFIX`, `ANSWER_ID_PREFIX`, `ATTACHMENT_ID_PREFIX` |
| 0.3216 | `packages/core/src/execution/auto-compaction-middleware.ts` | 59 | 132 | `PressureLevel`, `LEVEL_RANK`, `pressureLevelFor` |
