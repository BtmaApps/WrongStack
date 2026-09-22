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

## Second pass: provider plugins and host isolation

Source and behavioral review covered `llm-cache`, `model-router`, `token-throttle`, `prompt-firewall`, and `auto-escalate` individually.

- **Shared lifecycle failure:** opening a second host unregistered the first host's extension and mixed counters. Eleven new tests failed before repair. Each API now owns fresh state and its own disposer/abort controller; reload/teardown only affects that host. Health totals aggregate active hosts. Tests also cover old extension references and late results after reload.
- **llm-cache:** responses cannot cross host or provider-instance boundaries. Keys are recomputed for mutable requests and include tool schemas, tool choice and other request fields. Stored and replayed responses are cloned so caller mutations cannot poison subsequent hits. A cache-clear generation prevents older in-flight calls from repopulating the cache. Four additional cache regressions failed before repair.
- **model-router:** malformed bounds, contradictory ranges, invalid hasTools and blank model names are discarded as invalid rules instead of silently becoming broad routes. Valid rules retain their ordering and dry-run behavior.
- **token-throttle:** both caller cancellation and host reload/disposal cancel a pending wait and prevent a later provider dispatch; timer cleanup is asserted.
- **prompt-firewall:** one host cannot unregister another host's protection or mix diagnostic state. Cancellation is checked before scanning and again after asynchronous detection, before provider dispatch. Existing real ExtensionRegistry firewall/cache composition tests also pass.
- **auto-escalate:** overlapping agent contexts keep independent ladder positions; starting one run cannot reset another run's retry position. Disposed/cancelled contexts no longer request retries.
- **Evidence:** eight additional provider-boundary/routing tests failed before repair. Final full package suite: **116 files, 2866 passed, 2 skipped**. CLI registration/wiring: **40 passed**. Production typecheck, manifest build/projection check, and the repository baseline gate passed with **0 new test-type diagnostics**. The type gate was rerun after declaration emission completed to exclude transient missing-dist diagnostics from the concurrent build.
- No new end-to-end latency claim is made for this pass. External provider accounts were not called; tests exercise local provider stubs and the real wrapper composition.

## Third pass: Git operations and background resources

Source and behavioral review covered `git-autocommit`, `cron`, and `file-watcher`. Ad hoc scripts and command logs for this pass were confined to `.temp_files/`; permanent regressions live in the plugin test suite.

- **git-autocommit:** every Git subprocess now uses the calling project (or configured host project) and receives combined caller/host cancellation. Disposed tools cannot start new work. LLM message generation receives the same signal. Scoped commits refuse to proceed if the working-tree drift check fails. Counters are isolated per host. Five new mocked regressions failed before repair; all passed afterward.
- **Real Git proof:** in a fresh temporary repository, the actual tool committed only `owned.ts` while leaving `foreign.ts` staged with its previous committed content intact. The test did not change process cwd or commit anything in this workspace. This confirms project selection and scope preservation, not immunity to every possible concurrent external edit during Git execution.
- **cron:** timers/jobs belong to their owning API; disposing another host cannot cancel them. Disposed start tools reject new work. Pending journal writes cannot emit cancelled jobs afterward, and overlapping iteration hooks claim a due job only once while its journal write is pending.
- **file-watcher:** watchers and debounce timers belong to their host. Late OS callbacks and delayed indexing continuations check that the watch is still active. Native watch paths and index roots resolve within the calling project using canonical path containment; emitted changed-file paths are absolute and normalized. Input labels remain available in watch results.
- **Lifecycle evidence:** seven background-resource cases failed before repair, followed by one caller-project watcher failure. All eight pass. Existing lifecycle fixtures now dispose the actual API and select the latest registration after a real reload, instead of accidentally invoking a retained, disposed tool.
- **Validation:** full package suite **119 files, 2959 passed, 2 skipped**; production typecheck, SDK/plugin builds, manifest/projection parity, task-file Biome and diff checks passed. Repository baseline gate: **0 new test-type diagnostics**. The first full run exposed five credential-parity failures from stale SDK output after a concurrent source update; rebuilding the SDK from its current source resolved those failures without changing its source.
- These totals include concurrent changes to other plugins; they are not a claim that this pass authored every new test. No workspace commit/push was performed by this task.

## Fourth pass: checkpoint ownership and safe restoration

The checkpoint source, hook/tool call chain, filesystem operations and byte-budget behavior were reviewed. Nine new regressions failed against the original implementation before fixes.

