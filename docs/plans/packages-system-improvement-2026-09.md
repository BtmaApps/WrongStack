# Package-by-package system improvement

Started: 2026-09-19. Scope: every package under `packages/`, with application
integration checks under `apps/`. This is an ongoing work ledger, not a claim
that the entire system has been reviewed.

## Working method

Review dependency providers before their consumers. For each package, inspect
its public contract, state ownership, cancellation and cleanup, error handling,
tests, and its connections to other packages. Fix demonstrated defects with
regressions before making structural changes. Performance changes require the
repository's measured baseline and comparison procedure. UI changes require
rendered desktop and short-mobile verification.

Work in the existing shared checkout and preserve concurrent edits. Passing
structural checks does not establish runtime correctness. Track partial review
and untested surfaces explicitly; do not mark a whole package complete after
one fix.

## Initial system baseline

The live architecture scan covered 36 workspace units: 34 `packages/` packages
and two `apps/` applications, with 3,850 source files and 3,512 test files.

| Check | Initial result |
| --- | --- |
| Architecture health | No reported errors; no package or runtime module cycles; nine type-only module cycles |
| Publishable package contracts | All 35 passed |
| Runtime test inventory | All 3,512 test files collected exactly once |
| Test skip budget | Passed; 115 existing declarations |
| Relative import boundaries | Zero offenders across 7,581 files |
| Translation keys | Seven locales match seven English namespaces |

Counts are observations from the shared checkout, not permanent targets.

## Review sequence and coverage

Rows 1–11 have received partial implementation-level review. Every listed
package/application now has at least one implementation-level pass plus the
explicitly listed consumer checks. The next phase is cross-package gate and
integration closure, followed by deeper second passes where risks remain.

| Order | Packages | Focus | Status |
| --- | --- | --- | --- |
| 1 | `primitives`, `persistence` | Shared helpers, atomic replacement, lock ownership, cleanup | Partial review; heartbeat ownership fixed; package tests passed |
| 2 | `core`, `runtime`, `governance` | Session ownership, execution lifecycle, cancellation, policy enforcement | Partial review; runtime/governance shutdown and concurrent core agent teardown fixed; scoped suites passed |
| 3 | `kanban`, `sage`, `vector-memory`, `requirement-intake`, `sdd` | Concurrent state, recovery, projections, durable workflows | Partial review across all five packages; lifecycle races, context routing, and storage boundaries repaired |
| 4 | `providers` | Profile isolation, switching, streaming, retries, quota handling | Partial review; SSE lifecycle and synchronous refresh failure handling fixed; provider suite passed |
| 5 | `tools`, `security-scanner`, `techstack`, `bench` | Tool contracts, result fidelity, process cleanup, measured workloads | Partial review across all four packages; cancellation, measurement/result fidelity, and report preservation fixed |
| 6 | `mcp`, `acp`, `plug-lsp`, `plugin-sdk`, `plugins` | Transport lifecycle, reconnect, cancellation, extension contracts | Partial review across all five packages; lifecycle, sandbox, watcher ownership, and extension-runtime contracts hardened |
| 7 | `codebase-index-mcp`, `kanban-mcp`, `mailbox-mcp`, `requirement-intake-mcp`, `sage-mcp` | Adapter parity and standalone server lifecycle | Partial review across all five adapters; request cancellation, watch/transport cleanup, and checkout ownership hardened |
| 8 | `webui-protocol`, `webui-server` | Event ordering, reconnect/replay, session isolation | Partial review across both packages; decoder bounds and connection ownership hardened |
| 9 | `cli`, `tui`, `webui`, `simpleui`, `webui-hq` | Consistent actions, accessibility, mobile layouts, real PTY/browser behavior | Partial review across all five packages; connection ownership, roster correlation, and cleanup hardened |
| 10 | `telegram`, `wrongtrace` | Integration lifecycle, delivery, diagnostics | Partial review across both packages; polling ownership and IPC correlation hardened |
| 11 | `apps/desktop`, `apps/wrongstack` | Packaged runtime and application integration | Partial review across both apps; Desktop IPC authority and published-shim lifecycle hardened |

This is review priority, not a replacement for the build dependency graph.

## Completed change: heartbeat ownership

`withFileLock` refreshed the current lock pathname. If stale recovery replaced
that pathname, the previous holder could refresh the replacement owner's lock,
delaying stale recovery for an unrelated holder. Heartbeats now call `utimes`
on the acquired file handle.

The existing ownership tests used `state.json.lock`, while production uses
`.state.json.lock`. They therefore passed without exercising the intended lock.
The tests now address the actual file, verify an acquired ownership token, and
check that heartbeat updates stay on the acquired file after pathname replacement.
The unused project-endpoint platform mutation was removed from those tests.

The new real-filesystem regression failed before the implementation change and
passed afterward on Windows. Foundation validation: 15 test files, 199 passing
tests, six existing skips. Kanban consumer validation: five files, 92 passing
tests. Core consumer validation: two files, 24 passing tests. Across these
runs, 315 tests passed and six existing cases were skipped. Persistence source
and test typechecks, scoped Biome checks, and `git diff --check` passed.

This change does not prove all stale-lock races are solved. The remaining
stat/recheck/unlink lifecycle, crash recovery, and extreme scheduling delays
still warrant separate review. Full repository tests, a clean rebuild, release
checks, Linux execution, and live UI verification have not been run in this pass.

Local diagnostic logs are under `.reports/`: `packages-health-initial.json`,
`lock-heartbeat-red.log`, `foundation-tests-final.log`, and
`persistence-consumers-final.log`. These are ignored session artifacts.

## Second pass: runtime lifecycle and governance shutdown

Three defects were reproduced with six failing regression cases before fixing
the implementation in `packages/runtime`:

1. An old applied-pack handle could unregister a newly reloaded pack when
   `teardown()` was called again. Concurrent calls also ran the teardown hook
   multiple times. Each handle now retains one cleanup promise, including a
   failed cleanup result, so it cannot replay destructive partial cleanup.
2. Governance bootstrap drained observations but not accepted workspace
   snapshot writes before revoking its grant or stopping its daemon. Pending
   snapshot writes are now tracked and drained for both attached and launched
   runtimes. New writes remain rejected once closing starts.
3. A failed remote detach was cached permanently by the bootstrap handle,
   preventing the underlying retryable cleanup from being called again.
   Failed close results now permit a subsequent explicit retry; successful
   closure remains idempotent and runtime writes stay closed between attempts.

The pack teardown promise and governance close retry have different semantics:
pack hooks may already have performed non-repeatable local cleanup, whereas
the governance compatibility layer explicitly supports remote close retries.
No automatic retry loop was introduced.

Validation on Windows:

- Runtime and governance suites: 47 files, 456 tests passed (initial run: 450).
- CLI governance mutation snapshot bridge: one file, seven tests passed.
- Runtime production typecheck passed.
- Authoritative test-type gate: 34 projects, zero new diagnostics. Existing
  baseline debt remains: 1,542 current diagnostics; this is not a clean raw
  test TypeScript build.
- Architecture health: no errors and no runtime module cycles.
- Scoped Biome checks and `git diff --check` passed.

Evidence: `.reports/runtime-lifecycle-red.log`,
`.reports/runtime-lifecycle-green.log`, `.reports/runtime-governance-final.log`,
`.reports/governance-bridge-final.log`, `.reports/packages-review-test-types.log`,
and `.reports/packages-health-round2.json`.

Core agent teardown/context hooks and governance transport/lease lifecycle
were inspected selectively, not exhaustively validated. No core or governance
source was modified in this pass. Remaining work includes agent cancellation,
concurrent agent teardown, registry override restoration, and daemon startup/
shutdown overlap. Full repository runtime tests, fresh distribution builds,
release checks, and live browser/PTY validation remain outstanding.

## Third pass: concurrent agent teardown

Two deterministic regressions demonstrated that simultaneous `Agent.teardown()`
calls ran the same plugin cleanup twice, both when cleanup succeeded and when
it failed. Concurrent callers now share one in-flight cleanup promise and the
same structured error. That promise is cleared after settlement so later cleanup
cycles can still drain newly registered agent hooks.

The tests also verify that agent-lifetime hooks run after plugin cleanup and
that failure does not prevent those hooks from running. Existing run-controller
and mid-tool subagent cancellation tests were included in the focused run:
three files, 63 passing tests.

Core production typecheck passed. The authoritative test-type gate reported
zero new diagnostics (existing baseline debt remains unchanged). Architecture
health reported no errors. The official Core API snapshot generator updated
only the source-line count; exported API names did not change. Scoped Biome
and whitespace checks passed.

Evidence: `.reports/agent-teardown-red.log`, `.reports/agent-lifecycle-green.log`,
`.reports/core-round3-typecheck.log`, `.reports/packages-round3-test-types.log`,
and `.reports/packages-health-round3.json`.

The full `pnpm test` command completed successfully (exit 0):

| Suite | Passing files | Passing tests | Skipped tests |
| --- | --- | --- | --- |
| Root Vitest | 3,106 (eight additional files skipped) | 44,767 | 33 |
| WebUI Vitest | 396 | 5,505 | 0 |
| Total | 3,502 | 50,272 | 33 |

The root suite took 820.79 seconds and WebUI took 146.79 seconds. Full output
is in `.reports/packages-round3-full-test.log`. This is the repository's
`pnpm test` command, not the separate release matrix, coverage gates, fresh
distribution build, or live browser/PTY validation. It does not establish
exhaustive cancellation or daemon lifecycle coverage.

## Fourth pass: run-owned session persistence

Three regressions switched the live session during `beforeRun`, response
middleware, and provider cancellation. All three initially failed: user input,
request/response records, checkpoints, and recovery markers could be written
to the newly selected session while the old run still owned the work.

The agent loop and response handler now capture the run-pinned writer before
their asynchronous boundaries. The conversation state's journal subscription
uses that same run owner. Keeping the regressions intact after fixing the
semantic request/response records exposed a second path: queued
`message_appended` projections still reached the wrong session.

The regressions now pass and also establish that state changes after the run
ends use the replacement session. They call real session writers, with spies
observing writes, and close both writers during cleanup.

Focused validation: three new regressions and 71 context/session projection
tests passed. Core production typecheck passed. The authoritative test-type
gate reported zero new diagnostics after the test response parameter was
explicitly typed. Scoped Biome and whitespace checks passed. The Core API
snapshot was regenerated using its official generator; only source-line
counts changed.

The shared checkout acquired concurrent SAGE edits during this pass. The first
architecture scan reported a SAGE hotspot increase (834 to 851 lines), and the
full test run initially recorded a failure in its new context-carry regression.
Those files were not changed by this session. Final verification results are
recorded below.

The root full-suite run completed with 44,772 passing tests, 33 skipped, and
one failure in the concurrently edited SAGE context-carry test. Its recorded
failure passed an invalid id to SQLite; the current SAGE file subsequently
passed all 21 tests without changes from this session. Because the root failure
short-circuited `pnpm test`, WebUI was started separately and passed: 396 files,
5,505 tests, exit 0 (147.58 seconds). This is not a single
all-green full-suite run of an immutable checkout.

The final architecture scan also observed concurrent changes outside this
slice: `security/yolo-risk.ts` grew from 952 to 960 lines, and the SAGE hygiene
file remained above its ratchet. Further Core edits made the API snapshot
stale again after this session's regeneration. Those unrelated ratchets were
not rebaselined. Overall architecture/release validation therefore remains
partial; the completed source and test-type checks above describe their own
run times, not every later concurrent edit.

Evidence: `.reports/session-affinity-red.log`,
`.reports/session-affinity-green.log`, `.reports/session-affinity-consumers.log`,
`.reports/packages-round4-test-types.log`, `.reports/packages-health-round4.json`,
and `.reports/packages-round4-full-test.log`.
The SAGE rerun is `.reports/round4-sage-recheck.log`, and the final architecture
scan is `.reports/packages-health-round4-final.json`.
WebUI output is `.reports/packages-round4-webui-test.log`.

## Fifth pass: close architecture and type-contract drift

Reviewed the two hotspot changes before accepting their growth: the yolo-risk
path predicate distinguishes legal `..hidden` names from parent traversal, and
SAGE hygiene both applies the same containment rule and rechecks tombstone
ownership/status inside its purge mutation. Their regression suites passed.
The path behavior was also validated across Core, CLI, Tools, and WebUI server.

Used `pnpm check:architecture:sync` and `pnpm report:architecture` to regenerate
the maintained evidence. Inspected the resulting diff: hotspot limits changed
only for the two reviewed files (952 -> 960 and 834 -> 851); test-only export
allowances did not change. Core API snapshot changes were source-line counts.
The subsequent no-write `pnpm check:architecture` passed with exit 0. This
supersedes the fourth pass's architecture blockers for this checked state.

The authoritative test-type gate then exposed a separate declaration mismatch
from the publication script: `resolveTarball` was exported by JavaScript and
imported by its regression test, but omitted from `publish-workspace.d.mts`.
Added its existing three-string-argument/string-return signature. No runtime
implementation change was needed; the existing publication suite passed.

Validation:

- Reviewed hotspot behavior: three files, 103 tests passed.
- Cross-package path behavior: seven files, 240 tests passed.
- Publication contract: one file, 31 tests passed.
- Total focused tests: 374 passed.
- Architecture check: passed, zero blocking errors.
- Test-type gate: 34 projects, zero new diagnostics; 1,542 historical
  diagnostics remain tracked by the existing baseline.
