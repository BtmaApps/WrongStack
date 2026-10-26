# WrongStack Desktop v2

Native Tauri application for multiple projects and persistent WrongStack sessions.
All project/session interfaces belong to this application. It does not open, embed, or import
the WebUI frontend.

## Run the portable application

`bun run desktop:v2:build` creates an immutable build under `dist-native/<ui-hash>-<engine-hash>/`.
`dist-native/latest.json` identifies the newest build. That build directory contains:

- `wrongstack-desktop-native.exe` — the application to open.
- `wrongstack-engine.exe` — the bundled WrongStack runtime; keep it beside the application.
- `SHA256SUMS` — checksums for both executables.

Copy the whole folder to the target Windows machine. Bun, Node, repository files, and workspace
packages are not required there; WebView2 remains the OS webview dependency. The engine uses the
canonical standalone bootstrap and daemon/script dispatch, with only backend runtime assets.
WebUI frontend bundles are excluded. Static WrongStack logos and canonical color tokens are
synchronized at build time; no WebUI components or runtime styles are loaded. Both executables
are currently unsigned. The native icons are owned original assets in `src-tauri/icons`; brand
synchronization does not require the legacy Electron application.
New builds leave binaries used by open sessions in place. Existing sessions remain on their
original host; an older host can run beside a newer project-service host without restarting them.

## Develop

With the pinned Bun version, Rust/MSVC, and WebView2 installed, from the repository root:

```powershell
bun install --frozen-lockfile
bun run build
bun run desktop:v2
```

The launcher supplies absolute Bun and desktop engine entry paths. The native shell does not
need `packages/webui/dist`. `engine/main.ts` reuses shared backend services and transport from
`@wrongstack/webui-server`, with an empty static directory and browser opening disabled.
That package supplies backend services, not UI.

```powershell
bun run desktop:v2:build
```

The build first compiles the backend dependency closure, packages a standalone engine, builds
the Tauri application, and stages the portable folder. The native host discovers the engine beside
the application, before copying itself into its persistent host directory. Development still
uses the Bun/script paths supplied by the launcher. `WRONGSTACK_DESKTOP_ENGINE` may select an
explicit engine executable. There is no fallback to `wstack --webui`.

## Implemented

- Native project registry, project/session navigation, fleet wall, search, history, attention
  filters, activity timeline, command palette, and separate native project windows.
- Multiple agent and terminal sessions per project, persisted in SQLite.
- A project tree can expand several projects at once. The overview groups sessions by project;
  open session labels retain their project identity. Focused work removes repeated hero/session
  headings. Chat, files, and review stay close; project knowledge and configuration have their
  own workspaces rather than becoming conversation tabs.
- Native appearance settings provide System/Light/Dark modes and all 13 canonical WrongStack color pairs.
  SQLite stores the preference; a local cache avoids a mismatched initial paint. System mode
  follows device changes, and open xterm terminals update their colors without restarting PTYs.
- A dedicated session workbench replaces the fleet cards while working. Native session tabs
  survive UI restart; closing a tab detaches without killing the session. Unsent drafts remain
  isolated per session while the UI is open. Returning to the fleet keeps the open tabs available.
- Dedicated desktop chat/composer, streamed messages, grouped session activity and readable approval
  cards with command arguments, edit previews and remembered policy scopes; completed-turn next
  steps can be selected and added to a draft. File review, skills reader,
  native provider/key onboarding, session model selection, reported token usage,
  and estimated cost.
- The session composer keeps model/effort beside one delivery-mode selector. BTW reaches the current
  leader without interrupting; persistent queued prompts belong to the engine. Stop-and-steer waits
  for the actual turn boundary and refuses ambiguous pending-queue ordering. Prompt refinement uses
  a focused original/refined/English review dialog, explicit approval, editing/retry and the real
  refine-before-send preference. See the [chat checklist](../../docs/desktop-v2-chat-parity.md) for
  the action-level inventory and remaining work.
- The compact composer adds `@` project file references and canonical `$skill-name` completion,
  with keyboard insertion and caret restoration that never submits. Reference chips and drafts
  remain isolated across session tabs. Up/Down recalls prompts while retaining the unsent draft;
  native slash commands open actual desktop workspaces or acknowledged engine operations.
- Prompt library and journal are project-owned, available before creating a conversation. Templates
  support search/categories/favorites/recent, required/default/enum/multiline variables, Markdown
  preview, append-to-draft/copy and verified creation with an unsaved-close guard. The dedicated
  composer journal shortcut exposes real original/final records, filters and append reuse.
- The session context inspector separates current calibrated token estimates from billed usage,
  reads effective instructions explicitly and offers repair, normal/aggressive compaction and
  guarded provider-context clear. Clearing retains the native session and disk conversation.
- The composer accepts image/PDF picker, paste and drop, with local image normalization, explicit
  file/count/transport limits, thumbnails, named PDF cards and per-session draft retention. Binary
  files survive refinement and real queue persistence; running Message/BTW with files visibly queues
  a new turn. Canonical engine refusal retains the draft. Conversation images open a local preview;
  stop/edit restores the previous prompt and files. Draft media is not yet durable across app restart.
