# Kanban system repair and verification ledger

> Archived on 2026-10-06. Claims, counts and test results below are historical
> evidence or proposals; they are not current checkout certification. Use the
> [maintained documentation](../../README.md) and current source for runtime behavior.


Date: 2026-10-02. Architecture:
[`kanban-system-architecture-2026-10-02.md`](kanban-system-architecture-2026-10-02.md).
Changes were made in the existing shared checkout; pre-existing changes were retained.
No commit, push, live-session mutation or production service restart was performed.

## Repairs

The entries below group related failure modes. Test counts are not a defect quota.
Each group has a failing before-state assertion and a passing post-repair check.

| ID | Observed failure | Implemented repair / permanent coverage |
| --- | --- | --- |
| K01 | Async verification overwrote newly added criteria, attached evidence to a successor lease, or returned a phantom persisted result after deletion. Completion could revive an archived task. | Revision fence inside persistence and on non-persisting return; final gate publication also checks revision. Deleted targets do not return synthetic success. `verification-integrity.test.ts` tests edit, deletion, archive, successor and unchanged control. |
| K02 | Simple child verification skipped its file contract and ignored the provided baseline. | All children run the full guarded protocol; assignment/provided baseline flows into child verification. Parent fails when child file scope fails. |
| K03 | Matching a file path was sufficient even when the declared `modify` was actually `delete`. | File scope checks operation as well as path and reports the observed operation. |
| K04 | Leaf Done validation ignored an overall failed report; other task/board/lease/attempt reports could settle the current card. | All tasks reject non-passing reports and mismatched ownership. Four ownership cases plus failing leaf regression. |
| K05 | Parent-child validation filtered missing children out of lookup and allowed non-atomic parents into Done. | Unresolved exact child IDs explicitly block acceptance. Missing-child fixture data was corrected in older happy-path tests. |
| K06 | Editing criterion command `notes` retained its pass/audit/report; bulk detail edits and old report coverage ignored the changed input. | Shared executable-input fingerprint; changed assertions reset to pending; obsolete reports are invalidated; new reports bind SHA-256 task inputs and Done validates that binding. Explicit current audit metadata is preserved. |
| K07 | Managed copies inherited passed criteria and a report belonging to the source task. | Managed clones start with fresh pending criterion results and no source verification report. |
| K08 | Adding a check silently discarded requested council/agent escalation. | Persist the check's escalation field; council preservation regression. |
| K09 | Worker completion in Review projected as a completed todo, allowing all-completed auto-clear before acceptance. | Review projects as open `in_progress`; only accepted completed card status completes its todo. Repeated completion requests in Review return an acceptance warning without re-recording worker completion. |
| K10 | Reads resolving after detach, session switch or board switch created stale subscriptions/presence/todos. Presence discovery could rebind a task into the next session. | Explicit detached lifetime, watcher generation, session/project/board checks after awaits, guarded event/timer callbacks and idempotent detach. Six session integrity tests include out-of-order reads. |
| K11 | Older board snapshots and verification task responses rewound current UI details. | Board revision and task timestamp checks preserve newer state while finishing operation/spinner bookkeeping. Three store regressions. |
| K12 | Automatic file-scope verification captured a baseline after implementation rather than before it. | File-scope/git-diff assignments capture and persist a baseline when entering Running, with a revision fence. Verification reuses it. Both assignment APIs are covered, plus real Git/IPC smoke. |
| K13 | Detaching the last session mirror owner deleted a populated board despite its retention policy. | Automatic lifecycle cleanup removes only empty mirrors; populated history survives until retention or explicit cleanup. Existing detach test now verifies both retention and intentional deletion. |
| K14 | Deterministic reconciliation revived archived tasks and bypassed strict Done ownership using any old passing report. | Skip archived/merged tombstones; strict reconciliation shares Definition of Done validation. Archive and successor-attempt regressions. |
| K15 | Reports labelled all-skipped/mixed-skipped acceptance criteria `passed`. | Skipped criteria produce `needs_human`; passing checks and empty legacy checks retain their distinct behavior. Builder and managed-warning tests match this contract. |
| K16 | WebUI verification wrote the same report twice, creating a stale second publication; failed verification completion left a permanent spinner. | Tools and WebUI use the verifier's fenced persistence directly. Web route test requires one revision increment. Failure removes only its matching spinner and retains the error. |
| K17 | A pre-set passed flag on unavailable agent/auto/council verification was accepted as manual evidence. Prior automated System One results could not be freshly re-judged. | Missing-verifier fallback only admits manual/review approval; unresolved automation is skipped. Previous agent/system results are re-executed against current evidence. Registry, integrity and System One regressions cover both paths. |