- Runtime test inventory: all 3,515 files collected exactly once.
- Skip budget: passed, 115 existing declarations.
- Scoped Biome and `git diff --check`: passed.

This pass modified generated architecture evidence and a script declaration,
not production implementation files. The full runtime suite was not repeated;
its fourth-pass result and successful follow-up checks remain recorded above.
Release, coverage, fresh package builds, and live UI checks remain separate.

Evidence is under `.reports/packages-round5-*`, including
`architecture-final.log`, `test-types-final.log`, `test-inventory.log`,
`reviewed-changes.log`, `cross-package.log`, and `publish-contract.log`.

## Sixth pass: provider registration ownership

Five runtime regressions demonstrated that pack teardown/setup rollback deleted
the provider type outright instead of restoring its prior factory. Removing
an older pack also deleted a newer pack's factory or an independent host
registration with the same type.

`ProviderRegistry.registerScoped()` now returns a cleanup function bound to one
registration. It restores the nearest still-active predecessor and supports
both reverse-order and out-of-order pack removal. Ordinary `register`,
`override`, and `unregister` supersede old scopes; cleanup never undoes those
independent changes, even when the same factory object is reused. Runtime
packs use these scoped registrations for both rollback and normal teardown.
Existing unscoped registry API behavior remains covered by its original tests.

Validation:

- Five new runtime cases failed before the fix and passed afterward.
- Registry and runtime-host suites: 36 tests passed, including four additional
  registry tests for repeated disposal, same-object replacement, and explicit
  removal.
- Full runtime package: 18 files, 225 tests passed (overlaps the host suite).
- Core and runtime builds and production typechecks passed.
- A smoke test imported both built packages, mounted an overriding provider,
  and verified restoration of the original provider on teardown.
- Authoritative test-type gate: zero new diagnostics; historical baseline
  debt is unchanged.
- No-write architecture check, scoped Biome, and `git diff --check` passed.
- Full `pnpm test`: exit 0. Root suite: 3,109 files passed, eight skipped;
  44,797 tests passed, 33 skipped (865.85 seconds). WebUI: 396 files and
  5,505 tests passed (148.08 seconds). Combined: 50,302 passing tests and
  33 skips, with no failures. This supersedes the fourth pass's interrupted
  full-command outcome for the state exercised by this run.

The full repository test command and final architecture check are tracked in
`.reports/packages-round6-full-test.log` and
`.reports/packages-round6-architecture-final.log`. Other evidence includes
`.reports/provider-lifecycle-red.log`, `.reports/provider-lifecycle-green.log`,
`.reports/provider-lifecycle-runtime-tests.log`, and
`.reports/packages-round6-test-types.log`.

This validates the repository test command plus the two affected package
builds. Full release/coverage gates and live provider-network/UI behavior
were not exercised in this pass.

## Seventh pass: host shutdown and failed-tool snapshots

Four failing regressions established two runtime defects:

1. `createRuntimeHostFromParts().shutdown()` called the supplied cleanup on
   every invocation. Concurrent requests and retries after synchronous throws
   or asynchronous rejections could repeat partially completed cleanup. The
   facade now retains one shutdown promise, including its failure, and all
   callers await that same completion. This is the exported composition API;
   it is not a claim that every CLI shutdown path uses this facade.
2. The governance mutation snapshot boundary ran its `finally` block after a
   downstream tool exception but inferred success from the original payload.
   It could record a successful-mutation snapshot despite the thrown tool
   failure. The boundary now requires downstream execution to resolve before
   classifying a mutation as successful, while preserving the original error.

Validation: all 19 runtime/CLI bridge test files passed (236 tests). Runtime
build and production typecheck passed. A smoke test against built Runtime
verified shared shutdown completion and exactly one cleanup. The authoritative
test-type gate reported zero new diagnostics; scoped Biome and whitespace
checks passed. Production changes in this pass were confined to Runtime, so
the full repository test command was not repeated.

The shared checkout has additional concurrent implementation edits. The
architecture scan reports five unrelated hotspot increases in Core boot,
Core collab-debug, Kanban verification context, the semver-bump plugin, and
the SAGE project server. These were not rebaselined in this pass; overall
architecture status is partial again for the current shared state.

Evidence: `.reports/runtime-shutdown-round7-red.log`,
`.reports/runtime-shutdown-round7-green.log`, `.reports/runtime-round7-build.log`,
`.reports/packages-round7-test-types.log`, and `.reports/packages-health-round7.json`.

## Eighth pass: governance startup versus shutdown

Two real IPC regressions reproduced a startup/shutdown race. Calling `close()`
while `start()` awaited filesystem or listener work could complete shutdown
first, then let startup reopen the endpoint and SQLite store. A concurrent
second `close()` could also resolve before the first cleanup finished.

The server now tracks its startup and shutdown promises, marks itself closing
immediately, and checks that startup is still permitted after each asynchronous
initialization boundary. Shutdown waits for startup to unwind and shares one
completion across callers. A cancelled startup rejects instead of becoming
ready after the host has already closed it.

The tests cover immediate close during filesystem startup and a paused startup
after the real listener binds. They verify closed storage and show that a new
server can bind the same endpoint after cleanup. The original two cases failed
before the patch and passed afterward on Windows.

Validation: 31 files / 259 tests passed across Governance and its runtime/CLI
bridges, including idle shutdown and authenticated IPC tests. Governance build
and production typecheck passed. The authoritative test-type gate reports zero
new diagnostics; scoped Biome and whitespace checks passed.

Changes are confined to Governance source and its IPC tests. The full monorepo
suite, Linux execution, and release gates were not repeated. Architecture
blockers from concurrent work remain tracked separately in the seventh pass;
this slice did not change their baselines.

Evidence: `.reports/governance-start-close-red.log`,
`.reports/governance-start-close-green.log`, `.reports/governance-round8-tests.log`,
`.reports/governance-round8-build.log`, and `.reports/packages-round8-test-types.log`.

## Ninth pass: mutation-boundary registration and deduplication

Three additional defects were reproduced in the governance mutation snapshot
bridge:

- A closed bridge could still install middleware on a new pipeline. Closed
  bridges now reject that work by leaving the pipeline unchanged.
- A middleware-name conflict was marked as a successful installation before
  registration completed. Even after removing the conflict, retry silently
  skipped installation. The pipeline is now marked installed only after
  registration succeeds, and repeated successful installation stays idempotent.
- A separate completion-order array retained already acknowledged tool ids.
  Reusing an id when that stale history rolled over deleted the new pending
  acknowledgement and generated a duplicate snapshot. A 513-call regression
  produced 514 captures before the fix. Set insertion order now tracks only
  outstanding acknowledgements; the same regression produces 513 captures.

An additional boundary test confirms that the existing 512-entry bound remains
in effect: the oldest outstanding acknowledgement is evicted while the newest
still suppresses its duplicate event. No new queue limit was introduced.

Validation: 19 files / 240 tests passed across Runtime and the CLI snapshot
bridge. Runtime build and production typecheck passed; the authoritative
test-type gate reported zero new diagnostics. Scoped Biome and whitespace
checks passed. Changes are confined to the runtime bridge and its
CLI integration tests; the full monorepo suite and live UI were not repeated.

Evidence: `.reports/governance-boundary-round9-red.log`,
`.reports/governance-dedup-round9-red.log`,
`.reports/governance-boundary-round9-final.log`, `.reports/runtime-round9-build.log`,
and `.reports/packages-round9-test-types.log`.

## Tenth pass: IPC request identity capture

The governance client serialized its request immediately but reread the caller's
mutable `requestId` only when the response arrived. Reusing that object for a
second request could reject a valid first response; changing it to a mismatched
reply id could also make the correlation check accept the wrong response.

Two real IPC regressions reproduced both directions before the fix. The client
now captures its expected id when the request is sent and retains that value
through asynchronous response processing. The tests exercise simultaneous
requests from a reused object and deliberately alter a server reply to verify
that mismatched ids remain rejected.

Validation: 31 files / 265 tests passed across Governance and its runtime/CLI
bridges. Governance build and production typecheck passed; scoped Biome and
whitespace checks passed. This pass changes only the governance client and its
IPC regression tests; full monorepo, release, and live UI checks were not repeated.

The authoritative test-type gate found three new diagnostics in the concurrently
edited `packages/core/tests/execution/council-orchestrator.test.ts`: one access
to possibly undefined `result.errors`, and two mock return types inferred as
`Promise<unknown>` instead of `Promise<OneShotLLMResult>`. No new Governance
diagnostics were reported. Those concurrent test edits were left intact, so
the overall test-type gate is currently blocked independently of this fix.

Evidence: `.reports/governance-request-round10-red.log`,
`.reports/governance-round10-tests.log`, `.reports/governance-round10-build.log`,
and `.reports/packages-round10-test-types.log`.

## Eleventh pass: provider stream reader cleanup

Rechecked the council diagnostics from the previous pass against the live
checkout: the concurrent work had already corrected them. The council suite
passed all 42 tests and the authoritative test-type gate returned zero new
diagnostics. No council edits were made in this pass.

Provider stream review found that the SSE parser cancelled its Web reader but
never released the reader lock. `cancel()` does not release that lock. Two
regressions proved that both normal completion and early consumer exit left
the input stream locked. The parser now explicitly releases the lock after
initiating cancellation. A third test confirms that a slow upstream cancellation
hook does not delay consumer exit or lock release.

The first attempt to run the mixed SSE/aggregation test file encountered a
temporary syntax error in a concurrently edited Core glob matcher. A separate
SSE lifecycle test module demonstrated the two actual failures directly. After
the unrelated edit settled, the complete provider suite also passed.

Validation: 75 provider test files passed, one skipped; 1,190 tests passed and
one was skipped. Provider build and production typecheck passed. The final
authoritative test-type gate again reported zero new diagnostics. Scoped Biome
and whitespace checks passed. This does not include live provider-network
testing or a new full monorepo/release run.

Evidence: `.reports/packages-round11-council-tests.log`,
`.reports/provider-stream-round11-red.log`, `.reports/provider-stream-round11-green.log`,
`.reports/providers-round11-tests.log`, `.reports/providers-round11-build.log`,
and `.reports/packages-round11-test-types-final.log`.

## Twelfth pass: legacy Node SSE premature close

The event-based Node stream fallback listened for `data`, `end`, and `error`,
but not `close`. A destroyed stream could therefore leave the parser waiting
forever. Two regressions reproduced this while waiting for an event and after
a previously yielded event. Two more reproduced streams that had already
closed or ended before parsing began.

The fallback now wakes on close and rejects premature termination with
`ERR_STREAM_PREMATURE_CLOSE`, preserving an original error when one preceded
the close. It recognizes an already-ended/destroyed stream and removes its
close listener along with the existing listeners during cleanup. Normal end
remains successful. Tests use real `PassThrough` streams with their async
iterator disabled to exercise this supported compatibility path directly.

Validation: 75 provider test files passed, one skipped; 1,196 tests passed and
one was skipped. Provider build and production typecheck passed. Scoped Biome
and whitespace checks passed. The change is confined to the provider parser
and lifecycle tests; no full monorepo, release, or live upstream run was made.

Evidence: `.reports/provider-close-round12-red.log`,
`.reports/provider-preclosed-round12-red.log`, `.reports/provider-close-round12-green.log`,
`.reports/providers-round12-tests.log`, `.reports/providers-round12-build.log`,
and `.reports/packages-round12-test-types.log`.

The authoritative test-type gate found one unrelated new diagnostic in the
concurrently edited `packages/kanban/tests/management.test.ts`: `advisory` is
not assignable to the supported `assess | enforce | off` mode union. Providers
had no new diagnostics. This prevents an overall clean test-type verdict for
the shared checkout; that concurrent test was not modified in this pass.

## Thirteenth pass: refresh setup errors and Kanban test contracts

The shared OAuth refresh helper returned a promise for asynchronous failures
but let a synchronous setup/validation throw escape directly. A regression
proved that this bypassed its shared-failure contract. Synchronous exceptions
are now converted into the same in-flight rejection used for asynchronous
failures. Concurrent callers share that error, the slot is released, and a
later refresh succeeds. Existing immediate invocation and caller cancellation
behavior are preserved.

Corrected the Kanban management fixture's unsupported `advisory` mode to the
current `assess` value. The subsequent type gate exposed missing tool execution
options in newly added management-flow tests. Their calls now use a typed
adapter forwarding `ctx.signal`. Concurrent work supplied the same adapter
while this repair was in progress; the final file uses that adapter for both
existing call styles instead of nesting incompatible signatures. The unused
Kanban import was removed by the concurrent work, not this session.

Validation:

- Provider package plus the then-current Kanban management suite: 1,204 tests
  passed and one skipped.
- Latest Kanban management and tool-flow rerun: 11 tests passed (overlaps the
  earlier management suite; do not sum these as distinct tests).
- Provider build and production typecheck passed.
- Final authoritative test-type gate: zero new diagnostics, historical debt
  unchanged at 1,542 current diagnostics.
- Scoped Biome and whitespace checks passed.

No Core production code changed in this pass. Full monorepo/release checks and
live OAuth token exchanges were not run.

Evidence: `.reports/oauth-round13-red.log`, `.reports/packages-round13-tests.log`,
`.reports/kanban-round13-tests.log`, `.reports/providers-round13-build.log`,
and `.reports/packages-round13-test-types-final.log`.

## Fourteenth pass: preserve accumulated tool arguments

