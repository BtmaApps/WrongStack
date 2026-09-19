# Brain and Council review — 2026-09-19

## Architecture and scope

The shared `BrainRuntime` owns live configuration, tier assembly, decision cache,
rules and the ledger guard. CLI/TUI and WebUI hosts inject providers, persistence,
the event bus and human escalation. The Council Brain adapter converts a Brain
request into an orchestrator question; the orchestrator runs weighted seats,
deliberation, quorum/veto resolution and an optional judge. Plugins and the
Council tool also use the orchestrator.

The review followed runtime configuration, provider completion, arbitration,
telemetry and consumers in CLI, TUI, WebUI, SimpleUI and HQ. Changes target shared
behavior and concrete lifecycle defects rather than replacing the architecture.

## Corrections

| Boundary | Reproduced defect | Correction |
| --- | --- | --- |
| Decision replay | Similarity keys reused decisions across different subjects, amounts, contexts, sessions and option meanings. | Replay keys preserve exact decision inputs; ledger similarity grouping remains separate. |
| Live risk policy | Lowering the autonomy ceiling left cached approvals usable. | Every applied setting invalidates replay; decisions already in flight cannot repopulate an invalidated cache. |
| Persistence | Concurrent settings writes could finish in reverse order; synchronous writer failures escaped the documented result contract. | Capture each edit and serialize writes; report both synchronous and asynchronous failures without rolling back live settings or blocking later writes. |
| LLM lifecycle | A provider ignoring abort could block Brain/Council indefinitely. | Shared deadline wrapper settles on cancellation or per-call expiry, forwards abort and cleans up listeners/timers. Late results do not change the verdict or usage. |
| Deliberation evidence | Divergent open questions without a judge lost earlier rounds. | Preserve round history on abstention/failure envelopes. |
| Progress events | Council emitted all ballots only after the entire panel completed. | Publish each completed ballot during arbitration, once per seat per round. Observer failures do not change arbitration. |
| HQ attribution | Bridge-level session id replaced the originating event's session id. | Prefer event session, then request session, then host fallback. |
| HQ lifecycle | Answered prompts remained in the waiting count; failed councils without diversity warnings looked healthy. | Count the latest decision state per host/session/request and include unresolved/failed panel statuses in degradation counts. |
| SimpleUI lifecycle | Closing the panel lost pending answers; Brain operation errors left it thinking indefinitely. | Retain the answer subscription while hidden, handle Brain-specific failures, and prevent duplicate submissions while pending. |

## Behavioral limits

- Cancellation bounds the caller's wait and signals the provider. An injected
  provider that ignores abort may continue its own network work; the wrapper
  cannot forcibly terminate a third-party implementation.
- In-flight decisions retain their original execution context. Cache invalidation
  prevents their replay after a settings edit; it does not retroactively revoke
  a result already being produced for a caller.
- HQ waiting counts cover its retained event window, not a server-authoritative
  queue of every pending request.
- `brain.ask` now supports optional request correlation ids (third pass below).
  SimpleUI sends them and rejects mismatched replies. Untagged responses from
  older servers still use the legacy question/error matching behavior, which
  cannot distinguish repeated identical questions.
- No paid/live-provider decision, production deployment, browser viewport or
  interactive PTY verification is implied by the automated tests.

## Validation

- Fifteen initial regression cases failed before their corresponding fixes:
  replay identity/policy invalidation, persistence ordering/error handling,
  Council cancellation/deadlines/history and HQ session attribution.
- Root Brain/Council suites: **46 files, 827 tests passed**. This includes CLI,
  TUI, server routes, SimpleUI and HQ component/lifecycle tests.
- Dedicated WebUI suites: **3 files, 38 tests passed** with
  `pnpm --filter @wrongstack/webui exec vitest run brain council --reporter=dot`.
- After extracting persistence from the runtime, its **37 tests passed again**.
- Core, SimpleUI and HQ source TypeScript checks passed. Scoped Biome checks
  and whitespace validation passed.
- The focused root run used the repository configuration with one worker and
  global daemon teardown disabled in a temporary config. This prevents its
  cleanup from killing temporary project servers belonging to the concurrent
  full-suite run; no tests or assertions were removed.
- API and architecture measurements were refreshed with the repository
  generators against the shared working tree, including concurrent edits.
- Final test TypeScript gate: `newDiagnostics: []`, `unparsedFailures: []`.
  An earlier run saw five concurrent Kanban API diagnostics; those were absent
  in the final check after restoration.
- Full root suite: **44,832 passed, 4 failed, 35 skipped** (3,119 files).
  This is not a clean release result: another task temporarily stashed and
  restored the shared working tree while the suite ran. Three failing assertions
  exercised restored old Council/HQ code against the new tests. The fourth was
  an HQ mailbox 503/400 mismatch; an early focused run also reaped temporary
  project daemons during the full run. Council and HQ mailbox subsequently
  passed together (**69 tests**); the HQ bridge passed in the focused set.
  Brain/Council tests were rerun after the shared files returned.
- Generated architecture report conflicts from the concurrent stash restore
  were resolved by regenerating both reports, not by merging measured numbers.
- The final architecture report still lists concurrent hotspot drift in CLI
  execution, Kanban types and the session-Kanban tool. Brain runtime measurements
  match the regenerated baseline; no runtime dependency cycle was introduced.
- The root failure prevented `pnpm test` from reaching its chained full WebUI
  run. The separate 38-test WebUI result above is scoped, not full coverage.

## Second pass: live panels, replay and session switching

Ten additional regression cases failed before the surface fixes:

- WebUI retains a bounded per-session question buffer until the first vote,
  without creating empty Council rows for ordinary Brain decisions.
