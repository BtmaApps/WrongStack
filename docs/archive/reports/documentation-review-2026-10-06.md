# Documentation review — 2026-10-06

This is a dated maintenance record. The review read the contents of every file
under `docs/`, classified current guidance versus proposals/history, checked
source-path references and local links, and corrected the behavior mismatches
listed below. Structural coverage is not a claim that every prose statement was
exercised in a running host or checked against upstream services.

Initial files: **460**. Final inventory: **477** files. Relocations: **110**,
including **104** archival relocations. Four replaced guides have preserved before-snapshots.
Source commit observed: `51ffb17fb1c6a11317bc3939c38edbf56f0c4b30`, with concurrent uncommitted source changes.

## Behavior and ownership corrections

| Guide | Source-grounded correction |
|---|---|
| [docs/README.md](../../README.md) | Navigation rebuilt around maintained references and separate historical/proposal directories. |
| [docs/architecture.md](../../architecture.md) | Package/dependency map and escaped code fences corrected against manifests. |
| [docs/agents.md](../../agents.md) | Package/plugin inventory, dependency leaves and package map refreshed. |
| [docs/reference.md](../../reference.md) | Stale 67/68 tool claims replaced with source-derived inventory; new tool families included. |
| [docs/cli-reference.md](../../cli-reference.md) | Removed Director flags and deprecated init behavior corrected. |
| [docs/subcommands/README.md](../../subcommands/README.md) | 42 keys/41 handlers exposed through generated catalog; missing operational commands added. |
| [docs/slash/README.md](../../slash/README.md) | Goals/Jev added; plugin-only specialist triggers removed from built-in table; public import paths corrected. |
| [docs/plans_architecture.md](../../plans_architecture.md) | Current built-in /plan registration, ten tool actions, storage failure and unfinished-work invariants. |
| [docs/todos_architecture.md](../../todos_architecture.md) | Current checkpoint, completed snapshot, state type owner and Kanban projection. |
| [docs/goal-pause-resume-stage-reporting.md](../../goal-pause-resume-stage-reporting.md) | Mission versus phase-run admission, ownership, stopping and verification clarified. |
| [docs/readonly-mode.md](../../readonly-mode.md) | mutating flag plus capability classification reflected; stale test-count claim removed. |
| [docs/telegram-operations-runbook.md](../../telegram-operations-runbook.md) | Default offset persistence and in-memory inbox corrected; nonexistent inbox-file deletion removed. |
| [docs/adr/adr-003-telegram-broker-and-webhook.md](../../adr/adr-003-telegram-broker-and-webhook.md) | Current inbox owner replaces nonexistent durable per-chat cursor. |
| [docs/sage/SYSTEM-REPORT.md](../../sage/SYSTEM-REPORT.md) | Protocol owner and durable vector-memory ownership corrected. |
| [docs/sage/retrieval.md](../../sage/retrieval.md) | Current host-side vector fusion and visibility materialization documented. |
| [docs/release-process.md](../../release-process.md) | Actual 20-gate matrix, coverage execution and profile/certification boundaries. |
| [docs/release.md](../../release.md) | Missing tool/install/catalog gates added; example version made explicit placeholder. |
| [docs/techstack.md](../../techstack.md) | July registry snapshot archived; current manifest/build/runtime owners replace stale dependency recommendations. |
| [docs/current-catalog.md](../../current-catalog.md) | Generated from source declarations; exact package/tool/command/mode/skill/plugin registrations. |
| [docs/feature-matrix.md](../../feature-matrix.md) | 90 official plugin rows verified by existing source/tool-name checker. |
| [docs/architecture/session-catalog.md](../../architecture/session-catalog.md) | Current catalog/lease/presence ownership replaces completed implementation plan. |
| [docs/architecture/project-goals.md](../../architecture/project-goals.md) | Delivered My Goals behavior moved from plans to maintained architecture. |
| [docs/context-editor.md](../../context-editor.md) | Running editor/revision/validation implementation separated from draft module splits. |
| [docs/designs/inspector-slots.md](../../designs/inspector-slots.md) | Missing proposed HQ modules and nonexistent webui-ui package identified as proposal. |
| [docs/designs/language-support-system-design.md](../../designs/language-support-system-design.md) | Delivered language tools separated from full design acceptance. |
| [docs/designs/ai-code-provenance-and-debt-design.md](../../designs/ai-code-provenance-and-debt-design.md) | Delivered correlation backbone separated from later proposed slices. |
| [docs/specs/context-window-editor-sdd.md](../../specs/context-window-editor-sdd.md) | Delivered subset and hypothetical future files explicitly distinguished. |
| [docs/specs/kanban-agent-evolution-sdd.md](../../specs/kanban-agent-evolution-sdd.md) | Original contract/task graph separated from current Kanban source inventory. |
| [docs/architecture-rules.md](../../architecture-rules.md) | Specialized check scope, historical SDD layer and removed defaults facade corrected. |
| [docs/skills.md](../../skills.md) | Shadow fleet source and project skill ownership corrected. |
| [docs/prompt-caching.md](../../prompt-caching.md) | Cache controls separated from unmeasured cache-hit/performance guarantees. |

## Validation and limits

- `pnpm docs:check`: valid local targets/casing/ATX headings, fresh source catalog and 90 official plugin tool mappings.
- Link-checker fixtures: missing path/heading, case and machine URL fail; valid duplicate headings, code angle brackets and literal examples pass.
- Scoped Biome and `git diff --check` were run for this change.
- Architecture evidence was regenerated with `pnpm report:architecture`. Its hotspot/baseline findings are retained; report generation is not a green architecture gate.
- Full release, live provider/service/browser behavior and current upstream specifications were not certified.
- Ignored research stays local. Archived proof scripts retain source-relative imports but are historical evidence, not fresh test runs.