The stream aggregator parsed buffered tool arguments only on `tool_use_stop`.
If a response ended without that individual stop event, its already received
arguments were silently replaced with `{}`. Two regressions reproduced loss
of a complete split JSON object and loss of unparseable raw data.

Final response construction now falls back to the existing tool-input decoder
when no explicit input was finalized. It preserves valid arguments, keeps
unrecoverable bytes in the existing `__raw` representation, and retains `{}`
for argument-free tools. Explicit stop input remains authoritative over earlier
deltas. A separate guard verifies that a thrown stream error still rejects
aggregation; buffered arguments do not turn a transport failure into success.

Provider build and production typecheck passed. Scoped Biome and whitespace
checks passed. The final provider suite passed 1,202 tests, with one existing
skip (75 files passed, one skipped).
The change is limited to Providers source and its tests; no full monorepo,
release, or live-provider run was performed.

Evidence: `.reports/provider-aggregate-round14-red.log`,
`.reports/provider-aggregate-round14-final.log`, `.reports/providers-round14-tests.log`,
`.reports/providers-round14-build.log`, and `.reports/packages-round14-test-types.log`.

The first post-test type scan briefly failed to resolve Kanban declarations
from SimpleUI. Those declarations were present on reinspection, and the
follow-up scan cleared the SimpleUI diagnostics. It instead reported two new
diagnostics in the concurrently changed WebUI server supervisor: its
`KanbanManagementState` type lacks `reviewCoverageVersion`. Providers had no
new diagnostics. Overall type validation therefore remains partial at this
checkpoint; see `.reports/packages-round14-test-types-final.log`.

## Fifteenth pass: SSE folding-transform ownership

The previously reported Kanban/WebUI declaration mismatch was resolved in the
live checkout; the initial test-type rerun had zero new diagnostics.

Three new regressions then showed that `createSseLineFoldingTransform` retained
its source reader lock on completion, consumer cancellation, and upstream read
failure. The transform now releases the reader on each terminal path. A
cancellation flag prevents a pending read from emitting or closing output after
the consumer has already cancelled it. Source errors and cancellation reasons
remain intact, and the partial line buffer is dropped on cancellation.

Validation: 75 provider files passed, one skipped; 1,205 tests passed and one
was skipped. Provider build and production typecheck, scoped Biome, and
whitespace checks passed. Full monorepo/release and live upstream runs were
not repeated.

The final authoritative test-type scan found a new unrelated fixture mismatch
in the concurrently edited `packages/tui/tests/use-brain-events.test.tsx`: its
event literal includes `votes`, which is absent from the current event type.
Providers had no new diagnostics; the overall test-type gate remains partial
at this later checkpoint.

Evidence: `.reports/packages-round15-test-types-initial.log`,
`.reports/provider-folding-round15-red.log`, `.reports/provider-folding-round15-green.log`,
`.reports/providers-round15-tests.log`, `.reports/providers-round15-build.log`,
and `.reports/packages-round15-test-types-final.log`.

## Sixteenth pass: Kanban IPC request cleanup

Returned to package order and inspected Kanban's client boundary while
preserving concurrent board-management work. Three real IPC regressions
demonstrated incomplete request cleanup:

- Closing the connection while `request()` resumed from the hello promise
  allowed it to allocate a pending entry, then dereference the cleared socket.
- A parameter serialization exception rejected the call but left its pending
  entry and timeout behind.
- A synchronous socket-write exception had the same orphaned-entry behavior.

The client now rechecks connection state after awaiting hello, serializes the
complete frame before allocating request resources, and clears both the
pending entry and timeout if socket writing throws. Original serialization
and write errors remain observable. The fixture binds a real local endpoint
and explicitly cleans any orphaned timers when exercising the pre-fix code.

Validation: all 71 Kanban test files passed (1,162 tests). Kanban build and
production typecheck passed. The authoritative test-type gate reported zero
new diagnostics. Scoped Biome and whitespace checks passed. Full monorepo,
release, Linux, and live UI checks were not repeated.

Evidence: `.reports/kanban-client-round16-red.log`,
`.reports/kanban-round16-tests.log`, `.reports/kanban-round16-build.log`, and
`.reports/packages-round16-test-types.log`. The next package review is SAGE;
this pass is not an exhaustive certification of every Kanban subsystem.

## Seventeenth pass: SAGE request rejection and cancellation

Four fault-injection regressions reproduced SAGE client cleanup failures:
serialization and synchronous write exceptions left pending state behind, while
an exception sending the timeout/abort notification removed the pending entry
without cleaning it or settling its caller.

Request rejection now has one local cleanup path: remove the entry, clear its
timer and abort listener, optionally notify the daemon, and reject with the
original send/cancellation/timeout error. Cancellation notification is
best-effort; its transport failure cannot prevent local settlement. Tests use
the real request path with an injected socket, matching the existing SAGE
client test approach.

Validation: all 101 SAGE files passed (1,178 tests), including existing client
behavior, write-buffer bounds, request-id wrap, storage, and server tests.
SAGE build and production typecheck passed. The authoritative test-type gate
reported zero new diagnostics; scoped Biome and whitespace checks passed.
No full monorepo, release, or live UI validation was repeated.

Evidence: `.reports/sage-client-round17-red.log`,
`.reports/sage-client-round17-green.log`, `.reports/sage-round17-tests.log`,
`.reports/sage-round17-build.log`, and `.reports/packages-round17-test-types.log`.
The next package in order is vector-memory. This remains a partial SAGE review,
not an exhaustive certification of all memory and retrieval behavior.

## Eighteenth pass: vector-memory mirror disposal

Two regressions reproduced store operations starting after the SAGE mirror
subscription was disposed: a queued delete and a write waiting for its SAGE
read. Removing event listeners alone did not cancel already scheduled work.

The subscription now tracks disposal, skips queued handlers, and rechecks
after asynchronous reads and deletion before starting a replacement write.
Already-started store operations may still finish; this synchronous disposer
does not drain or cancel database operations. Existing per-memory ordering is
preserved. The pre-existing concurrent change in `store.ts` was untouched.

Evidence: `.reports/vector-round18-red.log` records both failing regressions.
The first full package run passed 135 tests but one worker exited unexpectedly
in `sage-fusion.test.ts`; it is not counted as a passing package gate.
Final validation is recorded below. The next package is requirement-intake.

Final validation: the complete package suite rerun with `--maxWorkers=1`
passed 18 files and 145 tests, with one existing skipped file / four skipped
tests. After completing the typed event fixtures, the focused lifecycle suite
passed all seven tests again. Package build and production typecheck passed;
the authoritative test-type gate reported zero new diagnostics. Scoped Biome
and whitespace checks passed. Full monorepo, release, live UI, and opt-in model
integration checks were not repeated.

Logs: `.reports/vector-round18-tests-serial.log`,
`.reports/vector-round18-green.log`, `.reports/vector-round18-build.log`,
`.reports/vector-round18-typecheck.log`, and
`.reports/packages-round18-test-types.log`.

## Nineteenth pass: requirement-intake idempotency races and record paths

Forced concurrent preflight misses demonstrated that the store correctly
returned one created result and one idempotent result, while the service
reported both calls as fresh creations. It emitted two creation events,
incremented the creation metric twice, and skipped the duplicate metric. The
same race across projects could return the winning project's record to the
losing caller because the service did not recheck ownership after the store's
authoritative idempotency decision.

The service now classifies the final store result, records a duplicate for a
same-project loser, and validates the winning record's project before returning
it. Two deterministic barrier-based regressions cover same-project reporting
and cross-project isolation.

The file store also accepted path separators in public record ids. A regression
proved that `load()` could read a JSON file above the intake directory. Record
paths now accept only letters, numbers, underscores, and hyphens with a bounded
length, so load, exists, create, and update share the same containment rule.

Validation: all 10 requirement-intake test files passed (220 tests). Package
build and production typecheck passed. The authoritative test-type gate
reported zero new diagnostics; scoped Biome and whitespace checks passed. Full
monorepo, release, MCP adapter, and live host checks were not repeated.

Evidence: `.reports/requirement-intake-round19-red.log`,
`.reports/requirement-intake-round19-path-red.log`,
`.reports/requirement-intake-round19-focused.log`,
`.reports/requirement-intake-round19-tests.log`,
`.reports/requirement-intake-round19-build.log`,
`.reports/requirement-intake-round19-typecheck.log`, and
`.reports/packages-round19-test-types.log`. The next package in order is SDD;
this remains a partial review rather than a complete certification of all
intake and adapter behavior.

## Twentieth pass: SDD persistence ordering and intake context

A concurrent board-delete regression proved that two removals read the same
index and each wrote a different stale copy, resurrecting one deleted run. The
index removal path now uses the same file lock as snapshot updates, preserving
both removals across processes and concurrent callers.

The Kanban-backed interview persistence serialized saves but did not put
`delete()` on that mutation chain. A save begun while deletion was in flight
could reach the daemon before deletion completed and be erased based on network
completion order. Deletion now occupies the shared chain, so later saves run
after it and create the intended new state.

The requirement-intake bridge computed business goals, outcomes, target users,
constraints, and supplied context but dropped that string when starting the
SDD driver. The optional per-interview context now flows through the driver and
spec builder into the first questioning prompt. A later plain interview resets
to the driver's configured default context, preventing prior intake facts from
leaking between sessions.

Validation: all 39 SDD test files passed (687 tests). Package build and
production typecheck passed. The authoritative test-type gate reported zero
new diagnostics; scoped Biome and whitespace checks passed. Full monorepo,
release, live Kanban daemon, and UI checks were not repeated. Concurrent
pre-existing containment edits in `spec-store.ts`, `task-graph-store.ts`, and
their test were preserved and were not attributed to this pass.

Evidence: `.reports/sdd-round20-index-red.log`,
`.reports/sdd-round20-session-red.log`, `.reports/sdd-round20-intake-red.log`,
`.reports/sdd-round20-focused.log`, `.reports/sdd-round20-tests.log`,
`.reports/sdd-round20-build.log`, `.reports/sdd-round20-typecheck.log`, and
`.reports/packages-round20-test-types.log`. The next package in order is
`tools`; this remains a partial SDD review rather than a complete certification
of every execution, worktree, daemon, and UI path.

## Twenty-first pass: tools cancellation and HTTP cleanup

The shared streaming command runner spawned and registered a child even when
its abort signal was already cancelled, then attempted to kill it. A regression
observed the unwanted process registration. It now returns cancellation code
124 before resolving or spawning the command, avoiding command side effects
after cancellation. Existing running-process cancellation remains unchanged.

Three real local HTTP regressions demonstrated that fetch left the response
connection open after rejecting binary content or when its caller abandoned
the generator at the HTTP headers or partial-output yield. Releasing a reader
and clearing the timeout did not stop the download. Finalization now aborts
the request's internal controller, covering all three paths without requiring
the caller to separately abort its own signal.

The first complete tools run passed 262 files / 3,723 tests but failed one
dist-based index IPC test because this pass rebuilt tools concurrently with
the tests. The error was a missing built project-server file during replacement;
teardown also reported a disconnected-client rejection. After the build ended,
the IPC and updated HTTP suites passed together (nine tests). A fresh complete
suite is run without concurrent builds for the final result below.

Evidence: `.reports/tools-round21-red.log`,
`.reports/tools-round21-fetch-red.log`, `.reports/tools-round21-focused.log`,
`.reports/tools-round21-tests.log`, and `.reports/tools-round21-recheck.log`.
The next package is security-scanner. This is a partial tools review; existing
concurrent language, Kanban, and file-tool changes were preserved.

Final validation: the complete tools suite passed all 263 files (3,726 tests,
eight runtime skips) without concurrent builds. Tools build and production
typecheck passed; the authoritative test-type gate reported zero new
diagnostics. Scoped Biome and whitespace checks passed. No full monorepo,
release, Linux/macOS, or live UI validation was performed this round.
Final logs: `.reports/tools-round21-tests-final.log`,
`.reports/tools-round21-build.log`, `.reports/tools-round21-typecheck.log`, and
`.reports/packages-round21-test-types.log`.

## Twenty-second pass: security-scanner completeness and report preservation

The static scanner accepted a non-finite `fileConcurrency` through its public
constructor. `NaN` poisoned the batching loop, which returned a successful scan
with zero scanned files and no findings even when a matching vulnerable file
was present. Non-finite values now fall back to the package default; finite
values retain the existing lower bound of one worker.

Both report writers named files only to the nearest second. Concurrent scans in
the same second returned the same path and silently overwrote one report. A
shared filename helper now keeps the readable timestamp and adds a short UUID,
so the direct generator and orchestrator writer preserve every report. A
parallel regression verifies that both paths and contents remain distinct.

Validation: all 27 security-scanner test files passed (290 tests). Package
build and production typecheck passed. The authoritative test-type gate
reported zero new diagnostics; scoped Biome and whitespace checks passed. Full
monorepo, release, live provider, package-registry audit, and UI checks were not
repeated.

Evidence: `.reports/security-scanner-round22-red.log`,
`.reports/security-scanner-round22-report-red.log`,
`.reports/security-scanner-round22-focused.log`,
`.reports/security-scanner-round22-tests.log`,
`.reports/security-scanner-round22-build.log`,
`.reports/security-scanner-round22-typecheck.log`, and
`.reports/packages-round22-test-types.log`. The next package in order is
`techstack`; this remains a partial scanner review rather than a complete
security assessment of every supported ecosystem.

## Twenty-third pass: techstack registry ordering and cancellation