Main added suites:

- `packages/kanban/tests/verification/verification-integrity.test.ts` — verification,
  ownership, file scope, baseline, criteria, clones, reconciliation and unavailable verifiers.
- `packages/tools/tests/session-kanban-integrity.test.ts` — acceptance and async lifetime.
- Existing store, lifecycle, registry, route, System One and compaction tests were extended
  or corrected to use valid fixtures and explicit contracts.

## Before-state evidence

The following ignored local logs preserve failing assertions before their repairs:

| Log in `.temp_files/` | Failure coverage |
| --- | --- |
| `kanban-audit-proof-2026-10-02.log` | Stale verification, child protocol, file operation, ownership, criteria notes, missing children, false todo completion and session lifetime |
| `kanban-audit-proof-detail-ui-2026-10-02.log` | Bulk detail input edits, report input identity, managed copying and escalation |
| `kanban-audit-proof-ui-2026-10-02.log` | Delayed board/task response rewind |
| `kanban-audit-proof-baseline-history-2026-10-02.log` | Pre-work baseline absence and populated mirror deletion |
| `kanban-audit-proof-reconcile-2026-10-02.log` | Archive revival, successor report admission and skipped-report pass |
| `kanban-audit-proof-web-route-2026-10-02.log` | Double verification publication (two revisions instead of one) |
| `kanban-audit-proof-ui-error-2026-10-02.log` | Spinner left behind on a failed completion |
| `kanban-audit-proof-missing-verifier-2026-10-02.log` | Unavailable automation accepted as a pass |
| `kanban-audit-proof-rejudge-2026-10-02.log` | Prior automated verdict not freshly evaluated |

Baseline: 122 files / 1,552 tests passed before adversarial regressions were added.
This illustrates why an existing green suite was insufficient evidence of correctness.

## Validation

Final counts and concurrent-checkout blockers are recorded below. The authoritative evidence is the actual command exit and log,
not this report's existence.

| Check | Evidence |
| --- | --- |
| Kanban, Tools, WebUI Server builds | Passed; `kanban-audit-build-{kanban,tools,server}-2026-10-02.log` |
| WebUI production build | Passed; `kanban-audit-build-webui-2026-10-02.log` |
| Source typechecks: Kanban, Tools, WebUI Server, WebUI | All four passed; `kanban-audit-typecheck-final-2026-10-02.log` |
| Root connected-surface tests | 198 files / 2,293 tests passed; `kanban-audit-final-2026-10-02.log` |
| WebUI tests | 25 files / 249 tests passed; `kanban-audit-webui-final-2026-10-02.log` |
| HQ inspector actions | 1 file / 2 tests passed; `kanban-audit-hq-final-2026-10-02.log` |
| Browser harness | Passed at 1440×900, 390×844 and 390×300; `kanban-audit-browser-2026-10-02.log` |
| Real project IPC / SQLite / Git | Passed; `kanban-audit-runtime-2026-10-02.log` |
| Test TypeScript gate | 0 new diagnostics in owned Kanban paths; global gate fails with 15 unrelated concurrent diagnostics; `kanban-audit-test-types-final-2026-10-02.log` |
| Scoped Biome and whitespace | Passed on 35 owned source/test files; `kanban-audit-lint-2026-10-02.log` and scoped `git diff --check` |

The three final test groups are disjoint: **224 files / 2,544 tests passed**.
The root group includes domain/storage/IPC, MCP, governance, session tools,
WebUI Server routes, CLI/HQ dispatch/mirroring, TUI and HQ model/mobile checks.
WebUI uses its dedicated jsdom configuration; the HQ inspector test uses its own
Vite configuration. No zero-test filtered run is counted.

The global test-typecheck's remaining 15 new diagnostics are in:
`core/tests/infrastructure/token-counter.test.ts`,
`core/tests/storage/session-catalog-store.test.ts`,
`core/tests/storage/session-reader-extra.test.ts`,
`tools/tests/present-artifact.test.ts`,
`webui/tests/components/story-widget.test.tsx`, and
`webui/tests/lib/session-story.test.ts`. These concurrent files were not changed
as part of this Kanban repair. Initial own test-fixture diagnostics were corrected
and rechecked; none remain in owned paths. An intermediate WebUI source check
also caught a concurrent artifact request-id type mismatch; the final four-package
source check passed after that external work settled.

Browser harness command: `node packages/webui/tests/kanban-browser-smoke.mjs`.
It runs real components/stores/CSS with a recorded client transport, covers the
five view modes, deletion confirmation, viewport width and session-isolated todo
actions. Screenshots are in `.reports/kanban-review/`. It is not a full production
backend browser journey. The first run logged transient missing-dist pre-transform
warnings during shared builds, while all viewport assertions and page-error checks passed.

