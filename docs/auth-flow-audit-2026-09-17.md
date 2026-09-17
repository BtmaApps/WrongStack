# Auth audit closure - 2026-09-17

This section supersedes the earlier incremental validation limitations below.

Implemented account aliases as separate auth profiles, preserving canonical provider type and optional per-profile multiple keys. Fallback selection identifies profile alias plus model. Saved/inherited config boundaries, strict encrypted atomic persistence, stale OAuth callbacks, cancellation, acknowledged frontend operations, alias-specific connection resolution, and credential invalidation have focused regression coverage. CLI and standalone hosts now block removed profiles even if a legacy root key could recreate the factory; background standalone conversations holding the same provider are also invalidated and recover after account recreation.

Verified this session:

- Full WebUI suite: 393 files, 5,465 tests passed after fixing obsolete auth expectations.
- Final credential watcher/token persistence/key regression subset: 5 files, 90 tests passed. Providers, standalone server and CLI builds passed.
- Real OpenRouter saved key: HTTP 200; invalid fixture key: HTTP 401. Real Codex saved credential: native model catalog HTTP 200; invalid fixture token: HTTP 401. One actual remote refresh was performed with expiry forced only in memory; its rotated credential was persisted encrypted and subsequently reloaded successfully. No real key was revoked and no paid model request was made.
- Production SimpleUI and WebUI browser flows against a real isolated standalone backend passed, including profile/key CRUD, confirmation cancellation, active selection, encrypted disk inspection and expired-token fixture refresh through the native provider and host persistence wiring.
- HQ live desktop/mobile auth smoke passed: password throttling, logout, enrollment, session revocation, TOTP and single-use recovery codes. Six focused HQ files / 75 tests passed.
- Eight separate Node processes preserved independent account updates; concurrent edits of the same account produced one success and one explicit conflict. Encryption and unrelated config retention passed.

Global validation is not a release certification. The full root suite ran and failed (13 files / 16 tests; 43,841 passed, 34 skipped), and release:check completed with 17 gates passed / 2 failed (architecture and coverage). Subsequent focused reruns repaired stale auth expectations, provider mocks, reserved dictionary-key handling and new test-type diagnostics. Architecture was regenerated through the official tools; the subsequent standalone architecture check passed. The full root and coverage runs were not repeated after those corrections. Remaining failures included SAGE stop-drain and SDD timing, Windows design-path traversal, environment-sensitive heap-path expectations, and EBUSY/timing failures in mailbox and auto-review tests. Concurrent workspace edits also changed/deleted test modules and build artifacts during these long runs. None of those failed complete runs is represented as green.

Final live reruns passed both production interfaces after making the harness wait for the accessible Send button rather than sending Enter during connection initialization. Separate-process persistence was rerun successfully. Provider model-list regression tests: 3 files / 25 tests passed. Final diff whitespace check passed. The last test-type gate saw five new diagnostics in concurrently changing Antigravity factory integration (missing class/type fields); previous auth-only gate results do not establish a clean current global type gate.

Logs: `.reports/auth-final-tests.log`, `.reports/auth-final-webui-tests-rerun.log`, `.reports/auth-final-release-rerun.log`, `.reports/release-check-matrix/coverage.log`.

Resident user processes were not restarted. Temporary fixture directories from failed earlier harness launches remain: automatic approval review rejected recursive removal (reported reason: blocked by policy). Successful subsequent harness runs cleaned up their own processes and files. No commit or push was requested or performed.

---

# Auth flow audit — 2026-09-17

Scope: provider credentials through `wstack auth`, `/auth`, the Ink TUI,
WebUI provider settings, and SimpleUI. HQ authentication was included in the
route/store regression run; its password/2FA interface was not manually exercised.

## Current closure status

The production WebUI now has a connected browser smoke using the real isolated
standalone HTTP/WS backend: /auth routing, key save, active-key selection,
delete cancel/confirm, provider removal, and disk routing cleanup all passed.
Run `node packages/webui-server/tests/auth-live-browser-smoke.mjs --webui`.
Standalone startup also now resolves saved account aliases through their
canonical catalog/config-only factory, preserves the alias on Provider.id,
and avoids borrowing a legacy primary endpoint for proxy rewriting. Keyless
local aliases passed both configured-primary and first-saved fallback branches.
The focused server run passed 109 tests across six files.

HQ validation used the current source backend with freshly built HQ production
assets, an isolated dataDir, and fixture credentials. The browser verified
wrong-password rejection, Retry-After throttling, cookie login, logout, TOTP
enrollment, invalidation of the password-only session, single-use recovery
codes, authenticator login in the next time slot, and mobile password/2FA login
at 390x844 without horizontal overflow. Password/recovery plaintext was absent
from the persisted auth file. Six focused HQ suites passed 75 tests. Run
`pnpm exec tsx packages/cli/tests/hq-auth-live-browser-smoke.mjs`.
These checks passed; actual provider OAuth/expired/revoked credentials and
full-suite/release validation remain open.
The latest global test-type gate reports ten diagnostics outside this follow-up:
four in core skill suggestion/client fixtures, four in provider response
fixtures, and two in Telegram poller tests. Server source typecheck passed.

