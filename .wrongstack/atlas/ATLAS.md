# Codebase Atlas

Generated from the codebase index. Do not edit by hand — run `/codebase-map --write`.

- Indexed files: 9347
- Indexed symbols: 72866
- Packages: 30

Ranking is PageRank over the reference graph (calls, imports, type references,
inheritance). `1.0000` is the most central file in this repository; the scores
are relative to this repository only.

## Packages

| Package | Files | Hub | Rank |
| --- | ---: | --- | ---: |
| @wrongstack/acp | 95 | `packages/acp/src/types/acp-v1.ts` | 1.0000 |
| @wrongstack/core | 2357 | `packages/core/src/types/provider.ts` | 0.9822 |
| @wrongstack/webui | 1037 | `packages/webui/src/lib/ws-client-actions.ts` | 0.8596 |
| @wrongstack/kanban | 174 | `packages/kanban/src/types.ts` | 0.8513 |
| @wrongstack/tools | 504 | `packages/tools/src/codebase-index/writer.ts` | 0.7831 |
| @wrongstack/mcp | 83 | `packages/mcp/src/authorization.ts` | 0.5587 |
| @wrongstack/sage | 233 | `packages/sage/src/types.ts` | 0.5319 |
| @wrongstack/governance | 72 | `packages/governance/src/event-store.ts` | 0.4858 |
| @wrongstack/techstack | 91 | `packages/techstack/src/types.ts` | 0.4416 |
| @wrongstack/requirement-intake | 32 | `packages/requirement-intake/src/types.ts` | 0.4389 |
| @wrongstack/telegram | 68 | `packages/telegram/src/api-client.ts` | 0.4308 |
| wrongstack-monorepo | 693 | `scripts/release-check-matrix.mjs` | 0.4193 |
| @wrongstack/providers | 166 | `packages/providers/src/index.ts` | 0.4025 |
| @wrongstack/plugins | 204 | `packages/plugins/src/accessibility-auditor/index.ts` | 0.3866 |
| @wrongstack/desktop | 80 | `apps/desktop/src/main/runtime-manager.ts` | 0.3741 |
| @wrongstack/webui-server | 485 | `packages/webui-server/src/server/ws-payload-validation.ts` | 0.3681 |
| @wrongstack/primitives | 16 | `packages/primitives/src/regex-ambiguity.ts` | 0.3251 |
| @wrongstack/bench | 89 | `packages/bench/src/types.ts` | 0.3240 |
| @wrongstack/cli | 1057 | `packages/cli/src/tuneup.ts` | 0.3225 |
| @wrongstack/runtime | 37 | `packages/runtime/src/governance-bootstrap.ts` | 0.3141 |
| @wrongstack/webui-hq | 178 | `packages/webui-hq/src/data/local-prefs.ts` | 0.2842 |
| @wrongstack/tui | 814 | `packages/tui/src/ui-glyphs.ts` | 0.2814 |
| @wrongstack/simpleui | 186 | `packages/simpleui/src/types.ts` | 0.2757 |
| @wrongstack/sdd | 81 | `packages/sdd/src/sdd-board-store.ts` | 0.2552 |
| @wrongstack/vector-memory | 39 | `packages/vector-memory/src/store.ts` | 0.2409 |
| @wrongstack/plug-lsp | 104 | `packages/plug-lsp/src/types.ts` | 0.2358 |
| @wrongstack/security-scanner | 49 | `packages/security-scanner/src/types.ts` | 0.2324 |
| @wrongstack/persistence | 22 | `packages/persistence/src/atomic-write.ts` | 0.2187 |
| wrongstack-website | 105 | `website/src/components/site/KanbanLiveDemo.tsx` | 0.2186 |
| @wrongstack/wrongtrace | 21 | `packages/wrongtrace/src/client.ts` | 0.2177 |

## Most central files (top 60 of 300)

The full ranking, with every declaration, is in `atlas.json`.