The NuGet and Packagist registry parsers selected their latest stable release
with lexical string comparison. Multi-digit majors therefore regressed:
`9.0.0` was considered newer than `10.0.0`, including Composer's common
`v10.0.0` form. Both parsers now share the package's numeric semver comparison,
with a leading `v` normalized for registry metadata. Real response-shape
regressions cover both ecosystems.

The public batch lookup also swallowed a pre-aborted signal and returned a map
whose entries all looked like missing registry data. Lookup now checks
cancellation before cache/network work, and the batch error boundary propagates
abort instead of converting it to `undefined`. The regression verifies that no
HTTP request starts after pre-cancellation.

Validation: all 37 techstack test files passed (610 tests). Package build and
production typecheck passed. The authoritative test-type gate reported zero
new diagnostics; scoped Biome and whitespace checks passed. Full monorepo,
release, and live external registry checks were not repeated.

Evidence: `.reports/techstack-round23-nuget-red.log`,
`.reports/techstack-round23-abort-red.log`,
`.reports/techstack-round23-composer-red.log`,
`.reports/techstack-round23-focused.log`, `.reports/techstack-round23-tests.log`,
`.reports/techstack-round23-build.log`,
`.reports/techstack-round23-typecheck.log`, and
`.reports/packages-round23-test-types.log`. The next package in order is
`bench`; this remains a partial registry/client review rather than an exhaustive
audit of every ecosystem adapter and advisory source.

## Twenty-fourth pass: benchmark scheduling and monotonic timing

The exported concurrency mapper accepted `NaN`, created zero workers, and
returned an array whose work was never executed. A benchmark caller bypassing
config parsing could therefore produce incomplete results without an error.
Non-finite concurrency now falls back to one worker; finite values are floored
and retain the existing lower and upper bounds.

Per-run elapsed time used `Date.now()`. A system clock correction during an
agent run produced negative wall time and corrupted latency comparisons. The
runner now measures elapsed duration with Node's monotonic performance clock.
A regression explicitly moves the wall clock backwards while a real child
process completes and verifies a non-negative duration.

Validation: all 52 bench test files passed (338 tests). Package build and
production typecheck passed. The authoritative test-type gate reported zero
new diagnostics; scoped Biome and whitespace checks passed. These are
correctness repairs, so no performance improvement is claimed and no benchmark
delta was manufactured. Full monorepo and release checks were not repeated.
The pre-existing concurrent `local-manifest-grader.ts` containment edit was
preserved and is not attributed to this pass.

Evidence: `.reports/bench-round24-concurrency-red.log`,
`.reports/bench-round24-clock-red.log`, `.reports/bench-round24-focused.log`,
`.reports/bench-round24-tests.log`, `.reports/bench-round24-build.log`,
`.reports/bench-round24-typecheck.log`, and
`.reports/packages-round24-test-types.log`. The next package in order is `mcp`;
this remains a partial bench review rather than a certification of every suite
against live models and external benchmark datasets.

## Twenty-fifth pass: MCP server conformance and cancellation

The server accepted requests that omitted `jsonrpc: "2.0"`, declared another
protocol version, or used an object request id. It dispatched those invalid
envelopes to the tool host instead of returning JSON-RPC `-32600`. Envelope and
id validation now runs before notification/request dispatch, and regressions
verify the host is never called for invalid requests.

WrongStack's MCP client already sends `notifications/cancelled`, but its server
role discarded every notification without acting on it. The server now tracks
in-flight request controllers by JSON-RPC id, forwards an optional AbortSignal
to tool hosts, and aborts the matching call when the cancellation notification
arrives. The host API addition is optional and remains source-compatible with
existing two-argument implementations. Cancellation reasons are bounded before
being surfaced in the request's error response.

Validation: all 39 MCP test files passed (687 tests). Package build and the
package's test-aware typecheck passed. The authoritative workspace test-type
gate reported zero new diagnostics; scoped Biome and whitespace checks passed.
Full monorepo, release, and official third-party MCP peer checks were not
repeated. Concurrent pre-existing `manage.ts` changes and their tests were
preserved and are not attributed to this pass.

Evidence: `.reports/mcp-round25-jsonrpc-red.log`,
`.reports/mcp-round25-jsonrpc-green.log`, `.reports/mcp-round25-cancel-red.log`,
`.reports/mcp-round25-focused.log`, `.reports/mcp-round25-tests.log`,
`.reports/mcp-round25-build.log`, `.reports/mcp-round25-typecheck.log`, and
`.reports/packages-round25-test-types.log`. The next package in order is `acp`;
this remains a partial MCP review rather than a complete interoperability
certification across every external client and server.

## Twenty-sixth pass: ACP client transport claiming and request ids

`ClientTransport.onMessageClaim()` registered handlers but inbound dispatch
never invoked them. A consumer attempting exclusive correlation therefore saw
the message remain in the optional read queue. Client transport dispatch now
runs claim handlers before queueing, isolates handler failures, and prevents a
claimed message from being retained. Existing observer behavior remains intact;
child-close teardown now clears claim handlers as well.

The ACP client session allocated numeric JSON-RPC ids with unbounded `number++`.
After `Number.MAX_SAFE_INTEGER`, ids lose precision and can overwrite a pending
low-numbered request after rollover. Allocation now wraps safely to one and
probes past ids still present in the pending map. A regression pins rollover
while id 1 remains occupied.

Validation: all 41 ACP test files passed (749 tests, one existing skip).
Package build and production typecheck passed; scoped Biome and whitespace
checks passed. The authoritative workspace test-type gate was blocked by one
unrelated concurrent diagnostic in
`packages/kanban/tests/verification-context-edge.test.ts` (a `KanbanBoard`
fixture missing required `updatedAt`); ACP introduced no reported diagnostic.
Full monorepo, release, editor UI, and fresh official-SDK peer runs were not
repeated this round.

Evidence: `.reports/acp-round26-claim-red.log`,
`.reports/acp-round26-id-red.log`, `.reports/acp-round26-focused.log`,
`.reports/acp-round26-tests.log`, `.reports/acp-round26-build.log`,
`.reports/acp-round26-typecheck.log`, and
`.reports/packages-round26-test-types.log`. The next package in order is
`plug-lsp`; this remains a partial ACP lifecycle review rather than a renewed
end-to-end interoperability certification.

## Twenty-seventh pass: LSP request lifecycle and registry rebinding

Timed-out LSP requests were removed from the local pending map but continued
running in the language server. The connection now sends the protocol's
`$/cancelRequest` notification for both caller cancellation and request
timeouts, so expensive symbol and reference work does not keep occupying the
server after the caller has stopped waiting.

Numeric JSON-RPC request ids previously advanced past JavaScript's safe integer
boundary, where distinct requests can serialize with the same id and overwrite
pending correlation state. Allocation now wraps at `Number.MAX_SAFE_INTEGER`
and skips ids still owned by in-flight requests. Regressions pin the boundary
while id 1 remains pending and verify the next safe free id is selected.

Rebinding an LSP registry cleared its server map without stopping mounted child
processes. Rebind now shuts down existing servers before rebuilding the map and
clears reconnect attempt history, preventing orphan processes and preventing a
new workspace from inheriting the prior workspace's exhausted retry budget.

Validation: all 45 active plug-lsp test files passed (293 tests, one existing
skipped file/test). Package build and production typecheck passed; scoped Biome
and whitespace checks passed. The authoritative workspace test-type gate still
reports one unrelated concurrent diagnostic in
`packages/kanban/tests/verification-context-edge.test.ts` (a `KanbanBoard`
fixture missing required `updatedAt`); plug-lsp introduced no reported
diagnostic. Full monorepo and release checks were not repeated. Concurrent
pre-existing edits in `src/tools/workspace-edit.ts` and
`src/utils/command-resolver.ts` were preserved and are not attributed to this
pass.

Evidence: `.reports/plug-lsp-round27-tests.log`,
`.reports/plug-lsp-round27-build.log`,
`.reports/plug-lsp-round27-typecheck.log`, and
`.reports/packages-round27-test-types.log`. The next package in order is
`plugin-sdk`; this remains a partial plug-lsp lifecycle review rather than a
fresh interoperability certification against every external language server.

## Twenty-eighth pass: plugin SDK bounds and canonical runtime paths

`BoundedMap` accepts any JavaScript key, but its eviction loop treated an
`undefined` key as an exhausted iterator. A map capped at one entry could
therefore retain two entries and violate the SDK's advertised hard bound.
Eviction now checks the iterator's `done` flag, keeping `undefined` as a valid
key and preserving accurate eviction metrics.

`runRunnerCommand` validated a relative `cwd` against `projectRoot` but passed
the original relative string to `execFile`, which resolves it against the host
process directory. A command could fail or run in an unintended same-named
directory. The helper now passes the absolute path resolved from the declared
project root.

`safePath` canonicalized candidate paths but compared them with an
uncanonicalized project root. Projects reached through a symlink or Windows
junction consequently rejected their own files. The sandbox now canonicalizes
both sides while retaining a lexical pre-check for relative traversal.

`resolveNodeBin` trusted lexical containment of a package manifest's `bin`
entry and did not require the entry to exist. It now resolves the package and
entry paths canonically, requires a real file, and rechecks containment. This
rejects stale manifests and prevents a package-local symlink or junction from
redirecting Node to JavaScript outside that package.

Validation: all four plugin-sdk test files passed (33 tests). Production and
test-project typechecks, package build, scoped Biome, whitespace checks, and all
35 publishable package-contract checks passed. The authoritative workspace
test-type gate still reports one unrelated concurrent diagnostic in
`packages/kanban/tests/verification-context-edge.test.ts` (a `KanbanBoard`
fixture missing required `updatedAt`); plugin-sdk introduced no reported
diagnostic. The concurrent pre-existing ReDoS timing adjustments in
`tests/runtime-guards.test.ts` were preserved and are not attributed to this
pass. Full monorepo and release checks were not repeated.

Evidence: `.reports/plugin-sdk-round28-tests.log`,
`.reports/plugin-sdk-round28-typecheck.log`,
`.reports/plugin-sdk-round28-build.log`,
`.reports/plugin-sdk-round28-package-contracts.log`, and
`.reports/packages-round28-test-types.log`. The next package in order is
`plugins`; this remains a partial SDK runtime review rather than an exhaustive
audit of every third-party plugin integration.

## Twenty-ninth pass: plugin watcher ownership and scheduler bounds

Stopping a `file-watcher` watch cleared its primary change debounce but left a
second auto-index debounce under an unrelated key. The stopped watch could
therefore enqueue indexing work after its filesystem handles were closed.
Auto-index timers now carry the owning watch id, so `watch_stop` cancels the
entire pending chain. The tool boundary also validates every path element as a
non-empty string before calling path or filesystem APIs; malformed raw input
now produces a stable validation error instead of a Node type exception.

The cron plugin trusted `maxConcurrentJobs` as a finite integer. A programmatic
configuration containing `NaN` made every `jobs.size >= maxConcurrent` check
false and silently removed the scheduler's job bound; fractional and negative
values also produced surprising limits. Configuration now defaults non-finite
values to five and normalizes finite values to an integer of at least one.

A package-wide lifecycle scan compared every hook, extension, event-pattern,
and config registration site with teardown/disposer markers. No additional
registration file lacked a disposal path. Typed manifest projections also
matched the official manifest and package exports.

Validation: all 113 plugins test files passed (2,566 tests, two existing
skips). Package typecheck, build, scoped Biome, whitespace checks, and the
plugin manifest/projection gate passed. The authoritative workspace test-type
gate still reports one unrelated concurrent diagnostic in
`packages/kanban/tests/verification-context-edge.test.ts` (a `KanbanBoard`
fixture missing required `updatedAt`); plugins introduced no reported
diagnostic. Full monorepo and release checks were not repeated. Twelve
pre-existing concurrent plugin source edits and the existing
`tests/runtime-guards.test.ts` edit were preserved and are not attributed to
this pass.

Evidence: `.reports/plugins-round29-tests.log`,
`.reports/plugins-round29-typecheck.log`, `.reports/plugins-round29-build.log`,
`.reports/plugins-round29-manifest.log`, and
`.reports/packages-round29-test-types.log`. The next package in order is
`codebase-index-mcp`; this remains a partial plugin lifecycle review rather
than a behavioral certification of every external command and service used by
all official plugins.

## Thirtieth pass: Codebase Index MCP cancellation and checkout identity

The shared MCP server now supplies an AbortSignal for every in-flight tool
request, but the Codebase Index adapter ignored the call options and created a
new never-aborted signal. Client `notifications/cancelled` messages therefore
stopped waiting locally while search or index work continued. The adapter now
forwards the request signal to canonical tools and all three graph IPC calls.
The graph service wrappers in `@wrongstack/tools` accept the optional signal
and pass it into the existing cancellable IPC request path. A JSON-RPC
regression starts a real adapter request, cancels request id 7, and observes the
running tool signal abort with the client's reason.

The CLI also consumed a following short option such as `-h` as the value of
`--project-root`; all leading-dash tokens now remain options when a value is
missing.

Codebase Index used `canonicalProjectRoot` for the checkout it serves. That
helper intentionally merges linked Git worktrees for global WrongStack state,
but Codebase Index storage explicitly belongs to the physical checkout because
worktrees can contain different source. The CLI now canonicalizes filesystem
aliases with `realpath` while retaining a linked worktree as its own index root.
A synthetic linked-worktree regression proves it no longer resolves to the
main checkout.