- Desktop-owned Markdown chat supports headings, tables, lists, inline/fenced code, message/code
  copy controls, and project-file links through the engine. HTTP(S) links open through a validated
  native OS boundary. Raw HTML is skipped; images are represented by explicit links rather than
  automatically fetching remote content. Reading older messages pauses automatic scrolling.
- Native structured input cards support grouped questions, single/multiple choices, write-ins,
  recommendations, explicit delegation, required-answer validation, and cancellation. The form
  stays pending until the engine resolves it. Pending forms replay after UI reload/restart;
  unsubmitted answer drafts survive session-tab switches within the current UI process.
  Pending questions receive the main chat area, with a separate conversation-review control;
  the composer returns when the request resolves.
- Provider settings load the engine catalog and saved connections, accept preset API keys or a
  custom OpenAI-compatible endpoint/model, and wait for correlated engine acknowledgements.
  Provider secrets use the existing encrypted engine vault; saved keys are masked. First-run
  sessions offer setup inside desktop before enabling message submission.
- Existing WrongStack providers, tools, permissions, context, and agent execution behind the
  native transport. Desktop controls do not bypass the engine's permission gates.
- A bounded native HTTP bridge reaches backend feature APIs while retaining the private token
  and origin in Rust. Calls use their owning project/profile/session runtime, refuse redirects, and cannot select
  arbitrary origins or frontend resources. Desktop owns project/workdir/session lifecycle.
- Project workspaces work with zero desktop sessions: SAGE has a React Flow map of stored relationships, direct counts, lightweight previews and an optional library,
  real topic/file relationships, retention/evidence/audience editing, review proposals, named
  Doctor repairs, retrieval scoring, explicit deletion and recovery. Vector storage has its
  own status/search surface. Kanban has
  boards, task editing, labels/priorities, drag/drop and managed transitions; Code Atlas indexes
  actual project code and drills from packages to files and symbols with source preview,
  three layouts, explorer, minimap, centrality, relationship filters, guided tour, directed
  dependency paths, anchored SAGE evidence and file history.
- Files provides a directory tree, folder browser, multiple document tabs, text editing,
  acknowledged save/readback, external-change conflict handling, image preview and actual
  create/rename/move/delete operations. The resizable bottom panel contains file overview,
  diff, canonical structure, Chronicle activity, SAGE anchors and Code Assist.
  Conversation-side Files/Review/Skills use the owning project service too; they do not depend
  on the conversation engine's feature version or require its restart. Links retain the
  conversation workdir while documents share the project's file identity.
- Changes provides unified/split line diffs, review notes, stage/unstage, commit/discard,
  branch/tag history, commit metadata/parents, changed files and committed diffs.
- Project Chronicle provides bounded timeline queries, time/file/event/outcome/actor/model filters,
  cursor pagination, summary totals, event details, stored evidence relationships and collector
  health. Code Assist in Files and Atlas uses the engine's dedicated analysis run/abort contract.
- Project and profile skill libraries separate writable owned skills from bundled/foreign sources.
  Discovery/filtering, Markdown instructions/editing/preview, creation, validation, save/readback,
  draft-leave protection, supporting files/references, Git lifecycle controls and export use the
  canonical engine handlers. Files can explicitly reveal Git-ignored source directories while
  preserving the shared project-containment policy and default tree filtering.
- WrongStack settings work before adding any project. Provider/model configuration, execution,
  context/reasoning, capabilities, named fallback profiles/ordered chains, role/phase model routes,
  cost tiers, optional resource limits, logs and MCP connections use human-readable controls
  and acknowledged saves with readback. Independent nested edits are retained and detected
  same-field conflicts preserve the operator draft. Desktop Appearance remains a separate preference surface.
- Project automation management and model-access test results. Generic JSON/action-form pages
  have been removed from navigation. The broader capability catalog is an acceptance inventory;
  it is not full feature parity;
  see the [acceptance inventory](../../docs/desktop-v2-feature-parity.md).
- Rust host owns PTYs, backend processes, and persistent engine connections. Closing a pane
  detaches; restarting only the UI preserves the same live core session and PTYs.
- Append-only PTY transcripts and engine journals replay after UI reload/restart. Host crashes
  and machine reboots terminate processes; recovered records are marked **interrupted**.
- Binary terminal output with one 64 KiB frame in flight; xterm acknowledges parsing before
  another frame is sent. Unattached output stays on disk.
- Authenticated non-HTTP loopback host protocol, OS election locks, bounded frames/concurrent
  clients, private endpoint permissions, and canonical project containment checks. Engine
  transport tokens and backend URLs never enter the renderer.
- Native localhost preview windows with DevTools and zero host IPC capability. These preview
  project output; they never host project/session UI.