- **Ownership:** each API owns its hook, event subscription and snapshot scopes. Scopes use canonical project roots and the active session id. Hook `cwd/sessionId` and tool context `projectRoot/session.id` select the corresponding scope. Ending one identified session only releases that session's snapshots. Reload/disposal aborts pending work and unregisters subscriptions.
- **Correct project:** capture/list/restore use the caller's project or host-configured root, without changing process cwd. Project roots accessed through a junction resolve to the same canonical scope. Snapshot ids are monotonic across loaded scopes so a foreign scope id cannot alias its local snapshot.
- **Content integrity:** bounded reads detect size/metadata changes during capture. Binary files retain their bytes using base64 rather than lossy UTF-8 decoding. Permission bits are retained for recreating deleted captured files; existing files keep their current mode bits.
- **Restore boundaries:** all selected target paths are preflighted before the first write. Paths are canonicalized again during each restore, rejecting captured directories subsequently redirected outside the project. Each file is prepared in an exclusively created sibling temporary file and replaced by rename only after preparation and cancellation checks. Temporary-write failures and cancellation leave that target's current content intact and remove temporary files.
- **Lifecycle proof:** pending captures cannot publish after session end or reload; disposed tools cannot create snapshots. Tests cover overlapping sessions, multiple hosts/projects, junction-based projects, external junction retargeting, cancellation, partial temporary writes and binary round-trips.
- **Memory contract:** the existing byte budget remains shared across the host's session/project scopes instead of multiplying with the number of scopes. The newest snapshot retention exception is preserved; oldest eviction uses monotonic capture order. This shared-budget regression failed before the follow-up repair. `maxTotalBytes` is now visible in the config schema and invalid non-finite/fractional bounds fall back to valid defaults.
- **Validation:** 15 new regression cases; 40 focused checkpoint tests passed. Final package suite: **120 files, 2974 passed, 2 skipped**. Production typecheck, plugin build/manifest parity, task-file Biome and diff checks passed. Repository test-type baseline: **0 new diagnostics**. Ad hoc scripts/logs stayed under `.temp_files/`; no workspace commit/push was performed by this task.
- **Limits:** replacement is per file, not an all-files transaction. Failures report completed restores; files absent at capture are reported and never deleted. Mode bits do not represent full Windows ACL metadata. These checks do not prove immunity against every hostile filesystem race between separate OS calls. Minimal embedded hosts without session identity share a fallback scope per project.

## Individual official plugin ledger

| Plugin | Verification | Improvement / disposition |
| --- | --- | --- |
| agent-handoff | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| cost-tracker | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| file-watcher | Catalog, defaults, reload, teardown + package suite + third-pass lifecycle tests | Per-host watcher/timer disposal; stopped-watch callbacks suppressed; calling-project paths and index roots; nested defaults aligned. |
| git-autocommit | Catalog, defaults, reload, teardown + package suite + third-pass real Git proof | Calling-project Git execution, cancellation/disposal, isolated counters, fail-closed drift check and preserved foreign staged files. |
| auto-doc | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| shell-check | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| cron | Catalog, defaults, reload, teardown + package suite + third-pass lifecycle tests | Per-host jobs/timers; stale start tools blocked; cancelled and overlapping pending due notifications handled. |
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
| checkpoint | Catalog, defaults, reload, teardown + package suite + fourth-pass filesystem regressions | Host/session/project isolation; cancellable bounded capture; lossless binary snapshots; canonical restore preflight and per-file replacement; shared host byte budget. |
| error-lens | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| dep-guard | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| config-validator | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| notify-hub | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| changelog-writer | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| injection-shield | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| prompt-firewall | Catalog, defaults, reload, teardown + package suite + second-pass host isolation | Per-host protection/disposal and counters; cancellation before dispatch; schema default aligned. |
| llm-cache | Catalog, defaults, reload, teardown + package suite + second-pass host isolation | Host/provider isolation; complete mutable-request keys; response copy isolation; clear/reload races fixed. |
| model-router | Catalog, defaults, reload, teardown + package suite + second-pass host isolation | Per-host routes/disposal; malformed and contradictory routing conditions no longer broaden rules. |
| pr-drafter | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| auto-escalate | Catalog, defaults, reload, teardown + package suite + second-pass host isolation | Per-host registrations and per-agent-run retry positions; cancelled/disposed retries suppressed. |
| test-coverage-gate | Catalog, defaults, reload, teardown + package suite | Added per-plugin default/schema regression coverage; no production change in this pass. |
| type-gate | Catalog, defaults, reload, teardown + package suite | Enabled schema default matches actual loaded-plugin behavior. |
| token-throttle | Catalog, defaults, reload, teardown + package suite + second-pass host isolation | Per-host budgets; cancellation/reload removes pending timers and prevents deferred provider dispatch. |
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
- Lifecycle and catalog success do not establish multi-host state isolation for every legacy plugin. The evidence analyzer family, five provider plugins, cron, file-watcher and checkpoint now have explicit isolation coverage; remaining legacy singleton state requires separate per-host investigation.
- The next source-level priorities are format-on-save/import-organizer (caller project, cancellation and concurrent edits), followed by template-engine/semver-bump (partial writes and recovery).