Validation: all five Codebase Index MCP test files passed (19 tests), with
package production/test typechecks and build passing. The changed Tools
provider passed all 263 test files (3,725 tests, nine existing skips), package
typecheck, and build. Scoped Biome, whitespace checks, and all 35 publishable
package-contract checks passed. The authoritative workspace test-type gate
still reports one unrelated concurrent diagnostic in
`packages/kanban/tests/verification-context-edge.test.ts` (a `KanbanBoard`
fixture missing required `updatedAt`); Codebase Index MCP and Tools introduced
no reported diagnostic. Full monorepo, release, and live external MCP-client
checks were not repeated. A concurrent package-version bump to `1.0.23` was
preserved and is not attributed to this pass.

Evidence: `.reports/codebase-index-mcp-round30-tests.log`,
`.reports/codebase-index-mcp-round30-typecheck.log`,
`.reports/codebase-index-mcp-round30-build.log`,
`.reports/codebase-index-mcp-round30-tools-tests.log`,
`.reports/codebase-index-mcp-round30-tools-typecheck.log`,
`.reports/codebase-index-mcp-round30-tools-build.log`,
`.reports/codebase-index-mcp-round30-package-contracts.log`, and
`.reports/packages-round30-test-types.log`. The next package in order is
`kanban-mcp`; this remains a partial adapter/lifecycle review rather than a
complete certification against every third-party MCP client.

## Thirty-first pass: Kanban MCP cancellation and watch cleanup

The Kanban adapter discarded the AbortSignal supplied by the MCP server and
created a fresh signal for every tool execution. Cancelled clients therefore
left board operations running. The adapter now forwards the request signal to
the canonical Kanban tool.

`kanban_watch` also ignored cancellation. A cancelled long poll retained both
daemon listeners and its timer until an event, disconnect, or the 25-second
maximum timeout. Watch cancellation now rejects immediately with the client's
reason, removes the abort listener, clears the timer, and releases both daemon
subscriptions. A pre-cancelled request returns before acquiring an IPC
connection. The setup order also handles a defensive synchronous subscription
callback without abandoning the returned disposer, and watch timers are
unreferenced so an idle long poll cannot keep the process alive by itself.

The CLI previously resolved a missing `--project-root` value to a literal next
option such as `--writable`, silently consuming the permission flag. Other
value-taking flags had the same shape, and `--port` accepted values beyond the
TCP range. Parsing now preserves following options, emits structured warnings,
and accepts only integer ports from 0 through 65535.

Validation: all five Kanban MCP test files passed (24 tests), including the
real project-server IPC full-access test. Package production/test typechecks,
build, scoped Biome, whitespace checks, and all 35 publishable package-contract
checks passed. The authoritative workspace test-type gate still reports one
unrelated concurrent diagnostic in
`packages/kanban/tests/verification-context-edge.test.ts` (a `KanbanBoard`
fixture missing required `updatedAt`); Kanban MCP introduced no reported
diagnostic. Full monorepo and release checks were not repeated. Concurrent
`policy.ts` management-action work, Kanban domain changes, and package-version
bumps were preserved and are not attributed to this pass.

Evidence: `.reports/kanban-mcp-round31-tests.log`,
`.reports/kanban-mcp-round31-typecheck.log`,
`.reports/kanban-mcp-round31-build.log`,
`.reports/kanban-mcp-round31-package-contracts.log`, and
`.reports/packages-round31-test-types.log`. The next package in order is
`mailbox-mcp`; this remains a partial adapter/lifecycle review rather than a
complete certification against every third-party MCP client.

## Thirty-second pass: Mailbox MCP watch and transport lifecycle

`mailbox_watch` ignored the MCP request AbortSignal, so a cancelled long poll
retained its event subscription and timer until an event or the 25-second
maximum timeout. Watch cancellation now rejects immediately with the client's
reason, removes the abort listener, unsubscribes from the Mailbox emitter, and
clears an unreferenced timeout. A request cancelled before dispatch is rejected
before any Mailbox query or mutation begins.

The standalone CLI closed its RemoteMailbox only after a successful transport
completion. A rejected stdio `done`, failed HTTP startup, or HTTP close failure
left the project connection and heartbeat resources open. Transport ownership
now uses nested `finally` blocks: HTTP handles close when acquired, Mailbox
always closes after initialization, and the paired SIGINT/SIGTERM listeners are
removed together after the first shutdown signal.

Value-taking CLI flags previously consumed a following option when their value
was missing, allowing `--project-root --admin` to turn the permission flag into
a path and silently leave admin mode disabled. Parsing now preserves following
options, emits structured warnings, and limits HTTP ports to integers from 0
through 65535.

Validation: all eight Mailbox MCP test files passed (32 tests), including stdio
and full-access project-server IPC coverage. Package production/test
typechecks, build, scoped Biome, whitespace checks, and all 35 publishable
package-contract checks passed. The authoritative workspace test-type gate
still reports one unrelated concurrent diagnostic in
`packages/kanban/tests/verification-context-edge.test.ts` (a `KanbanBoard`
fixture missing required `updatedAt`); Mailbox MCP introduced no reported
diagnostic. Full monorepo and release checks were not repeated. The concurrent
package-version bump was preserved and is not attributed to this pass.

Remaining boundary: RemoteMailbox operations already in flight cannot yet be
cooperatively cancelled because the current Mailbox interface and IPC client
methods do not accept AbortSignal. This pass prevents pre-cancelled operations
from starting and fully cancels the event-emitter watch path; it does not claim
to stop a mutation after the daemon has accepted it.

Evidence: `.reports/mailbox-mcp-round32-tests.log`,
`.reports/mailbox-mcp-round32-typecheck.log`,
`.reports/mailbox-mcp-round32-build.log`,
`.reports/mailbox-mcp-round32-package-contracts.log`, and
`.reports/packages-round32-test-types.log`. The next package in order is
`requirement-intake-mcp`; this remains a partial adapter/lifecycle review rather
than a complete certification against every third-party MCP client.

## Thirty-third pass: Requirement Intake MCP cancellation boundary

The Requirement Intake adapter ignored MCP request cancellation entirely. A
request already cancelled before dispatch still resolved project identity and
could create and submit a durable intake record. The host now rejects a
pre-cancelled request before identity or service access. It checks again after
the asynchronous identity lookup, which closes the final safe cancellation
window before any record is written.

The second check deliberately precedes the two-step `createIntake` plus
`submitIntake` sequence. Once creation starts, the adapter completes submission
instead of turning cancellation into a hidden draft record. The underlying
Requirement Intake service does not currently accept AbortSignal, so this pass
does not claim mid-operation cooperative cancellation.

Value-taking CLI flags previously consumed a following option when their value
was missing, allowing `--project-root --writable` to turn the permission flag
into a path and leave the writable tool hidden. Parsing now preserves following
options, emits structured warnings, and accepts only integer HTTP ports from 0
through 65535.

Validation: all three Requirement Intake MCP test files passed (20 tests).
Package production/test typechecks, build, scoped Biome, whitespace checks, and
all 35 publishable package-contract checks passed. The authoritative workspace
test-type gate reports two unrelated concurrent diagnostics: the existing
missing `updatedAt` in
`packages/kanban/tests/verification-context-edge.test.ts`, and an incomplete
Playwright Browser mock in
`packages/tools/tests/browser-manager-upload-containment.test.ts`. Requirement
Intake MCP introduced no reported diagnostic. Full monorepo and release checks
were not repeated. Concurrent Requirement Intake service/store work and
package-version bumps were preserved and are not attributed to this pass.

Evidence: `.reports/requirement-intake-mcp-round33-tests.log`,
`.reports/requirement-intake-mcp-round33-typecheck.log`,
`.reports/requirement-intake-mcp-round33-build.log`,
`.reports/requirement-intake-mcp-round33-package-contracts.log`, and
`.reports/packages-round33-test-types.log`. The next package in order is
`sage-mcp`; this remains a partial adapter/lifecycle review rather than a
complete certification against every third-party MCP client.

## Thirty-fourth pass: SAGE MCP request-scoped cancellation

The SAGE adapter created one AbortController when the host was constructed and
reused its never-aborted signal for every tool call. MCP
`notifications/cancelled` therefore could not reach any SAGE tool, and calls
did not have request-scoped cancellation identity. The adapter now uses the
signal supplied by MCP for each call, falls back to a fresh signal only for
direct host consumers, and rejects a pre-cancelled call before validation or
execution. Validation exceptions are now normalized through the same MCP error
result boundary as execution exceptions.

The standalone CLI previously returned after a failed SAGE IPC
`initialize()` without disposing the partially initialized port. Startup
failure now performs best-effort disposal before returning its attach error.
The CLI parser also preserves following options when a value is missing,
emits structured warnings, and accepts only integer HTTP ports from 0 through
65535.

Validation: all five SAGE MCP test files passed (29 tests), including real
SQLite-backed MCP tool round trips and an isolated request-signal identity
suite. Package production/test typechecks, build, scoped Biome, whitespace
checks, and all 35 publishable package-contract checks passed. The
authoritative workspace test-type gate still reports two unrelated concurrent
diagnostics: the missing `updatedAt` fixture in
`packages/kanban/tests/verification-context-edge.test.ts` and the incomplete
Playwright Browser mock in
`packages/tools/tests/browser-manager-upload-containment.test.ts`. SAGE MCP
introduced no reported diagnostic. Full monorepo, release, and live external
MCP-client checks were not repeated. Concurrent SAGE IPC/store work and
package-version bumps were preserved and are not attributed to this pass.

Remaining boundary: the adapter now delivers cancellation to every SAGE tool,
but only operations that consume AbortSignal can stop work already accepted by
the project server. Current SAGE verification and hygiene paths are
cooperative; several ordinary store reads and mutations only observe the
pre-execution check.

Evidence: `.reports/sage-mcp-round34-tests.log`,
`.reports/sage-mcp-round34-typecheck.log`, `.reports/sage-mcp-round34-build.log`,
`.reports/sage-mcp-round34-package-contracts.log`, and
`.reports/packages-round34-test-types.log`. The next package in order is
`webui-protocol`; this remains a partial adapter/lifecycle review rather than a
complete certification against every third-party MCP client.

## Thirty-fifth pass: WebUI protocol decoder and connection bounds

The shared bounded-queue helper accepted `NaN`, infinity, and fractional
limits without normalization. Non-finite limits could retain the entire queue
and append indefinitely, defeating the backpressure contract used by browser,
server, and desktop connection layers. Limits now floor finite safe integers
and fail closed to zero for non-finite values.

Reconnect planning trusted every numeric configuration field. A malformed
runtime override could produce `delayMs: NaN` and `retryAt: NaN`, creating an
immediate or stalled reconnect loop depending on the timer implementation.
Reconnect attempts, backoff values, multiplier, jitter, and random samples are
now normalized to finite bounded values with the canonical defaults as
fallbacks.

`decodeProtocolMessage` could throw when handed a programmatic envelope with a
throwing getter or hostile proxy. The decoder is the shared wire gate and its
contract is a `ProtocolDecodeResult`; unreadable envelope values now return an
`invalid_envelope` issue instead of escaping an exception into the WebSocket
handler or renderer client.

Validation: all eight WebUI Protocol test files passed (159 tests). Package
typecheck, build, scoped Biome, whitespace checks, and all 35 publishable
package-contract checks passed. After rebuilding the protocol package, three
WebUI Server protocol/FSM/replay consumer files passed (21 tests) and four
WebUI/SimpleUI connection consumer files passed (70 tests). The authoritative
workspace test-type gate still reports two unrelated concurrent diagnostics:
the missing `updatedAt` fixture in
`packages/kanban/tests/verification-context-edge.test.ts` and the incomplete
Playwright Browser mock in
`packages/tools/tests/browser-manager-upload-containment.test.ts`. WebUI
Protocol introduced no reported diagnostic. Full WebUI, desktop, monorepo,
release, and physical browser checks were not repeated. Concurrent WebUI and
WebUI Server changes plus package-version bumps were preserved and are not
attributed to this pass.

Evidence: `.reports/webui-protocol-round35-tests.log`,
`.reports/webui-protocol-round35-typecheck.log`,
`.reports/webui-protocol-round35-build.log`,
`.reports/webui-protocol-round35-consumers.log`,
`.reports/webui-protocol-round35-package-contracts.log`, and
`.reports/packages-round35-test-types.log`. The next package in order is
`webui-server`; this remains a partial protocol review rather than a complete
wire-schema validation of every message payload field.

## Thirty-sixth pass: WebUI Server connection ownership

An exception from the asynchronous WebSocket authenticator escaped the
connection lifecycle after the socket error listener had been installed. The
socket remained open without a registered client and retained the lifecycle
closure. Authentication errors now fail closed: they are logged, the listener
is detached, and the socket closes with code 1011 without creating client
ownership.

Client registration was also non-transactional. If one downstream handler
threw during `registerClient`, the client stayed in the shared map while only a
prefix of handlers owned the socket. Registration now rolls back the client
map, calls the shared unregister path to release partial registrations,
detaches socket protection, logs the failure, and closes the connection.

The security-rejection callback was documented as fire-and-forget, but a
synchronous throw escaped the message listener before rejection logging and
the protocol error response. Both synchronous throws and rejected callback
promises are now contained and logged under a dedicated event while normal
parse-rejection handling continues.