Default data is `%LOCALAPPDATA%/WrongStack/desktop-v2-native`. `WRONGSTACK_DESKTOP_DATA` selects an
isolated directory for tests. Earlier prototype data under `desktop-v2` and its active sessions
remain untouched. Hosts run from a private executable copy so they do not lock the UI binary
against subsequent builds.

Workdirs currently stay inside a registered project. External linked worktrees can be registered
as projects until workdir overlays land. Read-oriented feature panels are not full control parity.

## Verify

```powershell
bun run --filter @wrongstack/desktop-v2 typecheck
bun run --filter @wrongstack/desktop-v2 test
bun run --filter @wrongstack/desktop-v2 test:native
bun run --filter @wrongstack/desktop-v2 check:native
```

With `bun run --filter @wrongstack/desktop-v2 dev:web` running:

```powershell
cargo build --manifest-path apps/desktop-v2/src-tauri/Cargo.toml
bun run --filter @wrongstack/desktop-v2 test:native-ui
```

To verify the actual portable output without a dev server:

```powershell
bun apps/desktop-v2/tests/native-smoke.mjs --release --bundled
bun apps/desktop-v2/tests/native-smoke.mjs --release --bundled --companion
# Focused composer scope; does not replace the full native suite:
bun apps/desktop-v2/tests/native-smoke.mjs --release --bundled --composer
bun run --filter @wrongstack/desktop-v2 test:engine-concurrency
```

The Windows smoke exercises real Tauri/WebView2, ConPTY, SQLite, and the production backend. It
creates two projects and three concurrent PTYs, checks resize/input/output, reloads and restarts
the UI, checks host identity, starts a native agent session, requests real core stats, reads a
project file inside desktop, switches native panels, restarts the UI again, and asserts the same
core session identity. It asserts that no WebUI window exists and the endpoint method is absent.
It covers navigation and an 800 px layout. Bundled mode verifies the portable checksums, copies
both executables outside the repository, removes the development engine overrides and Bun/Node
from PATH, and checks persisted tabs and per-session draft isolation. An isolated loopback model
fixture exercises native onboarding, provider/key saves, a backend refusal, streamed chat,
encrypted configuration, credential-free engine journals, and saved-provider use from a new
engine process. It also exercises Markdown/copy controls, an actual project-file link, and the
engine's real `clarify` tool: submit, cancel, required fields across groups, UI reload while waiting,
and draft isolation across session switches. Appearance checks exercise mode/palette persistence,
system changes, compact settings, and live terminal colors. Project checks exercise memory
create/delete/recover and isolation, Kanban create/edit/drag, real indexing and Atlas/source
drilldown with zero sessions. Profile checks save preferences and configure/remove a disabled MCP
connection. They also exercise global instructions (Markdown, draft retention, stale-revision
refusal, guarded reload and empty saves), real tool enable/disable with on-disk profile checks,
and provider/model availability windows with invalid-timezone refusal, overnight semantics and
allow-only behavior. The companion variant exercises an independent project-service host beside the
session host. Neither variant uses a WebUI frontend.
Developer-shell credentials are removed from the test environment; no external
LLM request is sent. Test processes/data are
removed; screenshots remain in `.temp_files/desktop-v2-native/`.

The detached-PTY proof found ConPTY waiting for its first cursor-position response. The host now
consumes/answers that handshake without a renderer and omits it from replay. Unit tests cover
split reads and preservation of subsequent queries.

Validation results are recorded by the current run; the native smoke writes its final
`native-result.json` only after behavior checks and isolated test cleanup succeed. A unit pass
or a navigation mapping is not native workflow certification. The provider fixture uses the
OpenAI-compatible protocol locally; paid/external provider authentication and live model quality
are outside that proof.

See the dated [validation report](../../docs/desktop-v2-validation.md) for observed results,
the host request-pool change, earlier failures, and retained test-cleanup limitations.

## Remaining release work

This is a working native vertical slice, not production parity. Remaining work includes inline
media/attachments, richer language-aware editing, and persisted unsent drafts across UI restart; provider OAuth and full key-management controls; advanced Kanban workflows, SDD, goals,
and remaining domain workflows; complete automation worker/GitHub, SAGE injection traces and
recovery/backfill administration, vector mutation and maintenance;
fleet-wide approvals and usage aggregation; verification-loop state;
workdir overlays; preview profile isolation; window geometry; migration; signed updates/installers;
and the full release matrix. The current portable payload includes the complete Bun engine;
installer size and performance budgets still need measurement against the original targets.

The [analysis](../../docs/desktop-v2-analysis.md) originally proposed WebUI frontend reuse. The
product owner's explicit requirement on 2026-10-25 supersedes that: G5 now requires desktop-owned
UI directly reaching the motor and surviving UI restart. Three concurrent PTYs are tested; the
3 × 10k lines/s/no-dropped-frames benchmark, long-scrollback QA, preview DevTools gate, startup/RAM
budgets, full coverage, and hosted CI are not certified. Electron release distribution is unchanged.