Real IPC command: `node .temp_files/kanban-runtime-smoke-2026-10-02.mjs`.
It creates an isolated project/Git repository, starts the real project daemon,
captures the pre-work baseline, modifies an actual tracked file, verifies strict
completion, reads the persisted fingerprint through IPC, edits the criterion,
checks report invalidation and re-verifies failure. It asserts the real Git index
is unchanged and shuts down only its own daemon. The isolated fixture/database is
retained as evidence; it never uses the user's active boards.

## Compatibility and operational boundaries

- No storage migration is required: baseline/fingerprint fields are optional.
  New evidence is fully bound. Older evidence lacks that extra binding and is not
  retroactively certified by this audit.
- Verification now fences task/relations/policy state (K28). Presence, heartbeat,
  metadata and unrelated task writes survive the verification interval. Changed
  work, ownership, outcomes or policy still require a new run; there is no silent
  retry of commands with potentially nontrivial effects.
- Manual approval remains possible. An unavailable automatic/escalation check
  must be evaluated by its verifier or explicitly converted to a manual criterion;
  a passed flag cannot impersonate execution evidence.
- Ungated run mirrors keep external run evidence when local display/decomposition
  fields change; their run engine remains authoritative.
- Automatic detach now preserves populated mirrors under the existing TTL/archive
  policy. This can retain more boards than the old destructive close behavior;
  explicit cleanup and configured archive purge remain available.
- The full monorepo release matrix and a live production-session browser journey
  were not run. These checks do not establish an error-free product or deployment.

## Continuation: relationships, sources and evidence

The second pass completed on 2026-10-03 (Europe/Kiev) and extends the same architecture and evidence ledger. The original
validation above remains historical; continuation logs use `kanban-audit-round2-*`.

| ID | Before-state failure | Repair and coverage |
| --- | --- | --- |
| K18 | A promoted/bound todo shadowed its actual plan/task origin; local ID collisions updated unrelated promoted rows. Tool source failures were swallowed. WebUI published old source data after session/context/project changes during an await. | Origin-first durable source mutation plus exact-row reflection. Partial failures carry committed-board information. Broadcasts recheck context, session and context/request project roots. Tools and server source integrity suites include unchanged-owner controls. |
| K19 | Missing caller tasks were considered dependency-ready; missing persisted IDs could resolve as prefixes of unrelated completed dependencies/children. | Missing task readiness is false; persisted relation lookup is exact. Caller prefix selection remains available. Pure queue classification evaluates its supplied task object rather than requiring it to appear in a separate board snapshot. |
| K20 | New split/merge work inherited old reviewer approval, live lease/attempt/worker output, and a predecessor's Running/Review/terminal state. | Fresh pending criteria, routing-only assignment cloning, and safe default initial column. Source task state is retained; explicit legacy target-column selection is honored. Managed copies use the same routing-only assignment policy. |
| K21 | Task graph export turned completed/review/blocked cards into running work because of stale assignment telemetry. | Accepted/held card state takes precedence over telemetry; three status regressions exercise the exported graph. |
| K22 | Direct Done validation admitted executable criteria solely from passed flags, or admitted declared file contracts without file-scope evidence. | Executable/escalated checks require matching passing verifier entries; expected files require a matching scope report. Manual review approval retains its separate semantics. |
| K23 | Parent evidence remained admissible after a completed child or deeper descendant was redefined. | Optional descendant input/state fingerprint is persisted with parent verification and validated against the current board. Nested descendant edit is rejected; unrelated board metadata update remains accepted; re-verification restores validity. |
| K24 | An unchanged baseline passed `git_diff` merely because pre-existing worktree files were dirty. Git failures disappeared as empty diffs. | A task diff must contain actual changes. Diff read errors propagate; the plugin records an error and actionable reason. Empty-baseline, unreadable-baseline and error-report regressions are retained. |
| K25 | Parent/child cycles imported/synchronized into boards hid every executable leaf without failing dependency-cycle checks. | Validate parent relationships before publishing. Create/sync failures leave the prior board and board list intact. Existing partial parent-import controls remain supported. |
| K26 | `startedAt` was generated at report construction after all checks, making verification appear instantaneous. | Capture start before input loading/check execution and preserve it through report construction. A delayed controlled verifier proves start precedes the check and the interval includes execution. |

New suites: `kanban/tests/relationship-integrity.test.ts`,
`tools/tests/session-kanban-source-integrity.test.ts` and
`webui-server/tests/kanban-source-integrity.test.ts`.
Initial proof run: 18 failing cases and one unaffected control. Further proof logs
cover unreadable diff/missing child, hierarchy cycles, publication ownership,
derived stage and timing. All are preserved under `.temp_files/` with the
`kanban-audit-round2-proof*` prefix; final tests exercise the same cases.