Validation: all 229 WebUI Server test files passed (2,611 tests). Package
typecheck, build, scoped Biome, whitespace checks, and all 35 publishable
package-contract checks passed. The authoritative workspace test-type gate
still reports two unrelated concurrent diagnostics: the missing `updatedAt`
fixture in `packages/kanban/tests/verification-context-edge.test.ts` and the
incomplete Playwright Browser mock in
`packages/tools/tests/browser-manager-upload-containment.test.ts`. WebUI Server
introduced no reported diagnostic. Full monorepo, release, and physical
browser checks were not repeated. Concurrent Brain, Kanban, path-containment,
watcher, cleanup-scheduler, and package-version work was preserved and is not
attributed to this pass.

Evidence: `.reports/webui-server-round36-tests.log`,
`.reports/webui-server-round36-typecheck.log`,
`.reports/webui-server-round36-build.log`,
`.reports/webui-server-round36-package-contracts.log`, and
`.reports/packages-round36-test-types.log`. The next package in order is
`cli`; this remains a partial connection-lifecycle review rather than a full
live-browser certification of every route and external integration.

## Thirty-seventh pass: CLI client registration shutdown race

The plain REPL starts shared-mailbox registration asynchronously. Closing the
REPL before that registration completed issued an early deregistration against
a client that did not exist yet. The pending registration could then finish
after shutdown, leaving a ghost REPL client in the project registry with no
heartbeat or live HQ connection to remove it.

The registration completion path now observes shutdown and performs a second
best-effort deregistration after a late registration becomes visible. The
public close handle is also idempotent, so repeated shutdown paths do not
repeat mailbox teardown or stop the HQ connection more than once. A stateful
regression reproduces the original ordering and verifies that the registry is
empty after the delayed registration resolves.

Validation: all 510 CLI test files passed (6,147 tests; 5 files and 5 tests
skipped). CLI production and test typechecks, package build, scoped Biome,
whitespace checks, and all 35 publishable package-contract checks passed. The
authoritative workspace test-type gate still reports the same two unrelated
concurrent diagnostics: the missing `updatedAt` fixture in
`packages/kanban/tests/verification-context-edge.test.ts` and the incomplete
Playwright Browser mock in
`packages/tools/tests/browser-manager-upload-containment.test.ts`. CLI
introduced no reported diagnostic. Full monorepo, release, live HQ, and real
PTY checks were not repeated. Concurrent CLI execution, fleet, WebUI boot,
Kanban sync, static serving, telemetry, and package-version work was preserved
and is not attributed to this pass.

The JSON single-shot path still returns exit code zero for failed runs; an
existing regression names this as a legacy contract, so changing it requires
an explicit compatibility decision rather than an incidental lifecycle fix.
The next package in order is `tui`; this remains a partial CLI lifecycle review
rather than complete validation of every subcommand and external integration.

## Thirty-eighth pass: TUI registration failure cleanup

The TUI's mailbox registration handled project-switch cancellation, but its
ordinary failure path returned `null` without releasing resources acquired
before the failure. If `initialize()` or `registerClient()` rejected, the
named-pipe client and `mailbox.*` subscription could remain alive after startup
continued without presence registration.

Each registration attempt now tracks its own mailbox, client identity,
subscription, snapshot coalescer, and optional HQ publisher. The failure path
removes that attempt's listener, clears its pending coalescer, deregisters a
client if registration had already completed, and closes the pipe and
publisher. Cleanup actions are independently best-effort, so a throwing pipe
or publisher close cannot turn optional presence registration into a TUI
startup failure or prevent the remaining cleanup steps. Stateful regressions
cover both the original resource leak and a cleanup exception.

Validation on the final code: all 372 standard TUI test files passed (6,365
tests), the dedicated truecolor/SGR suite passed (71 tests), package production
and test typechecks passed, the production build passed, scoped Biome and
whitespace checks passed, and all 35 publishable package-contract checks
passed. The repository's Node 24.13 Windows `node-pty` smoke passed 5/5, and
the built CLI painted and completed its real-PTY TUI journey (1/1 test).

The authoritative workspace test-type gate reported no TUI diagnostic. It now
reports seven unrelated concurrent diagnostics: five in new Core Brain test
work plus the existing Kanban `updatedAt` fixture and Tools Playwright Browser
mock diagnostics. Full monorepo and release checks were not repeated.
Concurrent TUI Brain and fleet-generation hook work and package-version bumps
were preserved and are not attributed to this pass. The next package in order
is `webui`; this remains a partial TUI lifecycle and local Windows PTY review,
not cross-platform physical terminal certification.

## Thirty-ninth pass: WebUI roster request correlation

The shared roster WebSocket helper claimed to protect replacement requests
from late replies, but requests carried no identity and server replies echoed
none. After a same-type request was superseded, the old server reply could
therefore resolve the replacement promise with stale project or agent data.
The WebUI now stamps every roster request with a unique `requestId`, filters
responses carrying a different identity, and the WebUI Server roster route
echoes that identity on both success and error frames. Legacy responses with
no identity remain accepted for compatibility.

`CustomRosterPanel` had also retained a separate raw-WebSocket implementation
despite the source comment saying it used the shared helper. That copy lacked
connection establishment, supersede handling, server error normalization, and
abort cleanup. The duplicate transport was removed. The panel now uses the
shared request path and aborts its initial list/conflict requests on unmount or
project change.

Validation: all 396 WebUI test files passed (5,517 tests), and the production
Vite/package build compiled 5,006 modules. All 230 WebUI Server test files
passed (2,613 tests). Both package typechecks and production builds passed,
along with scoped Biome, whitespace checks, and all 35 publishable package
contracts. The authoritative workspace test-type gate reported no new WebUI
or WebUI Server diagnostic. It still reports seven unrelated concurrent
diagnostics: five in Core Brain tests, one Kanban `updatedAt` fixture, and one
Tools Playwright Browser mock.

No live backend browser journey, cross-tab physical browser test, full
monorepo suite, or release check was run. Concurrent Council/Brain WebUI work,
protocol type changes, and package-version bumps were preserved and are not
attributed to this pass. The next package in order is `simpleui`; this remains
a partial roster transport review rather than complete validation of every
WebUI request family and visual state.

## Fortieth pass: SimpleUI socket generation ownership

`SimpleSocket.connect()` had no in-flight ownership identity. Two overlapping
calls both completed authentication and opened physical WebSockets. Whichever
finished last replaced the stored socket, but the older socket stayed open;
its message handler still dispatched frames and its close handler could mark
the UI closed and schedule another reconnect. This allowed duplicate messages,
incorrect connection state, and reconnect churn from a socket the client no
longer owned.

Connection attempts now carry a monotonic generation. Only the newest attempt
may create a socket after asynchronous cookie exchange, replacing an existing
socket closes it, and message/close/error handlers ignore sockets that are no
longer current. Explicit `close()` increments the generation so an
authentication request still in flight cannot create a socket after teardown.
A regression reproduces two overlapping `connect()` calls and requires one
physical WebSocket.

Validation: all 75 SimpleUI test files passed (647 tests). Package typecheck,
production Vite/package build, scoped Biome, whitespace checks, and all 35
publishable package-contract checks passed; the production build transformed
2,370 modules. The authoritative workspace test-type gate reported no new
SimpleUI diagnostic and still reports the same seven unrelated concurrent
Core Brain, Kanban fixture, and Tools Playwright mock diagnostics.

No visual geometry changed, so the short-viewport browser smoke was not
repeated. Full monorepo, release, and live server restart checks were not run.
Concurrent SimpleUI Brain panel work and package-version changes were
preserved and are not attributed to this pass. The next package in order is
`webui-hq`; this remains a partial SimpleUI connection-lifecycle review rather
than exhaustive browser/network certification.

## Forty-first pass: WebUI HQ errored-socket cleanup

The HQ browser transport treated `error` as a logical close and immediately
released its socket reference, but it never called `WebSocket.close()` on the
physical connection. Browsers normally follow an error with a close event,
but that ordering is not guaranteed; a socket that remained open became
unowned while the client scheduled a replacement connection.

The error handler now verifies socket ownership, closes the physical socket,
and releases transport ownership in a `finally` block. If close fires
synchronously, asynchronously, or never fires, the existing identity guard
still schedules exactly one reconnect and ignores delayed events from the old
socket. A regression directly fires `onerror` on an open socket and requires
both physical close and the reconnecting state.

Validation: all 46 WebUI HQ test files passed (523 tests). Package typecheck,
production Vite build, scoped Biome, whitespace checks, and all 35 publishable
package-contract checks passed; the production build transformed 2,716
modules. The authoritative workspace test-type gate reported no new WebUI HQ
diagnostic and still reports the same seven unrelated concurrent Core Brain,
Kanban fixture, and Tools Playwright mock diagnostics.

No visual UI changed, so desktop/mobile browser QA was not repeated. Full
monorepo, release, and live multi-machine HQ checks were not run. Concurrent
WebUI HQ Brain view work and its package-version change were preserved and are
not attributed to this pass. The next package in order is `telegram`; this
remains a partial HQ transport review rather than exhaustive operator-surface
or network-failure certification.

## Forty-second pass: Telegram poll-lock transfer cancellation

Losing the single-poller lock invalidated the timer chain but did not cancel a
`getUpdates` long poll already in flight. After another process acquired the
lock, the old owner could therefore continue receiving and processing updates
for up to its request deadline while the new owner started polling the same bot
token. The epoch fence prevented duplicate re-arming inside one process, but
did not enforce delivery ownership across processes.

Lock loss now aborts the current polling controller immediately and creates a
fresh controller for a later standby takeover. The aborted poll exits through
the existing Telegram network-abort path, and its stale `finally` remains
blocked by the epoch fence. A regression parks a long poll, transfers the
lock, verifies the old signal is aborted, then verifies the successor request
uses a distinct live signal.

Validation: all 36 Telegram test files passed (428 tests), including poller,
bot, and fault-injection coverage. Package typecheck, production build, scoped
Biome, whitespace checks, and all 35 publishable package-contract checks
passed. The authoritative workspace test-type gate reported no new Telegram
diagnostic and still reports the same seven unrelated concurrent Core Brain,
Kanban fixture, and Tools Playwright mock diagnostics.

No live Telegram Bot API call, multi-machine takeover, full monorepo suite, or
release check was run. The concurrent Telegram package-version change was
preserved and is not attributed to this pass. The next package in order is
`wrongtrace`; this remains a partial local polling lifecycle review rather than
external delivery certification.

## Forty-third pass: WrongTrace IPC error correlation

The WrongTrace IPC adapter correctly ignored result envelopes carrying a
different JSON-RPC id, but it evaluated error envelopes before checking their
id. A delayed or foreign error frame could therefore fail the active request,
trigger HTTP fallback, and discard the matching success frame that followed.

Result and error envelopes now pass through the same correlation gate. Frames
whose id is neither the active request id nor the daemon's accepted null-id
form are ignored before their payload is interpreted. A real named-pipe/UDS
regression sends a foreign `-32601` error followed by the matching success and
requires the success result. Four older error fixtures were corrected to echo
the request id supplied by the test daemon; their former hard-coded `id: 1`
had concealed the defect.

Validation: all six WrongTrace test files passed (82 tests), including live
in-process IPC server round trips and HTTP fallback paths. Package typecheck,
TypeScript build, scoped Biome, whitespace checks, and all 35 publishable
package-contract checks passed. The authoritative workspace test-type gate
reported no new WrongTrace diagnostic and still reports the same seven
unrelated concurrent Core Brain, Kanban fixture, and Tools Playwright mock
diagnostics.

No external WrongTrace daemon, MCP peer, full monorepo suite, or release check
was run. The concurrent package-version change was preserved and is not
attributed to this pass. The next work moves to `apps/desktop`; this remains a
partial adapter protocol review rather than live daemon certification.

## Forty-fourth pass: Desktop locale IPC authority

Desktop's request/response IPC channels were registered through a common shell
sender gate, and WebUI-originated events resolved their owning runtime view.
The fire-and-forget `setLocale` event was the exception: it accepted any
renderer sender, then changed the main-process locale, rebuilt the application
menu, broadcast the locale, and persisted it to shared UI configuration. The
remote WebUI renderer is sandboxed today, but relying on its preload not to
expose a channel is not an IPC authorization boundary.

A shell-only event registration helper now applies the same sender identity
check to locale mutation. Rejected events are logged and ignored; WebUI events
retain their runtime-entry ownership checks. The WS-SEC-13 regression scans
the registration structure so a later refactor cannot silently restore a bare
`ipcMain.on(IPC.setLocale, ...)` handler.

Validation: all 27 Desktop test files passed (478 tests). Desktop typecheck,
the full workspace dependency/Desktop production build, scoped Biome,
whitespace checks, and all 35 publishable package-contract checks passed.
The authoritative workspace test-type gate reported no new Desktop diagnostic.
It now reports eight unrelated concurrent diagnostics: one new CLI Brain
runtime fixture, five Core Brain tests, the Kanban `updatedAt` fixture, and the
Tools Playwright Browser mock.

Packaged validation remains incomplete. Two `package:dir` attempts rebuilt the
workspace and Desktop outputs successfully, then failed while `pnpm deploy`
renamed its temporary staging directory to `.package-stage` with Windows
`Access denied` (os error 5). No Electron/Node process using that repo stage
path was found, and no unpacked artifact was produced for `smoke-desktop.mjs`.
This pass does not establish packaged, signed, or cross-platform release
readiness. The next application in order is `apps/wrongstack`.

## Forty-fifth pass: Published CLI shim lifecycle parity