## File-by-file disposition

The [JSON inventory](documentation-review-2026-10-06.json) includes each source reference and whether its path resolves.
Local-only rows are deliberately not linked from this tracked report. Proposal paths can be absent by design.

| Current file | Classification | Action | Review scope |
|---|---|---|
| [docs/README.md](../../README.md) | maintained-reference | refreshed | Navigation rebuilt around maintained references and separate historical/proposal directories. |
| [docs/SKILL-TEMPLATE.md](../../SKILL-TEMPLATE.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/acp-editor-integration.md](../../acp-editor-integration.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/acp-ensemble.md](../../acp-ensemble.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/adr/adr-001-layer-instead-of-split.md](../../adr/adr-001-layer-instead-of-split.md) | versioned-contract | retained | Version/decision context retained; structural source and link review. |
| [docs/adr/adr-002-help-delegation-pattern.md](../../adr/adr-002-help-delegation-pattern.md) | versioned-contract | retained | Version/decision context retained; structural source and link review. |
| [docs/adr/adr-003-telegram-broker-and-webhook.md](../../adr/adr-003-telegram-broker-and-webhook.md) | versioned-contract | refreshed | Current inbox owner replaces nonexistent durable per-chat cursor. |
| [docs/adr/adr-004-step-budgeted-regex-ambiguity-matcher.md](../../adr/adr-004-step-budgeted-regex-ambiguity-matcher.md) | versioned-contract | retained | Version/decision context retained; structural source and link review. |
| [docs/agent-feedback.md](../../agent-feedback.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/agent-monitoring.md](../../agent-monitoring.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| `docs/agents.md` (local only) | maintained-reference | refreshed | Package/plugin inventory, dependency leaves and package map refreshed. |
| [docs/antigravity-provider.md](../../antigravity-provider.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/architecture-rules.md](../../architecture-rules.md) | maintained-reference | refreshed | Specialized check scope, historical SDD layer and removed defaults facade corrected. |
| [docs/architecture.md](../../architecture.md) | maintained-reference | refreshed | Package/dependency map and escaped code fences corrected against manifests. |
| [docs/architecture/explore-companion-subagent.md](../../architecture/explore-companion-subagent.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/architecture/harness-adoption.md](../../architecture/harness-adoption.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/architecture/project-goals.md](../../architecture/project-goals.md) | maintained-reference | relocated | Delivered My Goals behavior moved from plans to maintained architecture. |
| [docs/architecture/session-catalog.md](../../architecture/session-catalog.md) | maintained-reference | refreshed | Current catalog/lease/presence ownership replaces completed implementation plan. |
| [docs/architecture/session-journal-spec.md](../../architecture/session-journal-spec.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/architecture/session-journal.md](../../architecture/session-journal.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/architecture/simpleui-message-lifecycle.md](../../architecture/simpleui-message-lifecycle.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/archive/README.md](../README.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/architecture/architecture-reference-2026-06-09.md](../architecture/architecture-reference-2026-06-09.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/architecture/architecture-report-2026-07-28.md](../architecture/architecture-report-2026-07-28.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/architecture/architecture-root-2026-07-15.md](../architecture/architecture-root-2026-07-15.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/architecture/plans-2026-05-20.md](../architecture/plans-2026-05-20.md) | historical | preserved-before-rewrite | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/architecture/todos-2026-06-06.md](../architecture/todos-2026-06-06.md) | historical | preserved-before-rewrite | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/architecture/wrongstack-architecture-analysis.md](../architecture/wrongstack-architecture-analysis.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/2026-08/00-executive-summary.md](../audits/2026-08/00-executive-summary.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/2026-08/01-core-kernel.md](../audits/2026-08/01-core-kernel.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/2026-08/02-security.md](../audits/2026-08/02-security.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/2026-08/03-execution-pipeline.md](../audits/2026-08/03-execution-pipeline.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/2026-08/04-storage-sessions.md](../audits/2026-08/04-storage-sessions.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/2026-08/05-mcp-protocol.md](../audits/2026-08/05-mcp-protocol.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/2026-08/06-sage-memory.md](../audits/2026-08/06-sage-memory.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/2026-08/07-webui-server.md](../audits/2026-08/07-webui-server.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/2026-08/08-tools-plugins.md](../audits/2026-08/08-tools-plugins.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/2026-08/09-build-ci.md](../audits/2026-08/09-build-ci.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/2026-08/10-kanban-governance.md](../audits/2026-08/10-kanban-governance.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/2026-08/11-system-audit-follow-up-2026-08-13.md](../audits/2026-08/11-system-audit-follow-up-2026-08-13.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/2026-08/README.md](../audits/2026-08/README.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/auth-flow-audit-2026-09-17.md](../audits/auth-flow-audit-2026-09-17.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/auth-screens-review.md](../audits/auth-screens-review.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/brain-council-review-2026-09-19.md](../audits/brain-council-review-2026-09-19.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/kanban-architecture-audit-2026-07.md](../audits/kanban-architecture-audit-2026-07.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/kanban-system-architecture-2026-10-02.md](../audits/kanban-system-architecture-2026-10-02.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/kanban-system-repair-2026-10-02.md](../audits/kanban-system-repair-2026-10-02.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/kanban-todos-architecture-2026-09-16.md](../audits/kanban-todos-architecture-2026-09-16.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/kanban-todos-review-2026-09-15.md](../audits/kanban-todos-review-2026-09-15.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/openai-codex-cache-audit-2026-09-26.md](../audits/openai-codex-cache-audit-2026-09-26.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/plugin-audit-2026-09-22.md](../audits/plugin-audit-2026-09-22.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/plugin-llm-council-audit.md](../audits/plugin-llm-council-audit.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/pr-before-release-audit.md](../audits/pr-before-release-audit.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/skill-system-audit-2026-09-18.md](../audits/skill-system-audit-2026-09-18.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/sprint2-audit-final-report.md](../audits/sprint2-audit-final-report.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/sprint3-audit-final-report.md](../audits/sprint3-audit-final-report.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/topic-audits/fleet-store-selector-audit.md](../audits/topic-audits/fleet-store-selector-audit.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/typesafe-integration-audit-2026-09-18.md](../audits/typesafe-integration-audit-2026-09-18.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/audits/webui-scroll-audit-2026-08.md](../audits/webui-scroll-audit-2026-08.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/designs/design-side-effect-recording.md](../designs/design-side-effect-recording.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/designs/goal-pause-resume-2026-05-24.md](../designs/goal-pause-resume-2026-05-24.md) | historical | preserved-before-rewrite | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/designs/kanban-cost-director-integration-design.md](../designs/kanban-cost-director-integration-design.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/designs/kanban-deterministic-enforcement-design.md](../designs/kanban-deterministic-enforcement-design.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/designs/token-saving-tiers-design.md](../designs/token-saving-tiers-design.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/handoffs/ai-sdk-next.md](../handoffs/ai-sdk-next.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/handoffs/outbound/zai-coding-plan-approval-request.md](../handoffs/outbound/zai-coding-plan-approval-request.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/handoffs/worklog.md](../handoffs/worklog.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| `docs/archive/local/audit/brain-agent-review-2026-10-02.md` (local only) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| `docs/archive/local/audit/webui-full-review-2026-09-03.md` (local only) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| `docs/archive/local/openhands-implementation-2026-10-03.md` (local only) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| `docs/archive/local/plugin-audit-2026-07-10.md` (local only) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| `docs/archive/local/reports/agent-learning-rl-analysis.md` (local only) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| `docs/archive/local/reports/hq-fleet-lifecycle-e2e-2026-10-04.md` (local only) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| `docs/archive/local/reports/module-reality-audit-2026-09-09.md` (local only) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| `docs/archive/local/reports/openhands-next-opportunities-2026-10-03.md` (local only) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| `docs/archive/local/reports/openhands-opportunities-2026-10-02.md` (local only) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| `docs/archive/local/reports/prompt-cache-architecture-review-2026-08-13.md` (local only) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| `docs/archive/local/reports/tool-inventory-necessity-2026-09-10.md` (local only) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| `docs/archive/local/reports/webui-improvement-readiness-2026-09-15.md` (local only) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/notes/EDITING.md](../notes/EDITING.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/notes/bugs.md](../notes/bugs.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/notes/refactor-2026-06-05.md](../notes/refactor-2026-06-05.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/notes/refactor.md](../notes/refactor.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/architecture-refactor-2026-08.md](../plans/architecture-refactor-2026-08.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/architecture-refactor-plan.md](../plans/architecture-refactor-plan.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/architecture-refactor-task-graph-2026-07.md](../plans/architecture-refactor-task-graph-2026-07.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/codebase-index-refactor.md](../plans/codebase-index-refactor.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/goal-architecture-2026-09-22.md](../plans/goal-architecture-2026-09-22.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/hq-command-center-2026-06.md](../plans/hq-command-center-2026-06.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/hq-command-center-2026-07.md](../plans/hq-command-center-2026-07.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/hq-evolution-2026-08.md](../plans/hq-evolution-2026-08.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/hq-ws-reconnection.md](../plans/hq-ws-reconnection.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/maintainability-refactor-2026-07/00-audit-baseline.md](../plans/maintainability-refactor-2026-07/00-audit-baseline.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/maintainability-refactor-2026-07/01-target-architecture.md](../plans/maintainability-refactor-2026-07/01-target-architecture.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/maintainability-refactor-2026-07/02-execution-roadmap.md](../plans/maintainability-refactor-2026-07/02-execution-roadmap.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/maintainability-refactor-2026-07/03-core-runtime-memory.md](../plans/maintainability-refactor-2026-07/03-core-runtime-memory.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/maintainability-refactor-2026-07/04-surfaces-and-hosts.md](../plans/maintainability-refactor-2026-07/04-surfaces-and-hosts.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/maintainability-refactor-2026-07/05-platform-and-extensions.md](../plans/maintainability-refactor-2026-07/05-platform-and-extensions.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/maintainability-refactor-2026-07/06-verification-governance.md](../plans/maintainability-refactor-2026-07/06-verification-governance.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/maintainability-refactor-2026-07/07-task-crosswalk.md](../plans/maintainability-refactor-2026-07/07-task-crosswalk.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/maintainability-refactor-2026-07/08-test-type-debt-burndown.md](../plans/maintainability-refactor-2026-07/08-test-type-debt-burndown.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/maintainability-refactor-2026-07/09-runtime-pilot-decision.md](../plans/maintainability-refactor-2026-07/09-runtime-pilot-decision.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/maintainability-refactor-2026-07/10-completion-report.md](../plans/maintainability-refactor-2026-07/10-completion-report.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/maintainability-refactor-2026-07/README.md](../plans/maintainability-refactor-2026-07/README.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/phased-development-plan-2026-07.md](../plans/phased-development-plan-2026-07.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/refactor.md](../plans/refactor.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/roadmap-2026-07-refactoring.md](../plans/roadmap-2026-07-refactoring.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/sage-architecture-2026-07-11.md](../plans/sage-architecture-2026-07-11.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/sage-phase4-design.md](../plans/sage-phase4-design.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/security-hardening-2026-06.md](../plans/security-hardening-2026-06.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/session-catalog-project-service-2026-08.md](../plans/session-catalog-project-service-2026-08.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/plans/techstack-refactor-plan.md](../plans/techstack-refactor-plan.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/readmes/README-pre-0.298.2.md](../readmes/README-pre-0.298.2.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/releases/release-v0.293.0-checklist.md](../releases/release-v0.293.0-checklist.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/codebase-analysis-2026-06-07.md](codebase-analysis-2026-06-07.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/codebase-tools-e2e-followup.json](codebase-tools-e2e-followup.json) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/codebase-tools-e2e-proof-followup.ts](codebase-tools-e2e-proof-followup.ts) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/codebase-tools-e2e-proof.json](codebase-tools-e2e-proof.json) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/codebase-tools-e2e-proof.ts](codebase-tools-e2e-proof.ts) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/coverage-matrix-2026-08-29.md](coverage-matrix-2026-08-29.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/coverage-report-2026-07-17.md](coverage-report-2026-07-17.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/dated-reports/ram-leak-audit-2026-07-31.md](dated-reports/ram-leak-audit-2026-07-31.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| `docs/archive/reports/dated-reports/system-audit-2026-07-20.md` (local only) | historical | new-or-local | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/dated-reports/test-coverage-2026-07-25.md](dated-reports/test-coverage-2026-07-25.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/dated-reports/test-coverage-gaps-2026-07-24.md](dated-reports/test-coverage-gaps-2026-07-24.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/dated-reports/wrongstack-report-2026-07-12.md](dated-reports/wrongstack-report-2026-07-12.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/dated-reports/wrongstack-report-2026-07-13.md](dated-reports/wrongstack-report-2026-07-13.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/documentation-review-2026-10-06.json](documentation-review-2026-10-06.json) | historical | new-or-local | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/documentation-review-2026-10-06.md](documentation-review-2026-10-06.md) | historical | new-or-local | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/modularity-assessment-2026-08-22.md](modularity-assessment-2026-08-22.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/research/sage-memory-investigation.md](research/sage-memory-investigation.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/sage-memory-analysis-2026-08-08.md](sage-memory-analysis-2026-08-08.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/sage-memory-report-2026-08-02.md](sage-memory-report-2026-08-02.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/session-logging-report.md](session-logging-report.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/techstack-2026-07-15.md](techstack-2026-07-15.md) | historical | preserved-before-rewrite | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/telegram-v1-handoff-assessment-2026-08.md](telegram-v1-handoff-assessment-2026-08.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/tui-feature-inventory-2026-08.md](tui-feature-inventory-2026-08.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/tui-feature-inventory.md](tui-feature-inventory.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/vibe-protocol-architecture-2026-08-15.md](vibe-protocol-architecture-2026-08-15.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/vibe-protocol-code-proof.json](vibe-protocol-code-proof.json) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/working-tree-report-2026-07-11.md](working-tree-report-2026-07-11.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/reports/zero-report.md](zero-report.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/sage/ARCHITECTURE.md](../sage/ARCHITECTURE.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/sage/MEMORY-PIPELINE-2026-09-03.md](../sage/MEMORY-PIPELINE-2026-09-03.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/sage/REFACTOR-REPORT.md](../sage/REFACTOR-REPORT.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/specs/chimera-finding-store-sdd.md](../specs/chimera-finding-store-sdd.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/specs/chimera-finding-store.task-graph.json](../specs/chimera-finding-store.task-graph.json) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/specs/fs-p0-gate-report.md](../specs/fs-p0-gate-report.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/specs/global-mailbox-p0-contract-repairs.md](../specs/global-mailbox-p0-contract-repairs.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/specs/global-mailbox-p0-contract-repairs.task-graph.json](../specs/global-mailbox-p0-contract-repairs.task-graph.json) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/specs/gm-p0-gate-report.md](../specs/gm-p0-gate-report.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/specs/techstack-sdd.md](../specs/techstack-sdd.md) | historical | relocated | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/backlog/2026-07-architecture-review/001-tui-app-split.md](../work-items/backlog/2026-07-architecture-review/001-tui-app-split.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/backlog/2026-07-architecture-review/002-tui-app-reducer-split.md](../work-items/backlog/2026-07-architecture-review/002-tui-app-reducer-split.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/backlog/2026-07-architecture-review/003-cli-main-decomposition.md](../work-items/backlog/2026-07-architecture-review/003-cli-main-decomposition.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/backlog/2026-07-architecture-review/004-director-responsibility-split.md](../work-items/backlog/2026-07-architecture-review/004-director-responsibility-split.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/backlog/2026-07-architecture-review/005-tui-integration-coverage.md](../work-items/backlog/2026-07-architecture-review/005-tui-integration-coverage.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/backlog/2026-07-architecture-review/006-cli-boot-dispatch-tests.md](../work-items/backlog/2026-07-architecture-review/006-cli-boot-dispatch-tests.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/backlog/2026-07-architecture-review/007-hotspot-guardrails-ratcheting.md](../work-items/backlog/2026-07-architecture-review/007-hotspot-guardrails-ratcheting.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/backlog/2026-07-architecture-review/008-refresh-hotspot-docs.md](../work-items/backlog/2026-07-architecture-review/008-refresh-hotspot-docs.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/backlog/2026-07-architecture-review/009-extract-cli-services-from-slash-commands.md](../work-items/backlog/2026-07-architecture-review/009-extract-cli-services-from-slash-commands.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/backlog/2026-07-architecture-review/010-runtime-real-boundary.md](../work-items/backlog/2026-07-architecture-review/010-runtime-real-boundary.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/backlog/2026-07-architecture-review/011-reduce-core-export-sprawl.md](../work-items/backlog/2026-07-architecture-review/011-reduce-core-export-sprawl.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/backlog/2026-07-architecture-review/012-architecture-health-reporting.md](../work-items/backlog/2026-07-architecture-review/012-architecture-health-reporting.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/backlog/2026-07-architecture-review/013-multi-agent-e2e-tests.md](../work-items/backlog/2026-07-architecture-review/013-multi-agent-e2e-tests.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/backlog/2026-07-architecture-review/014-hotspot-drift-detection.md](../work-items/backlog/2026-07-architecture-review/014-hotspot-drift-detection.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/backlog/2026-07-architecture-review/015-unify-shared-app-services.md](../work-items/backlog/2026-07-architecture-review/015-unify-shared-app-services.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/backlog/2026-07-architecture-review/016-temporary-architecture-exceptions-policy.md](../work-items/backlog/2026-07-architecture-review/016-temporary-architecture-exceptions-policy.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/backlog/2026-07-architecture-review/017-package-boundary-visualization.md](../work-items/backlog/2026-07-architecture-review/017-package-boundary-visualization.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/backlog/2026-07-architecture-review/018-modularity-audit-and-plan.md](../work-items/backlog/2026-07-architecture-review/018-modularity-audit-and-plan.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/backlog/2026-07-architecture-review/019-pr-00-clean-baseline.md](../work-items/backlog/2026-07-architecture-review/019-pr-00-clean-baseline.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/backlog/2026-07-architecture-review/README.md](../work-items/backlog/2026-07-architecture-review/README.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/issues/2026-06-13-cli-main-refactor.md](../work-items/issues/2026-06-13-cli-main-refactor.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/issues/2026-06-13-tui-app-refactor-tasks.md](../work-items/issues/2026-06-13-tui-app-refactor-tasks.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/issues/2026-06-13-tui-app-refactor-update.md](../work-items/issues/2026-06-13-tui-app-refactor-update.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/issues/2026-06-13-tui-app-refactor.md](../work-items/issues/2026-06-13-tui-app-refactor.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/issues/2026-06-13-webui-package-server-refactor.md](../work-items/issues/2026-06-13-webui-package-server-refactor.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/issues/2026-06-13-webui-server-refactor.md](../work-items/issues/2026-06-13-webui-server-refactor.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/issues/2026-06-18-worklist-result-format.md](../work-items/issues/2026-06-18-worklist-result-format.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/issues/2026-06-20-webui-improvement-tasks.md](../work-items/issues/2026-06-20-webui-improvement-tasks.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/issues/2026-07-15-webui-scroll-audit.md](../work-items/issues/2026-07-15-webui-scroll-audit.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/issues/2026-09-11-tools-wasm-dist-packaging-gap.md](../work-items/issues/2026-09-11-tools-wasm-dist-packaging-gap.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/archive/work-items/refactor-next.md](../work-items/refactor-next.md) | historical | retained | Historical claims preserved; current runtime parity is not asserted. |
| [docs/ascii.md](../../ascii.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/audit/README.md](../../audit/README.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/audit/ledger.md](../../audit/ledger.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/auto-thinning.md](../../auto-thinning.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/autonomous-coordinator.md](../../autonomous-coordinator.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/browser-automation.md](../../browser-automation.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/changelog/v0.298.0.md](../../changelog/v0.298.0.md) | versioned-contract | retained | Version/decision context retained; structural source and link review. |
| [docs/chatgpt-model-catalog.md](../../chatgpt-model-catalog.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/chronicle-architecture.md](../../chronicle-architecture.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/cli-reference.md](../../cli-reference.md) | maintained-reference | refreshed | Removed Director flags and deprecated init behavior corrected. |
| [docs/cli/launch-menu.md](../../cli/launch-menu.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/codebase-index-calls.md](../../codebase-index-calls.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/collab-debug.md](../../collab-debug.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| `docs/competitive-roadmap-2026-2027/00-gap-assessment.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/01-operational-slash-commands.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/02-first-party-browser-automation.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/03-browser-aware-e2e-runner.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/04-database-tooling.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/05-api-contract-testing.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/06-multimodal-media-workflows.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/07-deployment-cloud-iac-workflows.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/08-mcp-resources-and-prompts.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/09-mcp-authentication-and-sampling.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/10-mcp-rich-content.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/11-mcp-registry-and-installation.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/12-mcp-health-and-operations.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/13-semantic-sage-retrieval.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/14-cross-session-continuity-and-project-state.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/15-desktop-distribution.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/16-hq-hardening-and-operations.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/17-responsive-webui.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/18-rich-tui-rendering.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/19-policy-authoring-experience.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/20-enterprise-governance.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/21-brain-evaluation-and-replay.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/22-quality-engineering-program.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/23-public-benchmark-transparency.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/24-skill-and-prompt-ecosystem.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/25-distributed-fleet.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/26-live-cross-surface-collaboration.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/27-autonomous-issue-to-pr-pipeline.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/28-sandboxed-execution-tiers.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/29-ai-approval-delegation.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/30-plan-versioning-and-autonomy-matrix.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/31-watch-files-comment-triggers.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/32-within-turn-model-roles-and-edit-formats.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/33-diagnostics-aware-write-gate.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/34-timeout-auto-answer.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/35-first-party-web-search.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/36-shareable-session-replay.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/37-scheduled-agent-sessions.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/38-model-judged-command-risk.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/39-chat-platform-connectors.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/40-tool-boundary-token-compression.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/competitive-roadmap-2026-2027/README.md` (local only) | local-strategy | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/configuration.md](../../configuration.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/context-editor.md](../../context-editor.md) | maintained-reference | refreshed | Running editor/revision/validation implementation separated from draft module splits. |
| [docs/current-catalog.md](../../current-catalog.md) | maintained-reference | refreshed | Generated from source declarations; exact package/tool/command/mode/skill/plugin registrations. |
| [docs/design-quality-workflow.md](../../design-quality-workflow.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/designs/README.md](../../designs/README.md) | design | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/designs/ai-code-provenance-and-debt-design.md](../../designs/ai-code-provenance-and-debt-design.md) | design | relocated | Delivered correlation backbone separated from later proposed slices. |
| [docs/designs/design-provider-health-gate.md](../../designs/design-provider-health-gate.md) | design | relocated | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/designs/inspector-slots.md](../../designs/inspector-slots.md) | design | relocated | Missing proposed HQ modules and nonexistent webui-ui package identified as proposal. |
| [docs/designs/language-support-system-design.md](../../designs/language-support-system-design.md) | design | relocated | Delivered language tools separated from full design acceptance. |
| [docs/desktop-distribution.md](../../desktop-distribution.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/director-architecture.md](../../director-architecture.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/e2e-runner.md](../../e2e-runner.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/feature-matrix.md](../../feature-matrix.md) | maintained-reference | refreshed | 90 official plugin rows verified by existing source/tool-name checker. |
| [docs/fleet-dispatch-classifier.md](../../fleet-dispatch-classifier.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/goal-pause-resume-stage-reporting.md](../../goal-pause-resume-stage-reporting.md) | maintained-reference | refreshed | Mission versus phase-run admission, ownership, stopping and verification clarified. |
| [docs/help-modules.md](../../help-modules.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/hooks.md](../../hooks.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/hq-service.md](../../hq-service.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/hq.md](../../hq.md) | maintained-reference | new-or-local | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/instructions.md](../../instructions.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/jev-settings-and-activity.md](../../jev-settings-and-activity.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/kanban-architecture.md](../../kanban-architecture.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/kanban-contract-graph.md](../../kanban-contract-graph.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| `docs/kanban-database.md` (local only) | maintained-reference | new-or-local | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/kanban-orchestration-contract.md](../../kanban-orchestration-contract.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/kanban-task-management.md](../../kanban-task-management.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/kanban-workbench.md](../../kanban-workbench.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/mailbox-architecture.md](../../mailbox-architecture.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/maintenance.md](../../maintenance.md) | maintained-reference | new-or-local | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/mcp-protocol-conformance.md](../../mcp-protocol-conformance.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/mcp-server.md](../../mcp-server.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/migration/v0.293.0.md](../../migration/v0.293.0.md) | versioned-contract | retained | Version/decision context retained; structural source and link review. |
| [docs/migration/v0.296.0-architecture-boundaries.md](../../migration/v0.296.0-architecture-boundaries.md) | versioned-contract | retained | Version/decision context retained; structural source and link review. |
| [docs/notes/next.md](../../notes/next.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/oauth-signin.md](../../oauth-signin.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/one-shot-llm.md](../../one-shot-llm.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/performance-ratchet.md](../../performance-ratchet.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/plans/README.md](../../plans/README.md) | plan | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/plans/adr-003-authority-first-refactor-program.md](../../plans/adr-003-authority-first-refactor-program.md) | plan | retained | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/plans/adr-004-core-runtime-export-and-config-ownership.md](../../plans/adr-004-core-runtime-export-and-config-ownership.md) | plan | retained | Proposal/status and source-path review; future task paths are not runtime evidence. |
| `docs/plans/breaking-changes-next-major.md` (local only) | plan | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/plans/cli-main-executiondeps-refactor.md](../../plans/cli-main-executiondeps-refactor.md) | plan | retained | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/plans/codebase-index-refactor.md](../../plans/codebase-index-refactor.md) | plan | retained | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/plans/eternal-autonomy-fake-timer-refactor.md](../../plans/eternal-autonomy-fake-timer-refactor.md) | plan | retained | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/plans/hq-improvements-2026-09.md](../../plans/hq-improvements-2026-09.md) | plan | retained | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/plans/kanban-orchestration-roadmap.md](../../plans/kanban-orchestration-roadmap.md) | plan | relocated | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/plans/packages-system-improvement-2026-09.md](../../plans/packages-system-improvement-2026-09.md) | plan | retained | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/plans/security-scanner-refactor-plan.md](../../plans/security-scanner-refactor-plan.md) | plan | retained | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/plans/test-coverage-100-2026-08.md](../../plans/test-coverage-100-2026-08.md) | plan | retained | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/plans/unified-sage-search-backend-contract.md](../../plans/unified-sage-search-backend-contract.md) | plan | retained | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/plans/webui-operator-workbench-2026-07.md](../../plans/webui-operator-workbench-2026-07.md) | plan | retained | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/plans_architecture.md](../../plans_architecture.md) | maintained-reference | refreshed | Current built-in /plan registration, ten tool actions, storage failure and unfinished-work invariants. |
| [docs/plugin-author-guide.md](../../plugin-author-guide.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/plugin-management.md](../../plugin-management.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/plugin-third-party.md](../../plugin-third-party.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/plugin-value-cost.md](../../plugin-value-cost.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/present-artifact.md](../../present-artifact.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/project-daemons.md](../../project-daemons.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/project-kit.md](../../project-kit.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/prompt-caching.md](../../prompt-caching.md) | maintained-reference | refreshed | Cache controls separated from unmeasured cache-hit/performance guarantees. |
| [docs/proof-driven-bug-hunter.md](../../proof-driven-bug-hunter.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/provider-author-guide.md](../../provider-author-guide.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/provider-continuity.md](../../provider-continuity.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/readonly-mode.md](../../readonly-mode.md) | maintained-reference | refreshed | mutating flag plus capability classification reflected; stale test-count claim removed. |
| [docs/reference.md](../../reference.md) | maintained-reference | refreshed | Stale 67/68 tool claims replaced with source-derived inventory; new tool families included. |
| [docs/release-process.md](../../release-process.md) | maintained-reference | refreshed | Actual 20-gate matrix, coverage execution and profile/certification boundaries. |
| [docs/release.md](../../release.md) | maintained-reference | refreshed | Missing tool/install/catalog gates added; example version made explicit placeholder. |
| [docs/reports/architecture-health-current.json](../../reports/architecture-health-current.json) | generated-evidence | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/reports/architecture-health-current.md](../../reports/architecture-health-current.md) | generated-evidence | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| `docs/reports/hq-ux-review-2026-10-06.md` (local only) | maintained-reference | new-or-local | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/sage-feedback-lifecycle.md](../../sage-feedback-lifecycle.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/sage/SYSTEM-REPORT.md](../../sage/SYSTEM-REPORT.md) | maintained-reference | refreshed | Protocol owner and durable vector-memory ownership corrected. |
| [docs/sage/retrieval.md](../../sage/retrieval.md) | maintained-reference | refreshed | Current host-side vector fusion and visibility materialization documented. |
| [docs/session-logging-events.md](../../session-logging-events.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/session-story.md](../../session-story.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/skills-suggestion.md](../../skills-suggestion.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/skills.md](../../skills.md) | maintained-reference | refreshed | Shadow fleet source and project skill ownership corrected. |
| [docs/slash/README.md](../../slash/README.md) | maintained-reference | refreshed | Goals/Jev added; plugin-only specialist triggers removed from built-in table; public import paths corrected. |
| [docs/slash/acp.md](../../slash/acp.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/agent-improve.md](../../slash/agent-improve.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/app-surfaces.md](../../slash/app-surfaces.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/audit.md](../../slash/audit.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/auth.md](../../slash/auth.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/auto-review.md](../../slash/auto-review.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/autonomy.md](../../slash/autonomy.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/brain.md](../../slash/brain.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/btw.md](../../slash/btw.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/chimera.md](../../slash/chimera.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/clear.md](../../slash/clear.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/codebase-map.md](../../slash/codebase-map.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/codebase-reindex.md](../../slash/codebase-reindex.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/collab.md](../../slash/collab.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/compact.md](../../slash/compact.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/context.md](../../slash/context.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/coordinator.md](../../slash/coordinator.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/delegate.md](../../slash/delegate.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/design.md](../../slash/design.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/dev.md](../../slash/dev.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/diag-stats.md](../../slash/diag-stats.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/doctor.md](../../slash/doctor.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/enhance.md](../../slash/enhance.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/ensemble.md](../../slash/ensemble.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/f-keys.md](../../slash/f-keys.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/fallback.md](../../slash/fallback.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/fix.md](../../slash/fix.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/fleet.md](../../slash/fleet.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/git.md](../../slash/git.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/gitid.md](../../slash/gitid.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/goal-state.md](../../slash/goal-state.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/goal.md](../../slash/goal.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/health.md](../../slash/health.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/help.md](../../slash/help.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/hq.md](../../slash/hq.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/init.md](../../slash/init.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/intake.md](../../slash/intake.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/interrupt.md](../../slash/interrupt.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/kanban.md](../../slash/kanban.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/lite-full.md](../../slash/lite-full.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/lsp.md](../../slash/lsp.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/mailbox-demo.md](../../slash/mailbox-demo.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/mailbox-serve.md](../../slash/mailbox-serve.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/mailbox.md](../../slash/mailbox.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/mcp.md](../../slash/mcp.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/memory.md](../../slash/memory.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/metrics.md](../../slash/metrics.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/mode.md](../../slash/mode.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/model.md](../../slash/model.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/modelcaps.md](../../slash/modelcaps.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/models.md](../../slash/models.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/mouse.md](../../slash/mouse.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/next.md](../../slash/next.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/nextsteps.md](../../slash/nextsteps.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/openai-quota.md](../../slash/openai-quota.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/plan.md](../../slash/plan.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/plugin.md](../../slash/plugin.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/process-control.md](../../slash/process-control.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/project.md](../../slash/project.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/prompt-gen.md](../../slash/prompt-gen.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/prompt.md](../../slash/prompt.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/prompts.md](../../slash/prompts.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/provider-quota.md](../../slash/provider-quota.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/provider-status.md](../../slash/provider-status.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/prune.md](../../slash/prune.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/queue.md](../../slash/queue.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/refiner.md](../../slash/refiner.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/review.md](../../slash/review.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/rewind.md](../../slash/rewind.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/sandbox.md](../../slash/sandbox.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/scout-stats.md](../../slash/scout-stats.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/sdd.md](../../slash/sdd.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/security.md](../../slash/security.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/semver.md](../../slash/semver.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/session.md](../../slash/session.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/setmodel.md](../../slash/setmodel.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/settings-get.md](../../slash/settings-get.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/settings.md](../../slash/settings.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/shadow.md](../../slash/shadow.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/skill-search.md](../../slash/skill-search.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/skills.md](../../slash/skills.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/spawn-agents.md](../../slash/spawn-agents.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/specialist-triggers.md](../../slash/specialist-triggers.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/statusline.md](../../slash/statusline.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/steer.md](../../slash/steer.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/subagent-models.md](../../slash/subagent-models.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/suggest.md](../../slash/suggest.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/supervisor.md](../../slash/supervisor.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/sync.md](../../slash/sync.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/tasks.md](../../slash/tasks.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/techstack.md](../../slash/techstack.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/telegram-settings.md](../../slash/telegram-settings.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/telegram-setup.md](../../slash/telegram-setup.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/telegram.md](../../slash/telegram.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/todos.md](../../slash/todos.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/tool.md](../../slash/tool.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/tools.md](../../slash/tools.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/tuneup.md](../../slash/tuneup.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/working-dir.md](../../slash/working-dir.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/worktree.md](../../slash/worktree.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/yolo.md](../../slash/yolo.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/slash/zai-plan.md](../../slash/zai-plan.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/specs/README.md](../../specs/README.md) | specification | new-or-local | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/specs/ai-approval-delegation-sdd.md](../../specs/ai-approval-delegation-sdd.md) | specification | retained | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/specs/ai-approval-delegation.task-graph.json](../../specs/ai-approval-delegation.task-graph.json) | specification | retained | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/specs/chronicle-sqlite-journal.md](../../specs/chronicle-sqlite-journal.md) | specification | retained | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/specs/context-window-editor-sdd.md](../../specs/context-window-editor-sdd.md) | specification | refreshed | Delivered subset and hypothetical future files explicitly distinguished. |
| [docs/specs/first-party-web-search-sdd.md](../../specs/first-party-web-search-sdd.md) | specification | retained | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/specs/first-party-web-search.task-graph.json](../../specs/first-party-web-search.task-graph.json) | specification | retained | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/specs/kanban-agent-evolution-sdd.md](../../specs/kanban-agent-evolution-sdd.md) | specification | refreshed | Original contract/task graph separated from current Kanban source inventory. |
| [docs/specs/kanban-agent-evolution.task-graph.json](../../specs/kanban-agent-evolution.task-graph.json) | specification | retained | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/specs/required-skill-task-lifetime.md](../../specs/required-skill-task-lifetime.md) | specification | retained | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/specs/requirement-intake-sdd.md](../../specs/requirement-intake-sdd.md) | specification | retained | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/specs/sandboxed-execution-tiers-sdd.md](../../specs/sandboxed-execution-tiers-sdd.md) | specification | retained | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/specs/sandboxed-execution-tiers.task-graph.json](../../specs/sandboxed-execution-tiers.task-graph.json) | specification | retained | Proposal/status and source-path review; future task paths are not runtime evidence. |
| [docs/subcommands/README.md](../../subcommands/README.md) | maintained-reference | refreshed | 42 keys/41 handlers exposed through generated catalog; missing operational commands added. |
| [docs/subcommands/acp.md](../../subcommands/acp.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/audit.md](../../subcommands/audit.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/auth.md](../../subcommands/auth.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/automation.md](../../subcommands/automation.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/bench-experiments.md](../../subcommands/bench-experiments.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/bench.md](../../subcommands/bench.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/diag-doctor.md](../../subcommands/diag-doctor.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/export.md](../../subcommands/export.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/hq.md](../../subcommands/hq.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/import-claude-code.md](../../subcommands/import-claude-code.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/init.md](../../subcommands/init.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/mailbox.md](../../subcommands/mailbox.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/mcp.md](../../subcommands/mcp.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/modeldiag.md](../../subcommands/modeldiag.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/plugin.md](../../subcommands/plugin.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/project.md](../../subcommands/project.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/projects.md](../../subcommands/projects.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/provider-cloud.md](../../subcommands/provider-cloud.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/provider-preflight.md](../../subcommands/provider-preflight.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/providers-models.md](../../subcommands/providers-models.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/quick.md](../../subcommands/quick.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/replay.md](../../subcommands/replay.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/rewind.md](../../subcommands/rewind.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/runtime-operations.md](../../subcommands/runtime-operations.md) | maintained-reference | new-or-local | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/sandbox.md](../../subcommands/sandbox.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/sessions-config.md](../../subcommands/sessions-config.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/tools-skills.md](../../subcommands/tools-skills.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/update.md](../../subcommands/update.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/usage.md](../../subcommands/usage.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/subcommands/version-help.md](../../subcommands/version-help.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/techstack.md](../../techstack.md) | maintained-reference | refreshed | July registry snapshot archived; current manifest/build/runtime owners replace stale dependency recommendations. |
| [docs/telegram-operations-runbook.md](../../telegram-operations-runbook.md) | maintained-reference | refreshed | Default offset persistence and in-memory inbox corrected; nonexistent inbox-file deletion removed. |
| [docs/todos_architecture.md](../../todos_architecture.md) | maintained-reference | refreshed | Current checkpoint, completed snapshot, state type owner and Kanban projection. |
| [docs/tool-author-guide.md](../../tool-author-guide.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/tool-coach.md](../../tool-coach.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/toolflow.md](../../toolflow.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/troubleshooting.md](../../troubleshooting.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/tui-ink.md](../../tui-ink.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/tui-keyboard-reference.md](../../tui-keyboard-reference.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| `docs/tui-themes.md` (local only) | maintained-reference | new-or-local | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/typesafe-account.md](../../typesafe-account.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/typescript-style-guide.md](../../typescript-style-guide.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/webui.md](../../webui.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/wrongtrace.md](../../wrongtrace.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
| [docs/yolo-mode.md](../../yolo-mode.md) | maintained-reference | retained | Content, source-path references and local links inspected; no exhaustive runtime-behavior certification. |