Final continuation validation:

| Check | Result / log |
| --- | --- |
| Root connected-surface suites | 201 files / 2,324 tests passed; `kanban-audit-round2-final.log` |
| WebUI suites | 25 files / 249 tests passed; `kanban-audit-round2-webui.log` |
| HQ inspector actions | 1 file / 2 tests passed; `kanban-audit-round2-hq.log` |
| Verification follow-up | 21 files / 385 tests passed; overlaps the root group; `kanban-audit-round2-verification-final.log` |
| Builds and source typechecks | Four package builds/source checks passed; `kanban-audit-round2-build-*`, `kanban-audit-round2-typecheck.log` |
| Real IPC baseline/scope/index | Passed; `kanban-audit-round2-runtime-baseline.log` |
| Real IPC descendant/derived work | Passed; `kanban-audit-round2-runtime-relations.log` |
| Chromium component/client harness | Passed at 1440×900, 390×844 and 390×300; `kanban-audit-round2-browser.log` |
| Scoped lint and whitespace | Passed on 22 continuation source/test files; `kanban-audit-round2-lint.log` and scoped `git diff --check` |
| Global test TypeScript | No new owned-path diagnostics at the last run; 17 concurrent external diagnostics remain in Core, artifact/story and code-assist fixtures; `kanban-audit-round2-test-types.log` |

The disjoint root/WebUI/HQ groups total **227 files / 2,575 tests passed**.
The three added continuation suites contain 31 tests, including positive ownership,
prefix-selection, re-verification and unrelated-update controls. Verification and
server follow-ups overlap this total and are not added twice. Remaining global type
diagnostics are outside the continuation's edited paths. The release matrix and a
production-session browser journey remain unrun; existing production services were
not restarted.

The additional IPC script `.temp_files/kanban-runtime-relations-round2.mjs` verifies
that the descendant fingerprint crosses the real daemon/SQLite boundary, stale
parent evidence is rejected, fresh evidence is accepted, and split work retains
routing while discarding old claims/output/approval and starting pending. It retains
its isolated project evidence and shuts down only its own daemon.

## Third pass: accepted contracts, concurrent verification and run evidence

Completed on 2026-10-03 (Europe/Kiev). This extends K01's conservative revision
fence with a task/relations/policy fence and preserves its stale-publication cases.

| ID | Executed failure before repair | Repair and permanent regression |
| --- | --- | --- |
| K27 | Managed Done cards accepted changed scope, added/changed/removed criteria, failed outcome flags, new dependencies and split children while remaining completed. A passing report from another task could also be patched onto accepted work. | Shared accepted-contract guard rejects those writes atomically and instructs creation of follow-up work. Matching valid evidence, notes/labels, unchanged checks and legacy edits retain their behavior. Criterion operations are separated into `task-checks.ts` with existing API re-exports. |
| K28 | Presence, heartbeat, notes and unrelated task writes caused valid long-running verification and completion to fail solely because board revision changed. | Canonical fingerprint covers current task, reachable child/dependency state and acceptance policies. Checks occur before evidence return and under the final mutation; verifier-owned fields merge into the latest task. Changed criteria/results/report/lease/descendant/policy still reject. Final-mutation heartbeat and stale-ownership cases are tested separately. |
| K29 | External attachment silently ignored changed evidence with identical verdict and completion timestamp. | Compare complete normalized reports; unchanged reports remain no-ops and changed evidence persists. Accepted managed replacement evidence must pass Definition of Done. |
| K30 | SDD mirror skipped a new verification command/detail whenever verdict stayed passed. | Compare complete gate check evidence and task title; carry run attempt and engine completion time in evidence. New command/detail replaces the previous same-verdict report. |
| K31 | Mirror stamps omitted projected title/description/provider/timestamps/phase data, so updates with unchanged status/model/verdict never reached cards. | Stamp the projected graph, assignment and wave structure; Goal includes phase/task definitions and timing. Individual unchanged-status mutations and identical-snapshot control are tested. |
| K32 | Failed mirror sync/publication committed the stamp before success, suppressing retries of the same snapshot. | Commit the stamp after all projection/publication work succeeds. A one-shot publication failure followed by an identical snapshot retries successfully. |
| K33 | A second snapshot could write while an earlier same-run projection was awaiting storage, allowing the old projection to win. | Serialize per engine/run. A held first sync plus newer snapshot proves no overlapping same-run sync and the latest definition survives. |