Live validation now includes a freshly built standalone backend and production
SimpleUI assets, with an isolated WRONGSTACK_HOME and fixture credentials.
The browser drove account/key creation, active-key selection, delete cancel/
confirm, account removal, and fallback cleanup through real HTTP/WebSocket
handlers, then verified the encrypted disk records. This found and fixed a
standalone startup crash for an explicit wrongstack-setup provider. Six focused
server suites passed 104 tests; server build/source typecheck passed.
`node packages/webui-server/tests/auth-live-browser-smoke.mjs` reproduces it.

`node packages/webui-server/tests/auth-process-smoke.mjs` separately verifies
eight simultaneous process writers, preservation of independent account edits,
one winner/one conflict for the same account, and encrypted tokens. Both checks
passed. The latest global test-type gate reports seven diagnostics outside
this follow-up (core typesafe-client, provider response fixtures, and Telegram
poller tests). Live WebUI/HQ browser flows, provider-account OAuth/expired/revoked
credentials, and full-suite/release validation remain open.

Two directories from failed startup probes remain because recursive cleanup
was rejected by automatic policy: wrongstack-auth-live-tuDc4Z and
wrongstack-auth-live-ZrhJtx under the Windows temp directory. Their backend
and child processes were stopped. Later successful probes cleaned their own
temporary state.

WebUI key/account removal now asks for an in-app confirmation with Cancel as
the default action. Removal and active-key selection use correlated server
acknowledgments and block duplicate submission. The current follow-up passed
81 tests across five files, WebUI build/source typecheck, and diff checks.
The validation entries below record separate historical passes. At this
checkpoint the global test-type gate reports 12 new diagnostics outside this
follow-up: seven parse errors in core's `config-loader-extra.test.ts`, two in
providers' `openai-compatible.test.ts`, two in Telegram's `poller.test.ts`, and
one missing TUI connection-health export.

The audit remains open for actual provider login/refresh and expired/revoked
credentials, connected WebUI/HQ flows (including password/2FA), separate-process
config contention, and full-suite/release validation. Resident user processes
have not been restarted to run the rebuilt packages.

## Repairs

- WebUI now discovers `/auth` in its command picker and opens provider settings
  locally. SimpleUI offers a credentials panel through `/auth`, a key icon next
  to Settings, and Utilities. It supports API keys, OAuth aliases, local/custom
  endpoints, active keys, and confirmation before deletion.
- Provider removal uses shared cleanup for defaults, favorites, fallback chains,
  model roles/tiers, autonomy, brain, and council references. CLI and standalone
  WebUI now follow the TUI's cleanup behavior.
- Independent stale provider snapshots merge with the current configuration.
  Conflicting changes to the same provider produce a refresh/retry message.
  Writes use the shared file lock so auth and preference mutations cooperate
  across processes, while retaining atomic replacement and vault encryption.
- Standalone WebUI save failures propagate to the caller instead of producing
  a successful operation result. A failed save does not block later retries.
- Invalid config shapes cannot be overwritten by credential operations. Invalid
  or unreadable config is reported by the auth views rather than silently shown
  as an empty provider list.
- Cancelled/replaced OAuth sessions cannot persist a late completion. Pending
  session creation observes cancellation, completed sessions close their
  resources, and duplicate completions cannot save twice. Closing either browser
  credentials interface cancels its pending sign-in.
- New OAuth aliases retain their canonical provider type; WebUI account grouping
  uses provider metadata as well as legacy name prefixes.
- The REPL status dashboard also recognizes legacy single-key configurations.

## Evidence

- Broad provider/TUI/SimpleUI/WebUI-server/HQ auth regression run: 63 files passed,
  1035 tests passed, 2 tests skipped. The opt-in PTY test ran separately.
- WebUI slash routing and OAuth account component tests: 162 passed.
- Final persistence/auth regression run after adding shared file locks: 80 passed.
  Real temporary-file tests cover concurrent snapshots, conflicts, encryption,
  routing cleanup, and preservation of unrelated configuration.
- Real built CLI in a PTY: `/auth` navigation, local/OAuth views, Ctrl+C survival,
  `/auth login` reopening, and absence of the plaintext fixture key passed.
- Real Chromium with isolated SimpleUI fixtures: 1280×800, 390×844, and 390×300
  passed for key save, failed deletion, confirmation, OAuth cancellation, and
  dialog bounds. Run `node packages/simpleui/tests/auth-browser-smoke.mjs`.
- CLI, WebUI-server, WebUI, and SimpleUI typechecks passed. The authoritative
  test-type gate reports zero new diagnostics; historical baseline diagnostics
  remain. WebUI and SimpleUI production builds passed.

## Auth profile follow-up

Account creation is now separate from adding a key inside a saved profile.
`--alias` is forwarded through the actual CLI dispatcher for API key, OAuth,
and local preset operations. CLI/TUI account creation suggests an unused
alias, and duplicate API-key profile creation is refused. Existing multi-key
entries remain supported without migration or copying their credentials.