| Rank | File | In | Out | Declarations |
| ---: | --- | ---: | ---: | --- |
| 1.0000 | `packages/acp/src/types/acp-v1.ts` | 329 | 99 | `ACP_PROTOCOL_VERSION`, `ACPProtocolVersion`, `SessionId` |
| 0.9822 | `packages/core/src/types/provider.ts` | 2157 | 85 | `ReasoningEffort`, `REASONING_EFFORT_LEVELS`, `isReasoningEffort` |
| 0.8596 | `packages/webui/src/lib/ws-client-actions.ts` | 90 | 98 | `WsClientActionHost`, `WsClientActionMethods`, `actionMethods` |
| 0.8513 | `packages/kanban/src/types.ts` | 1516 | 100 | `KanbanTaskPriority`, `KanbanTaskType`, `KanbanTaskStatus` |
| 0.7831 | `packages/tools/src/codebase-index/writer.ts` | 220 | 262 | `DB_FILE`, `MAX_STATEMENT_CACHE`, `IndexStore` |
| 0.7813 | `packages/kanban/src/test-support-session.ts` | 52 | 70 | `TEST_EVENT_CONTEXT`, `WithBoundTail`, `WithBoundOptions` |
| 0.7051 | `packages/kanban/src/server/kanban-store.ts` | 98 | 67 | `DomainModule`, `DomainArgs`, `DomainResult` |
| 0.6925 | `packages/core/src/coordination/knowledge-graph.ts` | 399 | 121 | `NodeType`, `FactCategory`, `GoalStatus` |
| 0.6570 | `packages/webui/src/types/server-message.ts` | 0 | 294 | `WSServerMessage` |
| 0.6528 | `packages/webui/src/lib/ws-client-domain-methods.ts` | 105 | 74 | `WsClientDomainHost`, `domainMethods`, `getGitInfo` |
| 0.6051 | `packages/core/src/coordination/brain.ts` | 502 | 86 | `BrainDecisionSource`, `BrainRisk`, `BRAIN_RISK_LEVELS` |
| 0.5758 | `packages/webui/src/lib/fonts.ts` | 223 | 115 | `FontRole`, `FontCategory`, `FontSource` |
| 0.5726 | `packages/tools/src/codebase-index/schema.ts` | 465 | 21 | `SymbolLang`, `SymbolKind`, `Symbol` |
| 0.5587 | `packages/mcp/src/authorization.ts` | 194 | 184 | `MCPAccessToken`, `MCPAuthorizationContext`, `MCPAuthorizationChallenge` |
| 0.5319 | `packages/sage/src/types.ts` | 444 | 91 | `SAGE_SCHEMA_VERSION`, `DEFAULT_PERSISTENCE`, `VALID_PERSISTENCE` |
| 0.5263 | `packages/core/src/types/multi-agent.ts` | 560 | 36 | `SubagentSpawnLineage`, `SubagentConfig`, `SubagentErrorKind` |
| 0.5129 | `packages/core/src/types/errors.ts` | 876 | 63 | `ERROR_CODES`, `ErrorCode`, `ErrorSubsystem` |
| 0.5008 | `packages/tools/src/languages/types.ts` | 286 | 42 | `LanguageProfileId`, `LanguageOperation`, `EvidenceKind` |
| 0.4961 | `packages/kanban/src/client-domain.ts` | 1391 | 97 | `DomainModule`, `DomainFunction`, `operationSet` |
| 0.4952 | `packages/core/src/security/yolo-risk.ts` | 160 | 110 | `PROTECTED_STATE_BASENAMES`, `CATASTROPHIC_PATTERNS`, `HIGH_IMPACT_PATTERNS` |
| 0.4888 | `packages/core/src/kernel/events.ts` | 1243 | 79 | `MAX_WILDCARDS`, `MAX_NAMED_LISTENERS`, `BrainInterventionKind` |
| 0.4868 | `packages/tools/src/session-kanban.ts` | 148 | 253 | `SESSION_BOARD_TAG`, `MIRROR_DISABLED_ENV`, `PURGE_AFTER_ARCHIVE_DAYS_ENV` |
| 0.4858 | `packages/governance/src/event-store.ts` | 107 | 142 | `GOVERNANCE_EVENT_STORE_SCHEMA_VERSION`, `EventRow`, `ReceiptRow` |
| 0.4711 | `packages/tools/src/codebase-index/background-indexer.ts` | 255 | 195 | `DEFAULT_FULL_INDEX_TIMEOUT_MS`, `DEFAULT_INCREMENTAL_TIMEOUT_MS`, `DEFAULT_QUERY_TIMEOUT_MS` |
| 0.4691 | `packages/core/src/hq/protocol/event-payload-validation.ts` | 46 | 134 | `KNOWN_HQ_EVENT_PAYLOAD_TYPES`, `isHqMcpLatencySummary`, `isHqMcpFailureCounts` |
| 0.4628 | `packages/sage/src/sqlite-store.ts` | 154 | 236 | `SqliteSageStore`, `paths`, `projectRoot` |
| 0.4609 | `packages/tools/src/browser/tools.ts` | 68 | 154 | `managers`, `cleanupSignalByContext`, `signalFor` |
| 0.4566 | `packages/governance/src/capability-grant.ts` | 325 | 71 | `DEFAULT_GOVERNANCE_GRANT_MAX_TTL_MS`, `DEFAULT_GOVERNANCE_MAX_GRANTS`, `GovernanceCapabilityGrantStatus` |
| 0.4554 | `packages/core/src/storage/session-store.ts` | 170 | 190 | `DefaultSessionStore`, `dir`, `events` |
| 0.4495 | `packages/core/src/core/context.ts` | 1282 | 89 | `RunOptions`, `ContextInit`, `Context` |
| 0.4456 | `packages/governance/src/daemon-metadata.ts` | 206 | 148 | `GOVERNANCE_DAEMON_METADATA_SCHEMA_VERSION`, `GOVERNANCE_DAEMON_STARTUP_LEASE_SCHEMA_VERSION`, `GOVERNANCE_DAEMON_ATTACHMENT_BROKER_SCHEMA_VERSION` |
| 0.4435 | `packages/core/src/coordination/director.ts` | 122 | 183 | `Director`, `_asManifestEntry`, `coordinatorId` |
| 0.4416 | `packages/techstack/src/types.ts` | 346 | 16 | `EcosystemId`, `SourceType`, `DependencyScope` |
| 0.4389 | `packages/webui/src/types/protocol-core.ts` | 149 | 37 | `WSSessionStart`, `WSSessionEnd`, `SessionScopedPayload` |
| 0.4389 | `packages/requirement-intake/src/types.ts` | 204 | 46 | `IntakeActor`, `IntakeContext`, `IntakeAttachment` |
| 0.4385 | `packages/core/src/coordination/mailbox-types.ts` | 322 | 60 | `RegisteredAgent`, `MailboxAgentStatus`, `MailboxQuery` |
| 0.4323 | `packages/mcp/src/client.ts` | 52 | 127 | `MCPClient`, `capabilityClient`, `MAX_RX_BUFFER_BYTES` |
| 0.4321 | `packages/core/src/chronicle/journal.ts` | 155 | 134 | `DEFAULT_MAX_PARTITION_BYTES`, `DEFAULT_ROTATION_WINDOW_MS`, `RETENTION_CHECKPOINT_VERSION` |
| 0.4308 | `packages/telegram/src/api-client.ts` | 179 | 70 | `TelegramApiUser`, `TelegramApiChatType`, `TelegramApiChat` |
| 0.4275 | `packages/kanban/src/storage.ts` | 180 | 200 | `KANBANS_DIR`, `BOARD_ID_RE`, `testMetadata` |
| 0.4262 | `packages/mcp/src/registry.ts` | 114 | 178 | `MCPRegistry`, `servers`, `disabledServers` |
| 0.4219 | `packages/core/src/chronicle/project-server.ts` | 610 | 225 | `DEFAULT_IDLE_MS`, `MAX_APPEND_BATCH`, `MAX_CLIENT_WRITE_BUFFER_BYTES` |
| 0.4193 | `scripts/release-check-matrix.mjs` | 1016 | 111 | `LOG_DIRS`, `CACHE_SCHEMA_VERSION`, `CACHEABLE_GATES` |
| 0.4170 | `packages/governance/src/runtime-compatibility.ts` | 92 | 154 | `GOVERNANCE_COMPATIBILITY_ADMIN_TTL_MS`, `GOVERNANCE_COMPATIBILITY_MODEL_TTL_MS`, `GovernanceModelCapability` |
| 0.4063 | `packages/requirement-intake/src/service.ts` | 53 | 208 | `RequirementIntakeServiceOptions`, `IntakeCreateResult`, `IntakeSubmitResult` |
| 0.4056 | `packages/core/src/execution/design-verify.ts` | 60 | 67 | `DesignAxis`, `DesignViolation`, `DesignVerifyReport` |
| 0.4025 | `packages/providers/src/index.ts` | 65 | 314 | `CompatiblePreset`, `COMPATIBLE_PRESETS`, `BuildFactoriesOptions` |
| 0.4023 | `packages/providers/src/openai-codex.ts` | 167 | 194 | `DEFAULT_CODEX_BASE`, `isReasoningReplayRejection`, `CODEX_TURN_STATE_HEADER` |
| 0.3930 | `packages/core/src/utils/tool-output-serializer.ts` | 81 | 118 | `ToolOutputSerializerOptions`, `ToolOutputSerializeContext`, `RecordValue` |
| 0.3890 | `packages/core/src/coordination/sqlite-mailbox.ts` | 66 | 205 | `SQLITE_MAILBOX_FILE`, `HEARTBEAT_TRACKING_MAX_ENTRIES`, `HEARTBEAT_TRACKING_TTL_MS` |
| 0.3885 | `packages/kanban/src/types-operations.ts` | 269 | 139 | `CreateKanbanBoardInput`, `UpdateKanbanBoardInput`, `DuplicateKanbanBoardInput` |
| 0.3868 | `packages/acp/src/client/acp-session.ts` | 172 | 186 | `ACPSession`, `transport`, `fileServer` |
| 0.3866 | `packages/plugins/src/accessibility-auditor/index.ts` | 38 | 103 | `API_VERSION`, `A11yRule`, `A11yFinding` |
| 0.3838 | `packages/governance/src/verification-ledger-store.ts` | 18 | 126 | `VerificationRunRow`, `VerificationLeaseRow`, `VerificationLeaseConsumptionRow` |
| 0.3810 | `packages/tools/src/codebase-index/project-server-client.ts` | 34 | 181 | `SPAWN_RETRY_CADENCE_MS`, `ProjectServerConnection`, `socket` |
| 0.3808 | `packages/core/src/execution/prompt-enhancer.ts` | 94 | 129 | `ENHANCER_SYSTEM_PROMPT`, `AFFIRMATION_RE`, `shouldEnhance` |
| 0.3753 | `packages/acp/src/agent/stdio-transport.ts` | 560 | 68 | `DEFAULT_MAX_FRAME_CHARS`, `DEFAULT_MAX_QUEUED_MESSAGES`, `DEFAULT_MAX_QUEUED_CHARS` |
| 0.3741 | `apps/desktop/src/main/runtime-manager.ts` | 185 | 187 | `DesktopStateFile`, `DesktopProjectSessionState`, `RuntimeInternal` |
| 0.3681 | `packages/webui-server/src/server/ws-payload-validation.ts` | 93 | 112 | `ModelSwitchPayload`, `validateModelSwitchPayload`, `ModelFallbackChoicePayload` |
| 0.3656 | `packages/core/src/coordination/subagent-budget.ts` | 192 | 64 | `BudgetKind`, `TIMEOUT_PREEMPT_FRACTION`, `DECISION_TIMEOUT_MS` |