Permanent suites: `kanban/tests/verification/concurrent-contract.test.ts` and
`webui-server/tests/kanban-run-mirror-integrity.test.ts`, **39 cases** after the last
addition. Initial source proofs recorded **24 failures / 7 controls**;
dedicated dependency/split proofs recorded **2 failures / 27 controls**; the
accepted-report proof recorded **1 failure / 29 controls**. Logs are retained as
`kanban-audit-round3-proof*.log`.

Validation evidence (all logs under `.temp_files/`):

| Check | Result / log |
| --- | --- |
| Connected root suites | 203 files / 2,363 tests passed; `kanban-audit-round3-final-verified.log` |
| WebUI | 25 files / 249 tests passed; `kanban-audit-round3-webui.log` |
| HQ inspector | 1 file / 2 tests passed; `kanban-audit-round3-hq.log` |
| Final acceptance/verification follow-up | 24 files / 485 tests passed; overlaps root; `kanban-audit-round3-verification-final.log` |
| Post-extraction connected checks | 130 files / 1,697 tests passed; overlaps root; `kanban-audit-round3-module-final.log` |
| Builds | Four related builds passed; Kanban/server were rebuilt after the final module move; `kanban-audit-round3-build-*` |
| Final source typechecks | Kanban/Tools/WebUI Server passed; `kanban-audit-round3-owned-typecheck.log`. Earlier four-package runs passed, but the last combined run found two concurrently introduced errors in unedited `webui/src/components/MailboxPanel.tsx`; `kanban-audit-round3-typecheck-final.log` |
| Real command/IPC/SQLite concurrency | Passed again after final build; `kanban-audit-round3-runtime-concurrency-final.log` |
| Previous real IPC baselines/relations | Both passed again after final build; `kanban-audit-round3-runtime-baseline-final.log`, `kanban-audit-round3-runtime-relations-final.log` |
| Chromium component/client harness | Passed at 1440×900, 390×844 and 390×300; `kanban-audit-round3-browser.log`; transport remains the harness mock, not a live production-session journey |
| Scoped lint and whitespace | 12 edited source/test paths passed; `kanban-audit-round3-lint.log`; scoped source/test/docs `git diff --check` passed |
| Architecture read-only report | Zero runtime cycles; remaining global expired type-cycle exceptions/hotspot debt are listed in `kanban-audit-round3-architecture-final.log`; report-only exit 0 does not certify the strict architecture gate |
| Global test TypeScript | Zero new owned-path diagnostics; 20 external diagnostics in six files at this snapshot; `kanban-audit-round3-test-types-final.log` |

The disjoint root/WebUI/HQ groups total **229 files / 2,614 tests**. Follow-up runs
overlap this count. The global TypeScript run contains 3 token-counter, 2 session
catalog, 2 session reader, 6 artifact, 2 code-assist and 5 TeamConstellation
diagnostics outside the edited paths; the shared tree changed during this run.
The later source check separately found missing `COMPOSE_TYPES` and an implicit
callback parameter type in the concurrent MailboxPanel edits. These are not
Kanban regression findings or a clean repository-wide typecheck. Architecture
reporting also still lists the existing assignment/context hotspots. The new
`tasks.ts` hotspot is resolved by extracting criteria operations into their own
module rather than increasing the generated budget.

The isolated `.temp_files/kanban-runtime-concurrency-round3.mjs` starts a real
configured local verifier process, pauses it via fixture signals, writes presence,
heartbeat and notes through IPC, and verifies successful atomic finalization.
Changing a criterion during a second paused process rejects stale publication.
An adopted Done card rejects scope edits and split without creating a child.
Only its own daemon is shut down and the SQLite/Git fixture is retained. The first
harness attempt was rejected by the hard-blocked raw `node` command; the harness
now uses the supported explicitly configured local-bin mechanism. A second
harness fixture initially put the adopted historical card in Backlog and was
corrected to Done. Both initial logs remain as evidence, not product findings.

No production restart, shared-checkout commit/push, full release matrix or live
production-session browser journey was performed. These results establish the
tested behavior and do not certify every possible integration or workspace race.

## Fourth pass: real browser flow, existing records and release gates

Completed on 2026-10-03 (Europe/Kiev). This pass follows the third-pass boundaries
above with real transport evidence, a read-only database audit and full test/release
attempts. Production services were not restarted.