- WebUI and TUI count only the current round's completed seats and reject
  earlier-round ballots replayed over newer ballots.
- Timestamped WebUI events distinguish an actual new run from late ballots
  belonging to an already-resolved panel, including retries with the same seats.
  Old/duplicate resolutions cannot overwrite the current run, append duplicate
  chat cards or repeat warning toasts. Untimestamped legacy hosts retain the
  existing seat-based retry heuristic.
- TUI Council buffers use session plus request identity, preventing another
  session's panel from being attached after switching sessions.
- Seat rows show round numbers. Long model names are truncated with their full
  value in a tooltip, preserving the vote text on narrow screens.

Validation after all edits: **829 root Brain/Council tests + 134 WebUI tests
passed (963 total)**. WebUI and TUI source typechecks and scoped Biome checks
passed. The repository test-type gate had no new diagnostics in these changes;
it reported two concurrent Kanban test diagnostics (`advisory` versus
`assess | enforce | off`, and an unused `setTaskChain` import).

Real Chromium rendered the production `CouncilLogTimeline` through Vite and
processed synthetic events with the production `handleBrainEvent` handler.
At **1280×800 and 390×300**, checks passed for early question display, round-two
progress, stale replay, resolved-state retention, and switching between two
sessions using the same request id. Vote text remained visible beside a long
model id; document width matched viewport width and there were no page errors.
Screenshots/results are under `.temp_files/brain-round2-*`. This is a real
browser component/handler check, not a live-provider or server-WebSocket test.

Hashes of all seven changed source/test files were identical before and after
the final validation, ruling out the previous pass's shared-tree interference
for this result. This pass did not modify Core or rerun the full repository suite.

## Third pass: query correlation and delayed monitor lifecycle

Thirteen regression cases failed before their fixes:

- `brain.ask` accepts and validates an optional `requestId`. Success, validation
  failures, missing arbiters and thrown resolver/provider errors carry the id
  and the originating session. Both server hosts use the shared route factory.
- Internal Brain decision ids use UUIDs instead of millisecond timestamps;
  simultaneous requests cannot overwrite each other's decision identity, even
  if different callers supply the same correlation id.
- SimpleUI creates a new correlation id for each ask. A tagged old answer or
  error cannot resolve a pending newer ask or replace its completed answer.
  Existing clients and older untagged servers remain compatible.
- TUI checks nested request session metadata when an event envelope lacks it,
  captures the receiving session before scheduling a delayed monitor answer,
  and scopes monitor timers/deduplication by session plus request.
- WebUI transcript cards retain the Council judge label, whether the judge also
  voted, round count, changed-vote count and resolution timestamps. These were
  already retained in the panel store but lost when constructing chat messages.

Final validation: **842 root Brain/Council tests + 135 WebUI tests passed
(977 total)**. Source TypeScript checks passed for WebUI Server, WebUI, SimpleUI
and TUI. The repository test-type gate returned `newDiagnostics: []` and
`unparsedFailures: []`; scoped Biome and whitespace checks passed.

A new real loopback WebSocket test drives the production Brain routes with an
injected arbiter. Two identical questions complete in reverse order, one with
an error, while the host's active session changes. Both replies retain their
own session/request id, and a malformed third request is rejected with its
correlation intact. This verifies the transport/route boundary without calling
a live model or booting the full application server.

Source/test hashes were checked around final validation. Core and full-release
validation were not changed or rerun in this pass.

## Fourth pass: authoritative ballots after a failed deliberation round

The orchestrator already retained the last usable round when a later round
failed wholesale. The verdict was correct, but consumers retained each seat's
latest streamed ballot, so a successful fallback verdict appeared alongside
failed votes from the discarded round.

- `brain.council_resolved` now includes the authoritative ballots actually
  selected by arbitration. The live and final payloads share one mapper and
  the same content-capture policy; disabled trace content does not leak vote
  rationales through the new field.
- The orchestrator emits a structural warning when it retains an earlier round.
  Existing CLI/tool results, TUI, WebUI and HQ warning paths therefore expose
  the degraded deliberation instead of silently presenting a clean consensus.
- TUI uses final ballots when supplied, retaining compatibility with older
  emitters that provide only live votes.
- WebUI reconstructs the resolved panel from final ballots even if it missed
  the live stream. Older replayed ballots cannot replace those authoritative
  votes; a genuinely new run still starts normally. Chat cards consume the
  same panel state.
- Replay traces retain `talliedRound` alongside the complete streamed vote
  history, making the selected round machine-readable.

Focused validation: **844 root Brain/Council tests + 138 WebUI tests passed
(982 total)**. Core, TUI and WebUI source typechecks passed; the test-type gate
reported no new diagnostics. Chromium at **1280×800 and 390×300** verified both
the production timeline and chat card with first-round valid ballots followed
by second-round failures and replay. Both showed the selected first-round votes
and warning, with no page errors or horizontal document overflow.

The full repository test run started only after the production edits were
finished. It exposed two stale test contracts: the SimpleUI composer fixture
omitted the new request id, and the shared server harness pinned Kanban protocol
6 while the current implementation advertises 9. The fixtures were corrected
to validate correlation and the declared protocol, then passed separately
(7 and 28 tests). The complete WebUI suite passed: **396 files, 5,516 tests**.
The main repository run finished with **44,908 passed, 3 failed, 33 skipped**
across 3,131 files. Its only failures were those three stale fixture assertions;
both affected files passed after correction. The full root suite was not rerun
after changing those test expectations. All eleven primary source/regression
file hashes remained unchanged throughout the full run, unlike the first pass's
shared-tree interruption. This is full-suite evidence plus targeted fixture
rechecks, not a single all-green `release:check` run.