The published `wrongstack`/`wstack` shim duplicated an older process-exit
implementation instead of using the CLI package's current entry lifecycle. It
installed only broken-pipe handlers, invoked `main`, and forced `process.exit`
after a fixed 200 ms. The normal CLI entry now provides crash shielding,
Windows executable-search hardening, synchronous fatal-state salvage,
credential/home-path scrubbing, and a durability-aware 500 ms to 5 s exit
window. Users of the published shim silently missed all of those protections
and could truncate pending writes on slower disks.

The complete CLI process lifecycle is now exported as `runCliProcess` for an
already-confirmed entry point. `runAsMain` retains module-main detection and
delegates to it, while `apps/wrongstack` calls the same lifecycle directly.
The shim no longer owns its own `setTimeout` or `process.exit` path. A source
contract pins that single-owner relationship and verifies the new public
export.

Validation: the WrongStack app suite passed (6 tests), and its typecheck and
build passed after rebuilding CLI declarations. The complete CLI suite passed
(510 files and 6,147 tests; 5 files and 5 tests skipped), CLI production
typecheck and build passed, scoped Biome and whitespace checks passed, and all
35 publishable package contracts passed. CLI's combined source+test typecheck
remains blocked only in the test phase by the unrelated concurrent
`slash-brain.test.ts` fixture. The authoritative workspace test-type gate now
reports eight unrelated concurrent diagnostics: that CLI fixture, five Core
Brain tests, one Kanban fixture, and one Tools Playwright mock.

No npm tarball install, global binary smoke, full monorepo suite, or release
check was run. Package-by-package first-pass coverage is now complete; the next
phase should close the cross-package gates and revisit the recorded residual
risks rather than treating these partial passes as release certification.

## Forty-sixth pass: Cross-package test-type gate closure

The first cross-package closure pass reproduced eight new TypeScript test
diagnostics across CLI, Core, Kanban, and Tools. They were fixture drift rather
than production failures: a CLI BrainRuntime double lacked the new explain and
tier-stat methods; Brain explanation fixtures carried stale imports and the
old deny `text` field; a heuristics import was unused; a budget event still
used removed `previous`/`granted` fields; a Kanban board lacked `updatedAt`;
and a Playwright browser double was narrower than the documented launcher
seam's full external interface.

The fixtures now match the live contracts without changing production
behavior or the generated diagnostic baseline. The authoritative gate reports
`New diagnostics: 0`, no unparsed failures, and 247 resolved baseline
diagnostics. Focused behavior validation passed across all affected packages:
54 CLI tests plus 86 Core/Kanban/Tools tests. CLI's combined production/test
typecheck, scoped Biome, whitespace checks, and all 35 publishable package
contracts passed.

This closes the current test-type blocker but does not erase the 1,542
baseline diagnostics, certify the full monorepo suite, or resolve the Desktop
packaging-stage Windows rename failure. The next cross-package step is to run
the broader release matrix, classify its first authoritative failures, and
repair only current actionable findings without hand-editing generated
baselines.

## Forty-seventh pass: Release-matrix closure and architecture ownership

The complete 19-gate `pnpm release:check` matrix was run from the repository
root. Seventeen gates passed: dependency audit, production build, extracted
Tools WASM smoke, hidden-output scan, provider and plugin projections, all 35
publishable package contracts, npm 10 packed-provider installation, build
lineage write/verify, test inventory, skip budget, Windows PTY, optional
rulebook, seven-locale completeness, workspace typecheck, and the test-type
ratchet (`New diagnostics: 0`, 247 resolved). The initial architecture and
coverage gates exposed current source drift instead of infrastructure errors.

Four independent clean-source defects were repaired. WebUI Server's Kanban
manager now uses the shared `errMessage` authority. Core's Brain risk ceiling
primitive moved into a private coordination module, removing the
`coordination -> execution -> coordination` runtime cycle while retaining the
existing `autonomy-brain` re-export. Plug-LSP now proves recovery from an
invalid request-id cursor, and WebUI Protocol proves safe defaults for an
invalid retry cap and non-finite jitter sample; both packages returned to
100% statement, branch, function, and line coverage. The authorized Core API
snapshot writer recorded only the resulting coordination/execution source
lineage change. HQ's token mirror was recopied from WebUI, closing seven
missing shadow tokens and the light-success color drift. The concurrently
edited locale catalogs now also contain the new TechStack unavailable message
in all seven locales.

Validation after repair: the focused Core/WebUI Server architecture set passed
80 tests; the final Core focus passed 79 tests; Core's authoritative full root
suite passed all 802 files and 12,905 tests with four skips. Plug-LSP passed
294 tests plus one skip at 100% coverage, WebUI Protocol passed 160 tests at
100% coverage, HQ token parity passed 5 tests, WebUI catalog integrity passed
10 tests, and Core, WebUI Server, Plug-LSP, and WebUI Protocol typechecks
passed. The generated Core API snapshot is current and the architecture scan
reports zero runtime module cycles.

One release blocker remains owned by concurrent WebUI work:
`packages/webui/src/components/TechStackView/index.tsx` grew from the 865-line
hotspot ratchet to 878 lines during this pass. That file and its active
supporting WebUI changes were preserved rather than rewritten or accepted via
a hand-edited architecture baseline. Consequently the final architecture gate
still exits 1, and the full release matrix was not rerun after the focused
repairs because that known gate cannot yet pass. Desktop's earlier Windows
packaging-stage rename failure also remains outside this matrix result.

## Forty-eighth pass: Windows Desktop packaging stage closure

The repeated Desktop `package:dir` failure was reproduced a third time with no
competing build, coverage, Vitest, Electron, or package process. The workspace
and Desktop builds completed, then pnpm 12.3.4's legacy deploy engine failed to
rename its internal `pacquet-stage_*` directory to
`apps/desktop/.package-stage` with Windows `Access denied` (os error 5). No
stale target or temporary stage existed before the run. Running the identical
379-package deploy graph under the repository's ignored `.temp_files`
directory succeeded, isolating the failure to a deploy target nested inside
the filtered workspace package rather than dependency resolution, disk health,
or the content-addressable store.

Desktop packaging and smoke now share one repository-relative stage constant:
`.temp_files/package-desktop-stage`. Keeping the deploy destination outside
`apps/desktop` lets pnpm complete its atomic staging rename while preserving a
repo-local, ignored artifact location. The smoke launcher consumes the same
constant, preventing package/output path drift.

Validation: the complete `pnpm --filter @wrongstack/desktop package:dir` flow
rebuilt the workspace, deployed 379 production packages, ran the lockfile-pinned
Electron Builder 26.15.3, downloaded/extracted Electron 44.3.0, and produced
`release/win-unpacked` successfully. The packaged runtime smoke resolved the
workspace dependency closure and renderer assets and opened a real packaged
PTY. The stronger window smoke also reported `Desktop reload state OK` and
`Desktop window ready`. Script coverage passed all 201 tests, the shell-spawn
contract passed two tests, scoped Biome and whitespace checks passed, and the
packaged smoke remained green after formatting.

This establishes an unpacked Windows x64 package and live local smoke. It does
not certify installer generation, publication, signing identity, macOS/Linux
artifacts, or GitHub Releases delivery. The unrelated concurrent WebUI hotspot
ratchet remains the current `release:check` blocker.

## Forty-ninth pass: Windows installer and portable asset proof

The full Windows target command, `node scripts/package-desktop.mjs --win`, was
run after an unrelated six-shard Vitest worker finished. It rebuilt the current
workspace, materialized all 379 production packages in the repaired stage, and
ran the lockfile-pinned Electron Builder 26.15.3 against Electron 44.3.0. Both
configured Windows x64 distribution targets completed:

- `wrongstack-desktop-1.0.23-win-x64-setup.exe` — 235,021,923 bytes,
  SHA-256 `3AA9F250C7C6A04B2E05CB0A4DF6D2C4EEF830597041F6BE2782ACB4775CFFF4`;
- `wrongstack-desktop-1.0.23-win-x64-portable.exe` — 234,807,671 bytes,
  SHA-256 `B0B584EB014C11403E25F31AFAA81AA0507A93351A64B8304566949C6D3ED068`;
- the NSIS blockmap — 243,819 bytes,
  SHA-256 `D5452D492ACE6185282CB5BDA175398909A7391C49415F155FF731B9A18172E1`.

The portable executable was then launched directly with
`--desktop-smoke-test` and an isolated `WRONGSTACK_HOME`. It exited zero,
created its Electron profile, and left no WrongStack process behind. This is
in addition to the unpacked runtime's stronger PTY, dependency, asset, reload,
and window-readiness smoke from the previous pass.

No Windows signing certificate was supplied. Electron Builder ran its signing
steps, but Windows Authenticode reports both final executables as `NotSigned`;
the hashes above prove only the local artifacts and must not be presented as a
signed release. Publication, GitHub Release attachment, installed-NSIS upgrade
behavior, and macOS/Linux packaging remain unproven. The active WebUI hotspot
ratchet remains the independent `release:check` blocker.

## Fiftieth pass: Installed NSIS lifecycle smoke

The generated NSIS installer was exercised in silent mode against an isolated,
ignored install directory. Installation exited zero and produced both the
installed `WrongStack.exe` and `Uninstall WrongStack.exe`. The installed
binary was then launched with `--desktop-smoke-test` and an isolated
`WRONGSTACK_HOME`; it exited zero and reported `Desktop reload state OK` and
`Desktop window ready`. Its Electron profile was created under the requested
smoke root. The installer-provided uninstaller subsequently exited zero,
removed the entire install directory, and left zero entries behind.

One diagnostic invocation used PowerShell's reserved `$HOME` variable name
before the corrected smoke. Assignment failed, so the command inherited
`C:\Users\ersin` as `WRONGSTACK_HOME` and created
`C:\Users\ersin\profiles\default\desktop\electron-profile`. Read-only
inspection proved that `profiles`, `default`, `desktop`, and
`electron-profile` were all created in the same second by this smoke and that
the tree contains no sibling user data. A path-literal recursive cleanup was
attempted, but the execution policy rejected the command before it started;
the generated profile tree therefore remains and requires ordinary user-side
removal. No existing WrongStack profile under `.wrongstack` was modified.

This closes fresh install, installed startup, and uninstall behavior for the
current unsigned Windows x64 NSIS artifact. Upgrade-over-existing-version,
signed publisher identity, publication, and cross-platform installers remain
outside the proven scope.

## Fifty-first pass: Deterministic release checksum manifest

Desktop packaging previously emitted setup, portable, blockmap, and update
metadata without a machine-readable integrity manifest. A shared streaming
SHA-256 helper now hashes every top-level publishable release file after
Electron Builder succeeds, sorts entries by name, excludes Builder's internal
debug/effective configuration and the manifest itself, and writes the standard
two-space `SHA256SUMS.txt` form. Directory-only packaging intentionally emits
no empty manifest. The helper streams large installers instead of reading
hundreds of megabytes into memory.

Two regressions cover deterministic ordering, exact digests, Builder-internal
exclusion, self-exclusion on repeated writes, directory exclusion, and the
empty-release behavior. The complete `node scripts/package-desktop.mjs --win`
integration was rerun after the change; it rebuilt the workspace, deployed all
379 production packages, rebuilt NSIS and portable assets, and reported
`Wrote SHA256SUMS.txt for 4 release asset(s)`. Independent PowerShell
`Get-FileHash` calculations matched every manifest line. The final manifest is:

```text
cb288b441c96e38036944aab8ec0c6fb91f7eb75cc48c571176110137a2d26a2  latest.yml
a8c30b9749a22f287d08ba64d9e3dcdd33ddb1aaa6b33fe29e6c50ed6f890d51  wrongstack-desktop-1.0.23-win-x64-portable.exe
f5754d1a5eb238211045afc2973330bbd2ff53f3ae6ad81cd324f731e7b98bcd  wrongstack-desktop-1.0.23-win-x64-setup.exe
6d12fc57fcb8cd4621271ab3c016040eb4f620c4a0c0e0d63957445ae665b662  wrongstack-desktop-1.0.23-win-x64-setup.exe.blockmap
```

Validation: focused checksum tests passed 2/2, Core production typecheck
passed, the authoritative test-type ratchet remained at zero new diagnostics
with 247 resolved, scoped Biome and whitespace checks passed, and the rebuilt
unpacked app again passed packaged PTY, dependency, asset, reload-state, and
window-readiness smoke.

The first and second Windows builds produced different binary hashes, so the
current Electron/NSIS pipeline is not certified bit-for-bit reproducible. The
manifest provides integrity for one concrete build; it does not prove source
reproducibility or replace Authenticode signing.

## Fifty-second pass: Desktop checksum release-chain authority

The reusable Desktop workflow still uploaded from the removed
`apps/desktop/.package-stage/release` location. After the stage repair, every
matrix job would therefore build and smoke successfully, then fail
`upload-artifact` with no files. The workflow now uploads from the canonical
`.temp_files/package-desktop-stage/release` directory and explicitly enables
hidden-file traversal; upload-artifact otherwise ignores a hidden ancestor
even when its file globs are exact.

Checksum ownership is also preserved end to end. Each Windows, Linux, macOS
ARM64, and macOS x64 job namespaces the package-produced manifest with its
fixed matrix OS name before artifact upload. The GitHub Release job merges
those manifests, sorts the result by asset name, and runs
`sha256sum --check` against the downloaded assets before uploading them. It no
longer discards build-time provenance and recomputes hashes in a later job.

The manifest scope was narrowed to files whose names start with
`wrongstack-desktop-`, matching the workflow's actual release asset contract.
Electron Builder's `latest*.yml` update metadata is not currently uploaded by
this workflow, so including it produced a checksum entry that could never be
verified after artifact download. The final Windows manifest therefore covers
setup, portable, and blockmap; all three matched independent `Get-FileHash`
calculations in a local namespace/merge simulation.