| ID | Executed failure before repair | Repair and permanent regression |
| --- | --- | --- |
| K34 | Lexicographic ISO comparison expired a live offset-timestamp lease, missed an expired one, and treated equal instants differently. Recovery, claiming and queue classification also had separate predicates. | One pure `assignment-staleness.ts` leaf compares parsed instants across all three consumers; the ten-minute missing-expiry silence boundary is preserved. `kanban/tests/assignment-time-integrity.test.ts` contains seven cases. Initial proof: three failures / one control; consumer follow-up: two failures / four controls. |
| K35 | A spawned Docker client inherited ambient provider/vault environment variables. | Use the existing `buildChildEnv` policy, preserve the six named Docker connection/configuration settings and explicitly supplied options. `runtime/tests/docker-workspace-environment.test.ts` uses dummy secrets and a mocked spawn; it does not execute Docker or claim a complete container security audit. The initial secret-propagation proof failed and the repaired test passed. |
| K36 | TUI/WebUI Cleaner told a valid managed executable leaf to persist child tasks although backend acceptance allowed that leaf. | Require child IDs for managed composite parents only. Legacy decomposition advice remains intact. `cli/tests/kanban-managed-leaf-audit.test.ts` has six backend-aligned cases across both surfaces. Valid-fixture proof: two failures / four controls; three related suites now pass 81 tests. Old parent-detail fixtures explicitly declare their composite role. |

Structural repairs retain the public entrypoints: assignment recovery moved to
`assignment-recovery.ts`; process execution moved to `verification-process.ts`;
session board creation, queue and retention moved to `session-kanban-boards.ts`.
The mirror module is now 743 lines and its board module 246 lines. Queue/counter
ownership remains shared. Private todo conversion is covered through managed
projection and acceptance clearing rather than exported solely for tests.
Hotspot baselines were updated with the official scoped writer; unrelated entries
were preserved. The process move updates existing spawn/signal architecture
allow-lists to the new owning path without expanding their behavioral exceptions.

Read-only actual-data snapshot:

- 97 boards / 873 tasks, including two managed/strict boards and seven mirrors.
- Zero missing persisted dependency/child references.
- All 29 reports were local legacy evidence without fingerprints. They remain
  historical and were not rewritten or newly certified.
- No stored file contracts and no completed managed/strict tasks existed. The
  audit therefore cannot establish historical strict Done or baseline validity.
- Snapshot/log: `.temp_files/kanban-existing-records-round4.json` and
  `kanban-audit-round4-existing-records-final.log`.

The permanent manual smoke `packages/webui/tests/kanban-live-backend-smoke.mjs`
passed with exit 0 after the Cleaner repair. It creates an isolated Git project,
real session journal/context and managed card through the todo tool. Chromium uses
the production client/components, authenticated WebSocket route handlers and real
IPC/SQLite. The UI walks Backlog → Todo → Running; a controlled worker writes the
tracked file and completes into Review. UI verification proves the file check and
baseline-relative file scope while Review/todo remain open. UI acceptance records
the reviewer action/comment, reaches Done and clears the completed active todo.
Screenshots: `.reports/kanban-review/live/review-evidence.png` and
`accepted-done.png`; log: `kanban-audit-round4-live-browser-final-corrected.log`.
This small route host does not run complete `startWebUI` startup or a paid model.

Validation logs below are retained under `.temp_files/`:

| Check | Result / log |
| --- | --- |
| Final connected root suites | 205 files / 2,376 tests passed after the latest module extraction; `kanban-audit-round4-connected-final-modules.log` |
| Session board extraction follow-up | 11 files / 89 tests passed, overlapping root; `kanban-audit-round4-session-module-verified.log` |
| Selected WebUI suites after K36 | 25 files / 236 tests passed; `kanban-audit-round4-webui-corrected.log` |
| HQ inspector | 1 file / 2 tests passed; `kanban-audit-round4-hq.log` |
| Reported full-run failures, focused repair validation | 14 files / 187 tests passed; `kanban-audit-round4-release-blockers-verified.log`; additional fixture UI checks passed separately |
| Builds | Kanban/Tools/Runtime/WebUI Server passed earlier final runs; TUI/protocol and Tools were rebuilt after the latest extractions. WebUI's final rebuild passed: `kanban-audit-round4-build-webui-corrected-verified.log`; intermediate concurrent contract/build drift failures remain in their original logs |
| Latest source TypeScript | Six source checks passed: Kanban, Tools, Runtime, WebUI Server, TUI, WebUI; `kanban-audit-round4-source-*-corrected.log` |
| Test TypeScript ratchet | 35 projects, zero new diagnostics; 1,369 grandfathered diagnostic instances remain, so this is not an all-tests TypeScript-clean claim; `kanban-audit-round4-test-types-corrected.log` |
| Final runtime test inventory | Every one of 3,997 files had exactly one nonempty Vitest project; `kanban-audit-round4-inventory-final.log`. The earlier 3,990-file snapshot also passed; additional shared-checkout tests appeared during the audit |
| Final skip declarations | Official baseline generation followed by check passed at 171 declarations; `kanban-audit-round4-skips-final.log`. Three live WrongTrace suites now declare unavailable-daemon skips rather than returning early; their independent wiring checks remain runnable |
| Staleness leaf coverage | Seven tests; 100% statements/branches/functions/lines; `kanban-audit-round4-time-coverage-final.log` |
| Protocol coverage snapshot | 11 files / 200 tests; 100% statements/branches/functions/lines; `kanban-audit-round4-protocol-coverage-final.log`. This predates later concurrent protocol additions |
| Final real browser journey after session extraction | Passed again with exit 0; `kanban-audit-round4-live-browser-final-modules.log`; isolated fixture and screenshots retained |
| Scoped lint / whitespace | 42 edited source/test paths passed Biome; `kanban-audit-round4-lint-final-verified.log`; scoped source/tests/docs/generated files/manifests `git diff --check` passed; `kanban-audit-round4-diff-final.log` |