Fallback reference identity is the account alias plus model. Controlled HTTP
tests with real provider construction verify that the same model can fail with
429 on one account and succeed with another account's active key. The primary
account's health block, legacy top-level credential, and endpoint do not leak
into the other account. Config-only construction retains canonical factory
selection while preserving profile IDs, including keyless local wire presets.
Wire factories also accept active multi-key credentials and preserve profile
identity in HTTP/stream errors. Reserved or slash-containing aliases and OAuth
alias reuse across different providers are refused.

WebUI account creation now remains available for already configured providers.
Model candidates display the alias and canonical provider type, keep identical
models on separate accounts, and refresh when a saved profile changes. SimpleUI
has separate account/profile creation and within-profile key management.

Independent account writes also preserve an unchanged primary provider/model
selection, including legacy top-level credentials and environment-backed
profiles. Deleting or editing the primary still applies stale-default cleanup;
setup mode continues to retire after credentials are configured. The final
persistence/auth regression run passed 95 tests across five files. WebUI
regressions passed 262 tests across nine files, and both browser builds passed.

The follow-up regression run passed 636 tests across 35 files; the rebuilt
CLI's PTY auth navigation/cancellation test also passed. CLI, WebUI and SimpleUI
typechecks passed. The latest global test-type gate has six new diagnostics in
concurrent work: four TS2412 errors in `packages/cli/tests/provider-persisters.test.ts`
and two TS2722 errors in `packages/telegram/tests/unit/poller.test.ts`. It reports
no new diagnostics in this turn's modified auth files. The global gate is not
green, despite the scoped auth checks passing.

## Evidence still needed

Auth mutations now echo an optional request id on operation results, including
validation failures, on both embedded and standalone provider handlers.
SimpleUI ignores unrelated results while a credential request is pending.
WebUI account/custom-provider/key-add forms wait for the matching success
acknowledgment before clearing their values; failure, cancellation, or timeout
keeps input available. New account probes run after confirmed persistence.
The follow-up passed 217 WebUI tests across six files and 117 server/SimpleUI
tests across seven files. SimpleUI browser smoke passed at 1280x800, 390x844,
and 390x300. All three package builds/source typechecks passed. The global
test-type gate currently has eight new diagnostics in concurrent work: four
in core suggest files, two in `openai-compatible.test.ts`, and two in Telegram's
`poller.test.ts`; no new diagnostics were reported for this auth follow-up.

Credential hot-reload now targets the live account rather than the configured
primary, serializes config reads/applies/rebuilds, and uses the shared model
transition gate. A queued reload cannot overwrite a provider selected ahead of
it. Failed rebuilds invalidate old complete/stream entry points instead of
keeping removed credentials usable; recreation or a repeat reload can recover.
Regressions cover fallback account refresh, deletion/recreation, both request
entry points, transient construction failure, model-switch ownership, and
successive writes while awaiting a catalog overlay. The focused run passed
205 tests across ten files; CLI build/source typecheck and diff checks passed.

OAuth refresh persistence now carries the originating key label and token
identity from provider construction. A late rotation updates that key even if
the active selection changed, and is ignored if the credential was deleted or
replaced by login. Both regular CLI/ACP persistence and modeldiag use the same
update helper. Live model discovery is ignored for replaced or inactive source
credentials. Tests cover independent account aliases, encrypted rotated tokens,
and repeated rotations advancing the source identity. This follow-up passed
178 tests across 11 files; providers/CLI builds and source typechecks passed.
The latest test-type gate reports four new diagnostics outside these changes:
two in `openai-compatible.test.ts` and two in Telegram's `poller.test.ts`.

Explicit account aliases no longer inherit legacy top-level connection values
when selected as primary or when the primary selection is absent. Canonical
legacy provider configs retain that compatibility. Runtime construction,
modeldiag smoke probes, and proxy instant-apply use the same raw connection
resolver. Modeldiag's config-only factory lookup also preserves the canonical
type for keyless local aliases. Real provider HTTP regressions verify that
promoting a fallback account keeps its own key and canonical endpoint.
This follow-up passed 115 tests across six files plus 173 auth/OAuth tests
across nine files. CLI build, source typecheck, and diff checks passed. The
latest test-type gate reports eight new diagnostics in concurrent test work:
four in `provider-persisters.test.ts`, two in `openai-compatible.test.ts`, and
two in Telegram's `poller.test.ts`; none are in the changed auth test files.

The merged WebUI provider store now separates its visible snapshot from the
writable file snapshot. Adding an account keeps project-inherited accounts
visible without copying their credentials to the active file. Editing or
deleting an inherited or overridden account reports its config-source boundary.
Regressions cover repeated add/update/delete, project overrides, and concurrent
edits to distinct owned accounts. The scoped persistence/fallback suite passed
62 tests across three files, and the CLI build passed.

This is scoped auth validation, not a full release certification. Actual provider
account login/refresh, expired/revoked credentials against provider backends,
manual WebUI/HQ browser flows, separate-process contention stress, the complete
test suite, and `release:check` were not run. Existing resident user processes
were not restarted. Unrelated concurrent workspace changes were preserved.
