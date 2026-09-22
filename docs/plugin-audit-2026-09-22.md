# Plugin review — 2026-09-22

## Scope and evidence

The current manifest contains **90 official package plugins** and the host catalog contains **9 host plugins**. Every official plugin participates individually in the catalog/default-schema and reload/teardown matrices. This is contract and behavior evidence, not a claim that every line of every plugin was manually reviewed or every external integration was exercised live.

Source-level fixes focus on shared evidence/workflow runtimes and the individual entries below. Existing concurrent edits (including path-guard) were preserved. No commit or push was performed.

## Verification

- Initial package suite: 115 files, 2680 passed, 2 skipped.
- New caller-project and cancellation cases: 20 failed before the fix, all passed afterward.
- Default/schema matrix: 12 failures before correction.
- Additional red/green cases cover JSON key order, missing trace layers, workbench extension cleanup, cancelled workflow results and false CI/install failures.
- Full package suite after fixes: 115 files, 2829 passed, 2 skipped. This includes concurrent path-guard regression additions; the test-count delta is not solely this task's work.
- Plugin production typecheck and manifest build/projection check passed.
- Repository test-type baseline gate: **0 new diagnostics**. Final focused recheck after test cleanup: 169 passed across catalog, evidence-analyzer and workflow suites.
- Host-focused run: 616/618 passed initially. LSP's obsolete list command assertion was corrected to lsp-list (2/2 then passed). The auto-review quiet-window test awaited real Git subprocess work beyond its original one-second polling timeout; added bounded wait and unconditional cleanup, then 37/37 passed in isolation.
- Performance workload and before/after measurements: [PERF_LOG](../PERF_LOG.md). Median 1110.440 → 2.193 ms for a 973,200-character/200-finding log. This does not measure whole-agent latency.

## Individual official plugin ledger