The final disjoint root/selected WebUI/HQ runs total **231 files / 2,614 tests**.
Session/Cleaner/fixture/coverage follow-ups overlap these runs and are not added
to that total. The selected WebUI set differs from the earlier 249-test selection;
both runs passed at their recorded snapshots.

The runtime test ownership repair assigns the pure transcript suite only to the
root project and excludes it from WebUI jsdom. Core fixture type repairs follow
actual session/message/event contracts; artifact calls supply their required abort
signal. The Docker environment repair declares Runtime's existing primitives usage
as a workspace dependency. Auth/error helper wiring and architecture exceptions
were aligned with the shared helpers; no security/error ratchet was increased.
Protocol regressions cover read-only Code Assist presets, edit opt-in, encoded
session queries, request credentials/body/signal/idempotency, HTTP errors and
stripping/cloning generated automation state.

Full-repository evidence remains a boundary, not a green certificate:

- `pnpm test` ran. The root phase reported 3,537 files, seven failed, 50,243 passed
  tests and ten failed tests. The reported fixture/architecture failures were
  repaired and the affected suites passed afterward. There was no final complete
  `pnpm test` exit-0 run; focused passes do not replace it.
- `pnpm release:check --no-cache` completed all 20 gates: **15 passed / five
  failed**, exit 1. The failed gates were audit, architecture, runtime test
  inventory, skip declarations and coverage. Build, workspace source typecheck,
  test-type ratchet, package/install/lineage and the other release gates passed
  in that matrix snapshot.
- Inventory/skip gates were repaired afterward; Core API usage was regenerated
  by its official writer. Architecture still has global type-cycle/expired
  exception and hotspot/test-only export debt. Zero runtime cycles in report-only
  output does not establish a passing strict gate. The final refreshed report
  `kanban-audit-round4-architecture-final-refreshed.log` no longer lists the owned
  assignment/context/session mirror hotspot or private todo-status export issues;
  the global debt remains. Scoped writer comparisons verified unrelated hotspot
  and test-only export entries were preserved.
- Full instrumented coverage found three root failures and a protocol threshold
  failure. Two root cases were the staleness consumer regressions fixed during
  that long run; the third SAGE HQ connection timing case passed both standalone
  and isolated V8 follow-ups. Staleness/protocol scoped coverage passed afterward.
  Full root/matrix coverage was not re-certified.
- Dependency audit reports `http-cache-semantics <=4.2.0` through desktop packaging
  dependencies; the reviewed [upstream advisory](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)
  listed no patched version at this snapshot. The finding was not suppressed and
  no runtime exposure or exploit claim was made.

Matrix/logs: `kanban-audit-round4-release-matrix.log`,
`.reports/release-check-matrix/` and the retained prior-log copy
`.temp_files/kanban-release-round4-before/`. Full tests:
`kanban-audit-round4-full-tests.log`. The shared checkout continued changing during
these long runs. A final green full test/coverage/release run and a complete
production-server browser journey remain unproven.

## Fifth pass: standalone startup and pre-work baseline concurrency

Completed on 2026-10-03 (Europe/Kiev). The complete default standalone `startWebUI`
entrypoint and built App now have a permanent manual smoke:
`packages/webui/tests/kanban-start-webui-smoke.mjs`, exposed as
`pnpm.cmd --filter @wrongstack/webui test:kanban-startup`.
The test uses a new isolated project/home and required HTTP/WS authentication,
real dispatch/route composition and IPC/SQLite. It walks Backlog → Todo → Running
→ Review, executes the actual file verifier through the UI, and accepts with a
reviewer action/comment. Reload and a restart of only its own standalone backend
preserve the verification report and acceptance history. Worker output is fixture
controlled and no paid model is invoked.