Validation: the workflow-aware checksum suite passed 3/3, both modified YAML
workflows parsed successfully with PyYAML, Core typecheck passed, the
authoritative test-type ratchet remained at zero new diagnostics with 247
resolved, and scoped Biome and whitespace checks passed. The exact cross-shell
Node namespace command was executed locally, avoiding template-literal shell
substitution. A real four-OS GitHub Actions run and GitHub Release upload remain
external proof still to be obtained.

The closing architecture read also observed new concurrent work outside this
pass: type-inclusive cycles rose from nine to ten, and hotspot/fan-out ratchets
now fail in Core delegation/coordination/Brain runtime, TUI submit control,
WebUI TechStack, and WebUI Server backend services. Runtime cycles remain zero.
Those active files and generated architecture baselines were left untouched;
the current full release gate therefore has multiple concurrent blockers rather
than only the earlier TechStack hotspot.

## Fifty-third pass: Shell-free Windows pnpm packaging invocation

Desktop packaging still invoked `pnpm` through `execFileSync` with
`shell: true` on Windows. Even though today's deploy arguments are internal,
Node correctly emitted `DEP0190`: argv is joined into one shell command line,
the same BatBadBut/CVE-2024-27980 shape the repository's command execution
layers already reject. The packaging script was still explicitly allowlisted
from the architecture shell-spawn contract.

The script now builds Core first, then dynamically imports the canonical
`buildWin32CmdShimInvocation` from `@wrongstack/core/utils`. Windows pnpm runs
through explicit `cmd.exe /d /c call` argv with metacharacter refusal and
`windowsVerbatimArguments`; Unix continues to execute pnpm directly. The lazy
import preserves clean-checkout behavior because no Core `dist` output is
required until after the workspace build completes. The old shell option and
its architecture allowlist exception were removed.

Validation: the shell-spawn architecture suite passed 2/2, scoped Biome and
whitespace checks passed, and a complete Windows `package:dir` rebuilt the
workspace, deployed all 379 production packages, and produced the unpacked app
without `DEP0190`. The resulting package again passed PTY, dependency, asset,
reload-state, and window-readiness smoke. The authoritative test-type ratchet
remained at zero new diagnostics with 247 resolved. Electron still emits the
separate `DEP0180` `fs.Stats` deprecation during window smoke; this pass does
not attribute or suppress that dependency-level warning.

## Fifty-fourth pass: Electron DEP0180 ownership proof

The remaining packaged-window warning was rerun with Electron's direct
`--trace-deprecation` flag. `NODE_OPTIONS=--trace-deprecation` is intentionally
rejected by packaged Electron, but the executable flag produced the complete
stack:

```text
at asarStatsToFsStats (node:electron/js2c/node_init:2:1843)
at Object.lstat (node:electron/js2c/node_init:2:5408)
at node:electron/js2c/node_init:2:5732
```

Node documents DEP0180 as the runtime deprecation for directly constructing
`fs.Stats`; the caller above is Electron's internal ASAR compatibility layer,
not WrongStack source. A narrow mitigation was tested: unpack the renderer
bundle and resolve `app.asar.unpacked/dist/renderer/index.html` before the ASAR
URL. The package contained the unpacked renderer and startup still passed, but
the same internal Electron stack remained. That experiment was fully reverted
rather than carrying extra unpacked surface with no benefit.

The warning is therefore classified as an Electron 44.3.0 upstream/runtime
issue. WrongStack does not suppress process deprecations, disable ASAR, or
weaken smoke assertions to hide it. The packaged app continues to report PTY,
dependency, asset, reload-state, and window readiness successfully. A future
Electron upgrade should rerun the traced smoke and remove this residual only
when the upstream ASAR stack no longer constructs `fs.Stats`.

## Fifty-fifth pass: Desktop artifact and checksum scope parity

The checksum helper deliberately includes every top-level file owned by the
`wrongstack-desktop-` release prefix. Electron Builder emits the Windows NSIS
blockmap under that prefix, but the reusable Desktop workflow enumerated only
`exe`, `dmg`, `zip`, `AppImage`, and `deb` upload globs. A Windows matrix job
would therefore publish a checksum manifest that referenced a blockmap absent
from the downloaded artifact, and the release job's `sha256sum --check` would
fail before upload.

The artifact upload now uses the same `wrongstack-desktop-*` prefix contract as
the checksum helper. This includes the blockmap and prevents future
package-owned sidecar formats from silently drifting out of the release chain.
Builder diagnostics and update metadata remain excluded because neither uses
that prefix. The regression fixture now contains a blockmap and asserts its
digest, while the workflow contract asserts the shared prefix glob and rejects
the former executable-only glob.

Validation: the focused checksum regression passed 3/3; the combined Desktop
checksum and workflow-hardening suites passed 20/20; `actionlint` accepted both
Desktop and release workflows; the authoritative test-type ratchet reported
zero new diagnostics with 247 resolved; scoped Biome and whitespace checks
passed. A real GitHub Actions matrix and GitHub Release upload remain external
proof.

## Fifty-sixth pass: Standalone binary release integrity handoff

The standalone build already generated `dist-bin/SHA256SUMS`, and both install
scripts use that release asset as their trust anchor. The GitHub Release job,
however, downloaded the workflow artifact and uploaded its contents without
checking that the downloaded executables still matched the build-produced
manifest. This left the build-to-release handoff weaker than the equivalent
Desktop path.

The release job now runs `sha256sum --check dist-bin/SHA256SUMS` before it can
create or update the release and before any standalone asset is uploaded. A
workflow-hardening regression scopes the assertion to the GitHub Release job
and pins verification ahead of `gh release upload`, so moving or removing the
integrity gate fails locally.

Validation: the workflow-hardening suite passed 18/18; `actionlint` accepted
the release workflow; scoped Biome and whitespace checks passed. The existing
local single-target `dist-bin/SHA256SUMS` was independently parsed and its
Windows x64 executable matched `Get-FileHash`. The authoritative test-type
ratchet reported zero new diagnostics with 247 resolved. A fresh all-target
Linux build and live GitHub Release upload remain external proof.

## Fifty-seventh pass: Standalone checksum coverage closure

`sha256sum --check` verifies every line present in a manifest, but it does not
reject an additional file absent from that manifest. The GitHub Release upload
uses the broader `dist-bin/wstack-*` glob, so an unexpected or stale binary
could otherwise be attached without any checksum entry even after the digest
gate added in the previous pass.

Before hashing, the release job now builds two sorted inventories: actual
top-level `wstack-*` files and normalized filenames from `SHA256SUMS`. A unified
`diff` must be empty before `sha256sum --check` and before upload. Missing,
extra, and duplicate manifest entries therefore fail the release handoff. The
workflow regression asserts the inventory sources and pins coverage comparison
ahead of digest verification, with both gates ahead of `gh release upload`.

Validation: workflow-hardening passed 18/18; `actionlint`, scoped Biome, and
whitespace checks passed. The authoritative test-type ratchet reported zero
new diagnostics with 247 resolved. A live Ubuntu release runner remains the
final proof of the GNU `find`, `awk`, `diff`, and `sha256sum` pipeline.

## Fifty-eighth pass: Standalone build target cardinality

The binary builder accepted `--target=` as an empty target list and would then
produce no executable plus an empty `SHA256SUMS`. It also accepted the same
target more than once, recompiling one output path and writing duplicate
manifest entries. Both states violate the exact asset/manifest coverage now
enforced at release time, but previously failed only much later in workflow
smoke or publication.

Argument parsing is now exported as a narrow test seam, clones the default
target list, de-duplicates explicit targets in caller order, and rejects an
empty final list before workspace build or output deletion begins. The
declaration mirror documents the options shape. Direct Node execution proved
both the single-target de-duplication result and the early empty-target error.

## Fifty-ninth pass: Bounded standalone update downloads

Standalone self-update used one 512 MiB ceiling for both executable and
`SHA256SUMS` downloads. When `Content-Length` was absent it called
`arrayBuffer()` before checking the actual size, so the nominal limit did not
prevent the response from being fully allocated first.

The executable retains its 512 MiB ceiling while checksum metadata is capped
at 1 MiB. Downloads now read the response stream incrementally, track received
bytes, cancel immediately when the configured ceiling is crossed, release the
reader lock on success or failure, and concatenate only an accepted body.
Regressions prove declared oversize is rejected before body access and an
undeclared oversize stream is cancelled at the crossing chunk.

## Sixtieth pass: Single checksum authority across installers

Checksum parsing now rejects duplicate asset names in the CLI self-updater
instead of silently letting the last digest win. The Unix and PowerShell
installers also require exactly one matching manifest entry. This makes the
GitHub Release job, `wstack update`, `install.sh`, and `install.ps1` agree on
one unambiguous digest per binary, including custom download mirrors.

Validation across passes 58-60: standalone/update/workflow regression suites
passed 52/52; CLI production and test typecheck passed after rebuilding its
Tools, TUI, and WebUI Server dependencies; the authoritative test-type ratchet
reported zero new diagnostics with 247 resolved; `actionlint`, PowerShell AST
parsing, Git `sh -n`, scoped Biome, and whitespace checks passed. A fresh
seven-target Bun build and live installer downloads remain external proof.

## Sixty-first pass: Streaming standalone build checksums

The binary builder hashed each large executable by passing a full
`readFileSync` buffer into `createHash`. The release build emits seven targets,
so checksum generation repeatedly allocated complete executable-sized buffers
after the memory-heavy compile and asset-pack stages.

Hashing now streams each file into SHA-256 and processes outputs sequentially.
The builder entry point awaits the asynchronous checksum phase and preserves
the existing failure exit behavior. A real `--current --skip-build` run rebuilt
the 127.7 MB Windows x64 executable, wrote the manifest through the streaming
path, and an independent `Get-FileHash` calculation matched it.

The rebuilt binary then passed version metadata, bundled-skill extraction,
daemon dispatch, script dispatch, WebUI HTML and asset serving, built-in plugin
loading, and runtime syntax smoke. This proves the async entry-point conversion
does not exit before the manifest is written or disturb the produced binary.

## Sixty-second pass: Production-owned bounded downloader module

The architecture health gate correctly rejected the newly exported
`downloadReleaseAsset`: only its test referenced the export, even though its
implementation lived inside a production module. The function was moved into
the focused `release-asset-download.ts` module. `standalone-update.ts` now
imports it in the real update path, and the regression imports the same module
directly. The test-only-export violation disappeared without adding an
architecture exception or changing a generated baseline.

The read-only architecture rerun still reports the concurrent System One
cycle plus hotspot/fan-out growth in Core, TUI, WebUI, and WebUI Server. It no
longer reports `downloadReleaseAsset`. The main architecture command currently
stops earlier on a stale Core public API snapshot caused by those active Core
exports; no snapshot or architecture evidence was regenerated in this pass.

## Sixty-third pass: Standalone installer entry-point parity

The canonical release installers under `scripts/install/` were checksum-
verified standalone installers, while the root `scripts/install.sh` and
`scripts/install.ps1` still advertised `wrongstack.com/install.*` and installed
the legacy npm package with a Node 22 prerequisite. README and website content
already identify GitHub standalone binaries as the supported channel.

Both root installer entry points now exactly match the canonical standalone
scripts. A regression compares their complete contents, so the website-facing
and GitHub Release entry points cannot silently diverge again. Both shell and
PowerShell syntax parsers accepted the synchronized files, and searches found
no remaining Node/npm installer behavior in those four active scripts.

## Sixty-fourth pass: Tag-first release documentation authority

`docs/release.md` still instructed maintainers to publish npm locally, verify
it, and only then create the tag; it also claimed no checked-in workflow
created GitHub Releases. The actual workflow is tag-first, validates a fixed
SHA, builds and smokes standalone and Desktop assets, creates the GitHub
Release, and keeps npm publication behind its own gate and environment review.

The release checklist, hotfix sequence, automation inventory, and update
documentation now reflect the live workflow. The process reference now shows
standalone and Desktop branches separately from npm pack/publish, records
checksum coverage and digest verification, and uses the current 36-package
trusted-publisher inventory. A workflow-hardening regression rejects the old
manual-release and npm-global-install instructions.

## Sixty-fifth pass: Publish metadata and contract inventory parity

`pnpm release:packages` exposed seven clean, independent manifest drifts: three
packages declared redundant CI-only provenance, while four public packages
lacked `publishConfig.access: public`. The provenance flags were removed from
Governance, TechStack, and Vector Memory; public access was added to Plugin
SDK, Plugins, WebUI HQ, and the `wrongstack` app. The live package plan now
lists all 36 packages without warnings.

The package-contract checker separately claimed only 35 publishable contracts
because it maintained its own directory scan and explicitly skipped Desktop,
even though the release inventory publishes `@wrongstack/desktop`. It now
consumes the shared `collectPublishablePackages` authority and validates all 36
release manifests, including Desktop. Regressions require the shared inventory,
Desktop coverage, consistent public access, and absence of manifest-level
provenance.

Validation across passes 62-65: the focused update, workflow, and publish
architecture suites passed 86/86; CLI production/test typecheck passed; the
authoritative test-type ratchet reported zero new diagnostics with 247
resolved; all 36 package contracts passed; `release:packages` listed 36
publishable packages and one private website without warnings; scoped Biome,
`actionlint`, PowerShell AST parsing, Git `sh -n`, and whitespace checks passed.