| Plugin | Verification | Improvement / disposition |
| --- | --- | --- |
| agent-handoff | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| cost-tracker | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| file-watcher | Catalog, defaults, reload, teardown + package suite | Nested depWatcher schema defaults match runtime defaults. |
| git-autocommit | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| auto-doc | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| shell-check | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| cron | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| template-engine | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| semver-bump | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| secret-scanner | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| token-budget | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| lint-gate | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| branch-guard | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| diff-summary | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| commit-validator | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| format-on-save | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| test-runner-gate | Catalog, defaults, reload, teardown + package suite | Enabled schema default matches actual loaded-plugin behavior. |
| import-organizer | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| todo-listener | Catalog, defaults, reload, teardown + package suite | Enabled schema default matches actual loaded-plugin behavior. |
| session-recap | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| spec-linker | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| loop-breaker | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| gitignore-guard | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| path-guard | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| process-guard | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| context-pins | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| checkpoint | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| error-lens | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| dep-guard | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| config-validator | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| notify-hub | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| changelog-writer | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| injection-shield | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| prompt-firewall | Catalog, defaults, reload, teardown + package suite | Enabled schema default matches actual loaded-plugin behavior. |
| llm-cache | Catalog, defaults, reload, teardown + package suite | Enabled schema default matches actual loaded-plugin behavior. |
| model-router | Catalog, defaults, reload, teardown + package suite | Enabled schema default matches actual loaded-plugin behavior. |
| pr-drafter | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| auto-escalate | Catalog, defaults, reload, teardown + package suite | Enabled schema default matches actual loaded-plugin behavior. |
| test-coverage-gate | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| type-gate | Catalog, defaults, reload, teardown + package suite | Enabled schema default matches actual loaded-plugin behavior. |
| token-throttle | Catalog, defaults, reload, teardown + package suite | Enabled schema default matches actual loaded-plugin behavior. |
| plugin-stack-observer | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| dependency-vulnerability-gate | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| migration-planner | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| auto-i18n-extractor | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| doc-sync-guard | Catalog, defaults, reload, teardown + package suite | Loaded plugin works without a second enabled switch. |
| api-compatibility-gate | Catalog, defaults, reload, teardown + package suite | Loaded plugin works without a second enabled switch. |
| performance-regression-gate | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| test-flake-detector | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| schema-evolution-guard | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| license-audit-gate | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| accessibility-auditor | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| security-hotspot-scanner | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| duplicate-code-detector | Catalog, defaults, reload, teardown + package suite | Schema maxFindings matches runtime default (5). |
| test-generator | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| release-notes-generator | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| workspace-health | Catalog, defaults, reload, teardown + package suite | Caller project and symlink containment; bounded async reads; per-host state; live config; cancellation/unload; indexed line lookup. |
| test-impact-analyzer | Catalog, defaults, reload, teardown + package suite | Caller project and symlink containment; bounded async reads; per-host state; live config; cancellation/unload; indexed line lookup. |
| ci-failure-triage | Catalog, defaults, reload, teardown + package suite | Caller project and symlink containment; bounded async reads; per-host state; live config; cancellation/unload; indexed line lookup. Zero failed tests no longer reported as failure. |
| env-contract-guard | Catalog, defaults, reload, teardown + package suite | Caller project and symlink containment; bounded async reads; per-host state; live config; cancellation/unload; indexed line lookup. |
| dependency-drift-detector | Catalog, defaults, reload, teardown + package suite | Caller project and symlink containment; bounded async reads; per-host state; live config; cancellation/unload; indexed line lookup. Successful --frozen-lockfile invocation no longer reported as drift. |
| release-readiness | Catalog, defaults, reload, teardown + package suite | Caller project and symlink containment; bounded async reads; per-host state; live config; cancellation/unload; indexed line lookup. |
| bundle-budget-guard | Catalog, defaults, reload, teardown + package suite | Caller project and symlink containment; bounded async reads; per-host state; live config; cancellation/unload; indexed line lookup. |
| public-api-auditor | Catalog, defaults, reload, teardown + package suite | Caller project and symlink containment; bounded async reads; per-host state; live config; cancellation/unload; indexed line lookup. |
| lockfile-consistency-guard | Catalog, defaults, reload, teardown + package suite | Caller project and symlink containment; bounded async reads; per-host state; live config; cancellation/unload; indexed line lookup. |
| change-risk-classifier | Catalog, defaults, reload, teardown + package suite | Caller project and symlink containment; bounded async reads; per-host state; live config; cancellation/unload; indexed line lookup. |
| bug-reproducer | Catalog, defaults, reload, teardown + package suite | Shared runtime rejects results completed after cancellation/unload. |
| verification-ledger | Catalog, defaults, reload, teardown + package suite | Shared runtime rejects results completed after cancellation/unload. |
| acceptance-verifier | Catalog, defaults, reload, teardown + package suite | Shared runtime rejects results completed after cancellation/unload. |
| runtime-trace-explorer | Catalog, defaults, reload, teardown + package suite | Shared runtime rejects results completed after cancellation/unload. Missing required layers now produce issues-found. |
| workspace-recipe-runner | Catalog, defaults, reload, teardown + package suite | Shared runtime rejects results completed after cancellation/unload. |
| architecture-boundary-checker | Catalog, defaults, reload, teardown + package suite | Shared runtime rejects results completed after cancellation/unload. |
| monorepo-change-planner | Catalog, defaults, reload, teardown + package suite | Shared runtime rejects results completed after cancellation/unload. |
| config-migration-assistant | Catalog, defaults, reload, teardown + package suite | Shared runtime rejects results completed after cancellation/unload. |
| feature-flag-lifecycle | Catalog, defaults, reload, teardown + package suite | Shared runtime rejects results completed after cancellation/unload. |
| generated-artifact-tracker | Catalog, defaults, reload, teardown + package suite | Shared runtime rejects results completed after cancellation/unload. |
| api-consumer-replay | Catalog, defaults, reload, teardown + package suite | Shared runtime rejects results completed after cancellation/unload. JSON equality ignores object property ordering. |
| migration-rehearsal | Catalog, defaults, reload, teardown + package suite | Shared runtime rejects results completed after cancellation/unload. |
| failure-injection-lab | Catalog, defaults, reload, teardown + package suite | Shared runtime rejects results completed after cancellation/unload. |
| concurrency-scenario-tester | Catalog, defaults, reload, teardown + package suite | Shared runtime rejects results completed after cancellation/unload. Invariant JSON equality ignores object property ordering. |
| resource-lifecycle-inspector | Catalog, defaults, reload, teardown + package suite | Shared runtime rejects results completed after cancellation/unload. |
| visual-regression-reviewer | Catalog, defaults, reload, teardown + package suite | Shared runtime rejects results completed after cancellation/unload. |
| responsive-journey-tester | Catalog, defaults, reload, teardown + package suite | Shared runtime rejects results completed after cancellation/unload. |
| localization-completeness | Catalog, defaults, reload, teardown + package suite | Shared runtime rejects results completed after cancellation/unload. |
| executable-documentation | Catalog, defaults, reload, teardown + package suite | Shared runtime rejects results completed after cancellation/unload. |
| dependency-upgrade-sandbox | Catalog, defaults, reload, teardown + package suite | Shared runtime rejects results completed after cancellation/unload. |
| developer-environment-doctor | Catalog, defaults, reload, teardown + package suite | Shared runtime rejects results completed after cancellation/unload. |
| service-topology-inspector | Catalog, defaults, reload, teardown + package suite | Shared runtime rejects results completed after cancellation/unload. |
| decision-journal | Catalog, defaults, reload, teardown + package suite | Shared runtime rejects results completed after cancellation/unload. |
| plugin-workbench | Catalog, defaults, reload, teardown + package suite | Shared runtime rejects results completed after cancellation/unload. Extension mock returns the actual unregister function contract. |

## Host plugin ledger

| Plugin | Verification / disposition |
| --- | --- |
| wstack-prompts | Host registration parity and focused plugin tests; no production change in this pass. |
| wstack-sync | Host registration parity and focused plugin tests; no production change in this pass. |
| wstack-cloud-config-sync | Host registration parity and focused plugin tests; no production change in this pass. |
| wstack-chimera | Host registration parity and focused plugin tests; no production change in this pass. |
| wstack-auto-review | 37 focused tests passed; bounded real-Git wait and unconditional cleanup in quiet-window regression. |
| wstack-specialist-triggers | Host registration parity and focused plugin tests; no production change in this pass. |
| wstack-skills | Host registration parity and focused plugin tests; no production change in this pass. |
| @wrongstack/plug-lsp | Actual mock-server startup, registration and teardown; corrected obsolete command-name assertion. |
| telegram | Host registration parity and focused plugin tests; no production change in this pass. |

## Limits

- External provider calls, real Telegram account connectivity, cloud sync and private registries were not tested against live accounts.
- Two existing package tests remain skipped. Existing baseline TypeScript diagnostics are separate from new-diagnostic gating.
- Regex evidence analyzers remain scoped heuristics; an empty findings array is not proof of project-wide correctness.
- Lifecycle and catalog success do not establish multi-host state isolation for every legacy plugin. The evidence analyzer family now has explicit isolation coverage; other legacy singleton state requires separate per-host investigation.