The first complete pass exited 0 in
`kanban-audit-round5-full-startup-sixth.log`. Subsequent validation strengthened
the UI completion wait and report equality assertion; its final run is recorded
below. Intermediate fixture errors are retained rather than counted as product
findings: required event identity/return shape, authenticated readiness, baseline
capture before startup-owned `.gitignore`/project metadata writes, persisted-view
navigation toggle and CSS-transformed status text. The verifier correctly rejected
unexpected bootstrap writes when the fixture captured its baseline too early.

| ID | Executed failure before repair | Repair and permanent regression |
| --- | --- | --- |
| K37 | Repeating the full-startup smoke rejected assignment baseline capture when background board writes advanced revision. Controlled presence/note/unrelated-task/board-title writes reproduced eight failures across `assignTask` and `updateTaskAssignment`; eight contract/ownership/dependency/policy controls correctly rejected. | Compare the existing `verificationStateFingerprint` captured before the await with the current task/board under the final mutation lock. Routine writes retain their data and permit start; changed work/ownership/relations/policy still reject without publishing a baseline. `kanban/tests/assignment-baseline-concurrency.test.ts` retains all 16 cases. Proof: `kanban-audit-round5-proof-baseline-concurrency.log`; six related suites passed 113 tests after repair in `kanban-audit-round5-baseline-final.log`. |

Read-only actual-data audit was refreshed in
`.temp_files/kanban-existing-records-round5.json`: still 97 boards / 873 tasks,
29 local legacy reports without fingerprints, zero missing child/dependency
references, zero file contracts and zero completed managed/strict cards.
There is no demonstrated current-data migration failure to repair. Optional
fingerprints are a compatibility contract, not proof that legacy inputs were
reverified. The records remain historical; a claim of fresh acceptance evidence
requires an actual new verification rather than synthesizing a hash over old
results. No existing records were changed.

The fifth-pass full `pnpm test` attempt was started before K37 was discovered;
the whole-run outcome and post-repair package validation are tracked below.
It is separate from full root coverage and a final release-matrix certification.

Final fifth-pass validation (logs under `.temp_files/`):

| Check | Result / log |
| --- | --- |
| Complete Kanban package, after K37 and final build | **82 files / 1,293 tests passed**; `kanban-audit-round5-kanban-final.log`. The 16 new regressions and 113-test focused run overlap this count |
| Kanban build | Passed after K37; `kanban-audit-round5-build-kanban-final.log`. Earlier Kanban/Tools/WebUI Server/WebUI builds also passed in `kanban-audit-round5-build-*.log` |
| Kanban source/test TypeScript | Both passed with zero diagnostics; `kanban-audit-round5-kanban-source-types.log`, `kanban-audit-round5-kanban-test-types-final.log`. Removed two pre-existing unused test locals/helpers; heartbeat assertions remain intact |
| Complete standalone browser journey after K37 | `pnpm.cmd --filter @wrongstack/webui test:kanban-startup` exited **0**; `kanban-audit-round5-full-startup-final-verified.log`. Full report equality and acceptance history survive backend restart; UI completion is awaited before screenshots |
| Browser artifacts | `.temp_files/kanban-start-webui-rnoHYt/result.json` and `screenshots/{review,accepted,after-restart}.png`; inspected restart screenshot shows Done, one completed card and healthy queue |
| Scoped lint / whitespace | Six edited source/test/manifest paths passed Biome; `kanban-audit-round5-lint-verified.log`; scoped `git diff --check` passed and was repeated after documentation updates |
| Architecture read-only | No new owned-path issue in `kanban-audit-round5-architecture.log`; report-only exit 0 does not certify the global strict gate |
| Full `pnpm test` attempt | Root: **3,536 files passed / one failed / nine skipped; 50,312 tests passed / two failed / 60 skipped / one todo**, exit 1; `kanban-audit-round5-full-tests.log`. Root failure prevents the script's subsequent full WebUI phase from running |
| Isolated follow-up for the two whole-run failures | Current `core/tests/chronicle/tool-adapter.test.ts`: **19 passed**, exit 0; `kanban-audit-round5-chronicle-isolated.log`. No Core source/test was changed in this pass |

The whole-run failures were Chronicle patch-path redaction and an undefined `dir`
in a permission-provenance fixture. The current isolated file passed after the
shared tree changed. The full attempt began before K37 existed; the final Kanban
package run and rebuilt browser journey explicitly cover the repaired source.
There is still no final all-at-once green `pnpm test`, full coverage or release
matrix result. Those repository-wide certification boundaries remain; the
standalone Kanban browser gap is closed. No production process was restarted,
no existing task/evidence record was migrated, and no shared-checkout commit,
push or evidence cleanup was performed.
