# Desktop v2 validation — 2026-10-27

This report describes the current dirty working tree, not a release certification.
The portable build contains the desktop executable and its separate WrongStack engine.
Initial implementation baseline: `38d075a6c8e1d0eacb1c603fcab4a6b204f11bc1`, with existing shared dirty work preserved.
The prompt-resource follow-up was finally built/checked against `75dd9964f7b75c0892e495b8bb78d2139e1ed061`
plus the scoped desktop changes. Other shared-worktree commits advanced HEAD during implementation.

## Experience changes

- Project groups organize the overview; multiple project branches can remain expanded.
- Session labels retain their project identity. Focused work has one context header.
- Chat, files, review and session tools remain immediately accessible. Project Memory, Kanban,
  Code Atlas, Files/Review/History, Chronicle and Automations open independently of conversation sessions.
- System/Light/Dark and all 13 canonical WrongStack paired palettes apply to the shell and live terminals.
  The original five-block mark and native icons are copied unchanged. Build-time synchronization
  keeps labels, paired swatches, mode-specific signals and neutral surfaces aligned with WebUI.
  Preferences persist in native SQLite; the renderer cache is only an initial-paint aid.
- SAGE opens a React Flow map of stored relationships and canonical record totals. The initial
  page sends bounded card previews, counts and metadata, with no full record/evidence bodies.
  Edges come only from persisted SAGE relationships; shared tags do not fabricate graph links.
  Nodes have explicit keyboard-accessible detail actions. Full records load on selection; the
  paged library and explicit edit/create/recover workflows remain available. Vector Memory and
  vector search remain separately mounted, independently requested workspaces.
- Kanban uses a visible project-board list with canonical summary counts/progress and Board/List
  task views. Details add contract dependencies, type, due date, effort, retry/cost limits,
  acceptance checks, notes, assignment, verification/file scope and canonical activity. Saving
  blocks task/board reselection and late responses cannot replace a different selected board.
- Code Atlas indexes real code and drills packages/files/symbols with a source drawer. Its
  Architecture, Subsystems, Dependency matrix and Change impact views use the same canonical
  graph. Impact walks directed incoming/outgoing references with explicit hop limits.
- SAGE and Vector Memory have separate surfaces. SAGE adds proposal review/accept/reject,
  named Doctor checks/repairs, audience eligibility, revision-protected evidence/retention editing,
  retrieval score breakdown and canonical file associations.
- Files adds a tree/folder browser, editable document tabs, acknowledged save/readback,
  external-change handling and file/folder mutations. A resizable bottom panel opens overview,
  structure, activity, anchored SAGE, diff and Code Assist. Review adds staging, commit/discard,
  split/unified line diffs, line notes and commit/branch/tag/file history.
- Atlas adds three layouts, explorer/sort, minimap, tour, centrality/relationship filtering,
  directed dependency paths, grounded SAGE evidence, file history and Code Assist. Relative
  project paths disambiguate repeated basenames in the explorer.
- Chronicle adds a project timeline, canonical filters/cursors/summary, detailed event evidence,
  confidence-labelled lineage graph, file navigation and collector health.
- Skills adds separate project/profile libraries, source ownership, bundled/foreign read-only
  views, create/edit/preview, validation/readback, draft protection and supporting-file navigation.
  Explicit file links can reveal Git-ignored source folders without changing default filtering.
- Files/Review/Skills beside a conversation now use the owning project service. Conversation
  engines receive no file reads; retained older engines can keep running. Relative links respect
  the conversation workdir while file tabs and drafts retain their project identity.
- Provider/model fields hydrate when journal replay arrives after the settings component mounts;
  an operator's edited selection is preserved.
- WrongStack profile settings work before adding any project. Searchable navigation leads to
  ordered fallback chains/named profiles, role/phase model and reasoning overrides, cost tiers
  with worker budgets/leader guards and optional shared-contract resource limits. Drafts survive
  section navigation. Saves read current values first, preserve independent nested changes,
  refuse detected same-field conflicts, and verify the actual result. This is not an atomic
  compare-and-swap transaction; a race after the preflight read is not eliminated. Clearing a
  limit restores inheritance. Zero main-agent iterations is accepted as unlimited.
- Kanban details separate Definition, Execution, Evidence, Breakdown and History. Execution reads
  canonical provider/model/skill/tool/capability catalogs, saves assignment policy and explicitly
  dispatches a real isolated worker. Results read the canonical lastResult field. Verification
  reports, manual splits and proposal approval/rejection have dedicated controls. Definition saves
  send only changed fields, preserving concurrent assignment settings.
- Atlas exposes Smart scope and All nodes. Layout no longer silently truncates at 160 nodes;
  a native 182-file fixture verifies full rendering and selecting a file beyond the smart budget.
- Native project/profile services require the exact bundled-engine build identity before reuse;
  an older human host retains its sessions while a matching service host uses a versioned directory.
- New portable builds use immutable directories and do not overwrite a running engine. A newer
  project-service host can coexist with an older host while sessions stay on their original host.

## Settings management follow-up

The working tree now adds dedicated global instructions, tool availability and model availability
settings. Global instructions use the canonical user document and revision token, support Markdown
preview, retain drafts between settings sections and require explicit discard on reload. Tool
settings show the real registry and its owner/permission/input metadata; mutations verify catalog
readback and persist through the active profile writer. Availability windows expose provider/model
targets, enabled state, weekdays, local times, IANA zones, blackout/allow-only behavior and a weekly
wall-clock preview. The engine remains authoritative for the combined scheduling decision.

Native verification caught tool toggles changing only the in-memory ConfigStore. A new regression
uses the real registry, ConfigStore and profile writer: the profile must retain fresh disk siblings,
and a write refusal must restore registry state and return a correlated error. Both assertions failed
before the persistence fix and passed afterward. The focused six backend suites passed 35 tests.
A native test also clicked the previous file graph before symbols loaded; it now waits for the
actual fixture symbol. An initial follow-up build failed because brand sync still copied icons from
the removed legacy shell; native icons now belong to this application independently. These failures
are retained under `.temp_files/desktop-v2-native/`.

Follow-up checks: 97 desktop tests (26 files), 35 focused backend tests (6 files), 10 Rust tests,
desktop/backend type checks (85/307 files), Biome (148 files), Cargo formatting and documentation
links (1505 local links, zero missing targets) passed. The 1.2.2 portable build
`378a4be7409e-3a47a9811cc1` compiled successfully. Its expanded native run passed the existing
project and settings-policy workflows, then failed on global-instruction revision handling before
reaching the tool/calendar workflows. The follow-up full native gate is INCOMPLETE; no full pass
is claimed for this build. Previous identity-named results do not certify these new workflows.

## Previous chat and composer follow-up

The desktop-owned composer now exposes session model selection/search and reasoning effort,
Message/BTW/Queue/Stop-and-steer modes, actual engine queue controls, stop/edit with draft protection,
and an original/refined/English refinement dialog with editing, retry and explicit approval.
The real profile refine-before-send preference is respected; its pending state blocks sending until
acknowledgement and readback. Default profile refinement was already enabled, so the ordinary-chat
fixture now deliberately disables it before testing direct send, then tests automatic refinement
separately. A clipped dialog was corrected and both dialog and composer are checked at 800 px.

| Check | Observed result |
|---|---|
| Desktop tests | PASS: 106 tests / 27 files |
| Backend focused tests | PASS: 66 tests / 5 files (session prompt queue, conversation operations, model operations, preferences and mailbox) |
| Type checks | PASS: 89 desktop source files and 307 backend source files |
| Biome | PASS: 152 desktop and changed backend files |
| Portable engine, Vite and Tauri build | PASS: 1.2.2, `8313cd4893ba-bb2549870276` |
| Standard-host native composer scope | PASS: `composer/native-result-8313cd4893ba.json`; isolated cleanup completed |
| Companion-host native composer scope | PASS: `composer-companion/native-result-8313cd4893ba.json`; isolated cleanup completed |

The queue correlation tests observed two assertion failures before the backend change and both
passed afterward, alongside the legacy controls. Correlated queue mutations now receive an
acknowledgement or refusal; a generic correlated error rejects the originating desktop operation.
Queue execution remains engine-owned. Drained user turns appear once, foreign-session frames are
ignored and a delayed snapshot cannot restore an already-started prompt.

The native composer cases ran actual portable Tauri/WebView2, native IPC, production engine and an
authenticated loopback provider. They exercised model/effort save/readback and Auto inheritance;
BTW without a second provider turn or abort; persistent queue add/remove/reload/drain; refusal to
steer over pending queue entries without losing the draft; abort/restart steering; stop/edit with
existing-draft protection; bilingual refinement, keep-original, editable English approval and
automatic refinement while preserving Queue mode. Both runs also retained the existing real
clarification submit/cancel/reload and appearance checks. There were no renderer page errors.

This is an explicitly scoped composer PASS, not a new full-native or release certification. The
previous settings-management revision/cleanup failures above remain unresolved by this round;
that workflow is not included in the focused composer mode. The default native suite still runs
all project/settings workflows and now includes the composer exercise as well. External provider
quality, the entire WebUI action inventory and long-running concurrency are not certified.
The [chat action checklist](desktop-v2-chat-parity.md) records the remaining work without counting
buttons or navigation routes as parity. Evidence is retained in `.temp_files/desktop-v2-native/`.

## Prompt resources and context follow-up

This source snapshot adds project-owned prompt resources and session-owned context controls to
purpose-built desktop dialogs. The project header opens the library before any desktop conversation
exists. Composer shortcuts open the same resources without selecting a different project's runtime.
Templates provide categories/search/favorites/recent, Markdown details, required/default/enum/multiline
variables, append-to-draft/copy, verified user-template creation and an unsaved-close guard. Creation
uses a fresh collision preflight, not an atomic same-title compare-and-swap contract.

The journal reads actual original/refined records, exact session/date/category filters and bounded
windows. Its history button stays beside the composer. The standalone bootstrap now installs Core's
canonical recording middleware; original and approved refinement text survive queued persistence.
Host-generated runtime auto-wakes are excluded. Reads use independent project runtimes, not a
conversation engine, and do not create desktop conversation records.

The input adds project file references, canonical skill mentions, keyboard completion/caret ownership,
sticky Up/Down prompt recall and a desktop slash-command registry. Enter/Tab on a mention selects
without submitting, even while the catalog is pending or empty. File chips remain isolated on session
tab switches and survive refinement; stop/edit and queue-copy restore their reference metadata.
The provider receives explicit root-bound references and complete-read instructions, while human
message bubbles show file chips. Unsupported slash commands retain the draft instead of reaching
the model. Literal slash text uses double slash. Reference drafts are not yet durable across restart.

Context inspection shows the engine's calibrated current estimate separately from cumulative billed
usage. Effective instructions require an explicit read. Repair, normal/aggressive compaction and
provider-context clear use correlated acknowledgements. Clear requires confirmation and retains
native/disk session identity. Failed reads show an unavailable state rather than fabricated zero usage.
The full editable context/mode/residency workspace remains acceptance work.

Runnable regressions observed before/after evidence on the real production paths:

- Session context correlation failed its request-ID assertion while the legacy socket control passed;
  both pass after the route wrapper change.
- Core's canonical journal writer control passed while the standalone user-input pipeline wrote no
  journal record. The installed recorder now passes original/refined persistence and runtime exclusion.
- A direct human request did not receive its correlated acceptance; legacy controls passed. Direct
  submissions now acknowledge acceptance/refusal while retaining the real human user-turn origin.
- A native session-tab replay exposed stale running state and misrouted normal input as BTW. Delivery
  now waits until journal replay catches up. A Rust boundary test also proved the byte-bounded page
  could contain fewer than 200 events with more still pending. The host now reports an explicit
  continuation flag for both count and byte limits; the unchanged assertion is green.

Source checks for this follow-up: 114 desktop tests / 28 files, 82 focused backend tests / 6 files,
259 protocol tests / 15 files, 11 Rust tests, 96-file desktop typecheck and Biome over 180 files passed.
The backend typecheck passed over 308 source files. Cargo formatting and 1526 maintained local
documentation links also passed with zero missing targets.

The final portable build is `0cfbeb6a1c35-0d0505db8780` (1.2.2):

| Artifact | SHA-256 |
|---|---|
| Desktop executable | `0cfbeb6a1c3542ecf1c33d1184cdc134f8cb1a83c9edb805a2f28367399f88c5` |
| Bundled engine | `0d0505db8780bbe3477661bf037e80d5bff6db1df00236b37e334c462c58597e` |

Its standard-host and companion-host extended composer scopes passed all assertions and isolated
cleanup. Results are `composer/native-result-0cfbeb6a1c35.json` and
`composer-companion/native-result-0cfbeb6a1c35.json`. The native runs use copied portable binaries, actual
Tauri/WebView2/native IPC and the production backend with an authenticated loopback model fixture.
No external provider call or WebUI frontend was used. Earlier extended resource runs passed standard
and companion scopes on `d7bb03be2229-a5a8f20ae589`; those are historical identities.

The current run verifies project resources with zero conversations, template creation/variables/
favorite/recent/append/draft protection, journal originals/refinements/reuse/project isolation, @/$
keyboard selection without submit, references/tab retention/actual provider input, input recall,
native slash routing, effective instructions/repair/clear with native session count unchanged and
compact layout. The earlier model/effort/BTW/queue/steer/refinement/question/appearance flows remain
in the same scope. Renderer page errors were empty. Screenshots confirm the wide library toolbar
and settled context estimates after repair.

A scoped 205-file commit attempt passed corruption, logging and staged-import guards, then the
Core API snapshot hook refused regeneration because other snapshot inputs were dirty. No commit
was created and no hook was bypassed. The alternate index excludes unrelated shared work; its
reviewed diff and refusal log remain under `.temp_files/desktop-v2-commit/`.

The earlier full-native settings-management revision/cleanup failures remain unresolved by this
composer scope. Full WebUI parity, full coverage/release gates and external-provider quality are
not certified. Failure evidence is retained under the owned native evidence directory.

## Image and PDF attachment follow-up

Desktop-owned attachment processing now supports file selection, clipboard files and HTML file
drop events. Images are decoded locally, classified from their byte signature, normalized when
needed and capped at a 2048 px long edge / 4 MB processed size. PDFs retain their original bytes
and have an 8 MB per-file cap. Image/PDF counts are separate (8/4); whole-message and persisted
queue payloads have explicit, tighter frontend budgets. The canonical engine independently checks
MIME, bytes, PDF structure and model/fallback support. No WebUI component is imported.

The composer shows removable image thumbnails and named PDF cards without adding a permanent
panel to empty chat. Drafts are owned per session and survive tab navigation within the current
UI process. Files stay attached through refinement cancel/apply/approval; refinement operates on
the text only. Direct submissions require actual engine acceptance before clearing the draft.
Running Message/BTW with files visibly queues a new turn instead of sending a text-only mailbox
message. Stop-and-steer retains the files, and stop/edit restores the previous turn's media.
Queue copy explicitly says Copy text only when binary files remain in the engine queue. Persisted
PDF blocks now retain their filename and data in the drained conversation frame, with a regression
using the real QueueStore load/drain path. Conversation images open an explicit local preview;
PDFs use readable file cards. Remote or arbitrary data URLs are never fetched for these previews.

Native requests were previously capped at 1 MB and replies at 4 MB. A valid short-frame control
passed while a greater-than-1-MB attachment failed the real frame reader. The same assertion passes
after bounded 20 MB requests / 24 MB replies; incomplete and oversized frames still fail. Large
requests first query the host's supported request size, so retained older human hosts are refused
before transfer rather than being restarted. Older engines without direct user acknowledgement
cannot silently accept-and-discard file drafts. Existing user processes were not restarted.

Windows shell and project windows opt into HTML drag/drop using the installed Tauri API; file
drops outside an explicit workspace cannot navigate the shell away. Synthetic clipboard/drop events
exercise the actual WebView renderer path; they are not evidence of a physical OS file drag gesture.

The first native attempt used an unknown custom model without image-input capability. The engine
refused its vision fallback (present_artifact containment), kept both files and text in the draft,
and issued no provider turn. That is not a successful image-delivery result. Custom endpoint setup
now includes an explicit image-input capability checkbox, defaulting off; the isolated fixture uses
it rather than forcing all custom endpoints to advertise vision. The fallback's containment refusal
is not changed or certified by this round. The actual PDF processor successfully reached that
later image-routing refusal, so this failure was not a missing PDF runtime asset.

One intermediate dependency build reported missing contracts declarations after that package had
already built, causing module-resolution cascades. A later read found those declarations restored.
Concurrent shared output changes are a possible explanation, not an established cause. No unrelated
source was edited for those diagnostics. The complete retry built successfully.

Source verification: 125 desktop tests / 29 files, 83 focused backend tests / 6 files, 12 Rust tests,
and desktop/backend type checks over 98/308 source files passed. The current native identity and complete run results follow below.

The attachment-only build 6bebcd781651-afd3265efe3c passed standard and companion extended composer
scopes with isolated cleanup. Its retained reports are composer/native-result-6bebcd781651.json and
composer-companion/native-result-6bebcd781651.json. Two intermediate failures were harness defects:
the local provider's unanchored hold matcher interpreted an older quoted prompt as a current hold;
a PDF filename selector incorrectly required the combined name/size element's text to be exact.
The model-input, file-retention and queue assertions were not removed. These reports predate the
additional reply-boundary fix below and do not certify it.

Visual review of the real native transcript exposed a separate renderer defect: repeated backend
stream ID current appended a later answer to a historical bubble. A regression failed with one
merged answer while eight projection controls passed. The renderer now appends only to the active
trailing assistant stream; a completed or intervening user turn creates a distinct reply identity.
The same regression and the full 125-test desktop suite pass. Native assertions require the current
answer's Markdown heading in the assistant article immediately after the current user turn.

The final portable identity is 83a655728f00-22c9ed087701 (1.2.2). Both standard-host and
companion-host extended composer scopes passed with this exact pair of binaries, zero renderer
page errors and completed isolated cleanup:

| Artifact | SHA-256 |
|---|---|
| Desktop executable | 83a655728f00c662055435eada3553520bb22c27387e83a9799785054474730b |
| Bundled engine | 22c9ed08770180abeae0e63609572658fc57a8b615ae0a1e5c408778c6328629 |

Reports are composer/native-result-83a655728f00.json and
composer-companion/native-result-83a655728f00.json. They cover the greater-than-1-MB native request,
actual image bytes / extracted PDF text reaching the provider, local preview decoding, the new
reply-after-user assertion, invalid PDF refusal without a phantom user turn or discarded draft,
image decode refusal, session-tab draft retention, renderer paste/drop, refinement cancel/approval,
engine queue reload/drain and stop/edit media restoration. Compact and full-size native screenshots
were inspected. Physical OS drag gestures and external provider quality remain outside this scope.

Scoped Biome passed over 176 files; Cargo formatting and 1526 local documentation links passed
with zero missing targets. The 212-file alternate commit index was regenerated and reviewed. A
read-only evaluation of the actual snapshot hook still reports fail because unrelated snapshot
inputs are dirty; no new commit or hook bypass was attempted for that unchanged blocking condition.

Durable unsent media recovery across app restart, a full document viewer, physical OS clipboard/drop
QA and external-provider image/PDF quality remain acceptance work. This scoped composer run does
not replace the unresolved default-full-native settings-management gate or certify WebUI parity.

## Previous certified snapshot checks

| Check | Result |
|---|---|
| Desktop Vitest | PASS: 94 tests, 25 files, including nested settings merge/conflict/deletion, persisted-only SAGE graph edges, canonical branding and existing knowledge/files/skills contracts |
| Native Rust tests | PASS: 10 tests, including exact engine-build service compatibility, project/service ownership and bounded request-pool concurrency/queue/drain |
| Backend focused suites | PASS: 77 tests / 3 files in the final focused memory-handler/memory-route/preferences run, including summary-only payloads, bounded graph roots and the unchanged full-record contract. Prior focused Kanban/provider sets are historical evidence; this is not the entire backend suite |
| Desktop and backend typecheck | PASS: 81 desktop files and 307 backend files in the final source check |
| Biome and Cargo formatting | PASS on the changed desktop/backend files |
| Backend dependency closure, standalone engine, Vite and native release build | PASS |
| Documentation links | PASS: 1509 local links, zero missing targets |
| Two standalone engines in one project | `5c016c9c96b7` engine PASS; latest standalone-only probe NOT RETESTED. The current native UI run separately exercises two live agent processes and their local-provider turns |
| Full portable native UI smoke with companion host | PASS: current 83c5a7ce1d39-41e0fb0c9513; full functional flow, settings policy persistence/concurrent edits, summary-first SAGE React Flow, all 26 palette/mode combinations and isolated cleanup; companion/native-result-83c5a7ce1d39.json |
| Standard-host full native smoke | PASS: current 83c5a7ce1d39-41e0fb0c9513; full functional flow, all 26 palette/mode combinations and isolated cleanup; native-result-83c5a7ce1d39.json |

Previous verified portable identity: `83c5a7ce1d39-41e0fb0c9513`, retained in the identity-named
`apps/desktop-v2/dist-native/` directory. `latest.json` can advance before native certification. Standard completion:
`2026-10-26T18:37:55.869Z`; companion completion: `2026-10-26T18:42:01.699Z`.
Both runs finished all assertions, recorded no renderer page errors and completed isolated cleanup
before writing PASS. The existing primary host and human engine were left running.
Earlier identity-named results are historical evidence; a functional PASS does not certify
long-running startup or renderer stability.

The native runs checked the original rendered logo and all 13 pairs in both modes against the
canonical primary, paired accent and neutral surface values. Primary-button and body text met
4.5:1; saved appearance, legacy preference migration, OS mode changes, an 800 px layout and
live terminal theme updates passed. The largest emitted JavaScript chunk is 352.52 kB,
below Vite's 500 kB advisory threshold.

Native verification exposed and corrected stale Memory filter results, a write/filter race,
an invalid form minimum for the engine's valid zero continuation budget, and Atlas selection
loss during an index refresh. Backend tests caught and verified the fix for an MCP socket
identity regression introduced by reply correlation. The local provider fixture now tolerates
engine-generated context notes after tool results, and the restart test waits for the entire
saved navigation state before closing the UI.

The standard-host run reached its first chat request and the bundled engine crashed with:
`Failed to start HTTP Client thread: The paging file is too small for this operation to complete. (os error 1455)`.
Evidence is retained in `89433510-6b2c-4869-8a5b-80735cb726ff.log`. This is an observed failure,
not a passing standard-host certification. No Windows paging settings or unrelated processes
were changed. Failure screenshots/CDP shutdown are now bounded so a stalled WebView cannot
prevent isolated test cleanup. Startup waits use the native runtime's 90-second startup budget
rather than the ordinary 20-second control timeout.

The current passing standard-host run verified these portable artifacts:

| Artifact | SHA-256 |
|---|---|
| `wrongstack-desktop-native.exe` | `83c5a7ce1d39d28e19e0bb0820f02faa68a68a9a934573aaafc9c6cf6494f8f1` |
| `wrongstack-engine.exe` | `41e0fb0c9513c25a2964db8acdb4838a02c17d403e53c86e9bcd4e3dc793ae69` |

The expanded standard-host run verified, in the actual Tauri/WebView2 application:

- SAGE proposal accept/reject, Doctor repair, audience selection, protected retention/evidence
  edits, score breakdown and separate vector status, without desktop sessions.
- File tree/evidence panel/resize, canonical anchored SAGE, structure/activity, create/edit/save,
  external-change reload, rename/move/delete, unified/split diff, line notes and stage/unstage.
- Atlas layouts/minimap/tour, directed dependency highlighting, SAGE provenance, source/history
  and working-file navigation. Commit history/ref selection and committed file diff also passed.
- Chronicle query filtering, 105-event cursor pagination, real three-event/eight-relationship
  lineage and file navigation. Fixture events were appended through the canonical project owner.
- An authenticated local-provider Code Assist run, with no new desktop conversation record.
- Project/profile skill discovery/create/edit/readback, invalid-document refusal, draft-leave
  protection, ignored supporting-directory reveal and canonical file selection, with zero sessions.
- Conversation-side file access through project services, project Code Assist after profile setup,
  and saved provider/model hydration after remounting settings.
- Existing provider setup/encrypted-vault/stream/error, real clarification/Markdown, theme,
  three PTYs, UI reload/restart and saved-provider use in a new engine process.

Renderer errors were empty, both portable checksums matched, and cleanup completed before the
PASS record was written. This is native workflow evidence, not full WebUI or release certification.

The final native flow additionally verified read-only SAGE record navigation before explicit
editing, the richer task inspector and its persisted assignment/report/split data, provider
catalogs with request correlation, and real pinned-route task dispatch without creating desktop
conversation records. The isolated local model returned a result visible through the canonical
assignment `lastResult` field. Atlas rendered the complete 182-file fixture as well as the explicit
160-node smart scope.

## Existing-workspace visual check

The final executable was opened against the retained primary host. The original mark and
persisted appearance rendered correctly. A subsequent navigation attempt was interrupted by
detected user input, so no successful live-project graph inspection is claimed for this build.
The isolated native runs separately verified the graph, record-detail action, real relationship
labels and the new settings editors at desktop and compact widths.

The previous branding build was also visually checked against the retained workspace: Appearance
showed all 13 pairs and migrated the saved dark/Copper choice to Rose & Copper. No existing task,
memory or conversation was edited during these visual checks.

The retained human conversation reported `Engine is disconnected` when the new UI restored it.
Its original host and engine processes remained alive. They were not restarted or replaced.
The isolated current-build session/restart tests passed; this observation does not establish
working reconnection for that retained historical session. The earlier visual pass separately
showed nine Kanban tasks and 87 SAGE records in an existing registered project.

## Current settings and SAGE interaction evidence

Both final runs verified, with zero desktop conversation records:

- Ordered fallback-chain editing/reordering and named profile creation with canonical readback.
- Role-specific provider/model, fallback-profile and reasoning-mode/effort/preservation overrides.
- Cost tiers, spend/count/token budgets, role-to-tier routing and leader switching guards.
- Shared engine limit bounds, an invalid lower-bound input, clearing a limit back to inheritance,
  saved zero main-agent iterations and drafts retained across section navigation/discard.
- A real out-of-band preference write: independent nested profile edits survived; an edit to the
  same chain was refused before writing, retained its local draft and offered explicit reload.
- React Flow default navigation, bounded summary-only SAGE payloads, stored directed relation labels,
  zoom and a keyboard-triggered full-record detail fetch. The optional library and lifecycle
  deletion/recovery assertions continued to pass. The SAGE map does not request the vector store.

The first expanded native attempt reached a visible graph but exposed a missing explicit record
action: React Flow nodes were groups. Cards now provide keyboard-accessible detail buttons.
The next attempt saved fallback profiles but found ambiguous select labels; explicit accessible
names now identify each profile/tier/reasoning selector. Both unchanged workflow assertions passed
in the final runs. Failure logs are retained as `failure-sage-node-open-e944.log` and
`failure-settings-select-label-0a516.log`.

Two intermediate engine builds failed during declaration emission: one could not resolve contract
declarations from vector-memory; the next saw an overload mismatch in a concurrently changing
connection-lifecycle file. Focused builds and the final complete dependency/native build passed.
No unrelated lifecycle source hunk was edited for this work.

## Current interaction regression evidence

The first new native run (`73471ec3e87b-20a09cee36c2`) exposed task reselection while a
definition save was still awaiting acknowledgement: the old save then closed the inspector
and discarded the next acceptance-check draft. The final build disables task/board reselection
during the write and rejects stale board responses. The same native save/reopen/check flow
passed with the final build, including persisted due date, effort, checks, notes and assignment.

Two intermediate harness failures were test expectations: a capture still expected graph nodes
on SAGE open after the deliberate library-default change; an Atlas label selector matched both
a node title and its subsystem name. The final test targets the library and the impact node title.
No assertion was removed from the affected user workflows.

## Current native QA environment

The final full runs used an owned, bounded 12 GiB Windows job with kill-on-close cleanup for only
their newly spawned test process trees. The parent explicitly allowed breakaway. The standard
run peaked at 8,049,729,536 bytes; companion peaked at 8,050,286,592 bytes. No existing user process
was assigned to that job and no parent job, paging or Windows setting was changed. Earlier
read-only probes inside the test parent reported an 8 GiB job limit; this does not prove the cause
of earlier WebView/engine exits. Runner scripts and logs remain under
`.temp_files/desktop-v2-native/` for evidence.

## Observed stability limits

The `f9ff51867bf9-20a09cee36c2` and first `c20fbe62bebe-20a09cee36c2` standard attempts each lost
an additional engine at startup with Windows exit code `0xC0000409`. The latter passed when rerun
without changing its binary or assertions. Records include `failed-state-f9-startup.json`,
`failed-state-c20-startup.json` and the corresponding engine transcripts. The cause remains unresolved.

A read-only diagnostic caller reported no enabled process/job committed-memory cap. The detached
test runner's own job query returned access denied, so its limits are **unknown**. A later system
snapshot reported 163,145,039,872 committed bytes out of a 272,364,335,104-byte limit (59%); this was
not a measurement inside the failing engine. These observations do not establish crash causality.
The diagnostic uses [QueryInformationJobObject](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-queryinformationjobobject)
and the documented [extended limit structure](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_extended_limit_information).
Those earlier diagnostic probes changed no job limits, Windows paging settings or unrelated processes.

The first expanded native run (`f59de3621836-f06b89d4d2da`) passed SAGE proposal accept/reject,
Doctor repair, audience/retention/evidence/retrieval, the file evidence drawer, file mutations,
save conflicts, Git diff/review/stage/unstage and three-PTY UI reattach. Its subsequent agent
engine exited with Windows code `0xC0000409` after configuration loading began. No cause is
inferred from that code alone. `failed-state-f59.json` and its engine log retain the failure.
An expanded Atlas test initially stopped because its selector matched two `index.ts` files;
the test now selects the source directory explicitly, and the UI displays relative directories.

## Earlier baseline proof

The earlier native runs exercised the previous eight mode/palette combinations; primary-button and body text
contrast met 4.5:1. System changes, saved appearance, live terminal colors, 800 px layouts,
three PTYs, UI reload/restart, native provider setup, encrypted credentials, Markdown/copy,
project-file links, and the real clarification tool passed their individual checks.
Memory create/edit/refused deletion/explicitly authorized deletion/recovery and Automation
preview/save/enable/queue/cancel/disable also passed in the native UI.

Earlier complete runs failed at the additional agent session: a native engine exited with
Windows code `0xC0000409`, one WebView target crashed, and one host log recorded an OS-thread
creation panic. The host now reuses eight request workers with a bounded 24-request queue;
worker creation errors are returned during startup instead of panicking per renderer poll.
The test closes old CDP connections and uses normal daemon idle settings. The standalone
two-engine control passed, but it does not by itself certify native UI lifecycle stability.

The final smoke writes `.temp_files/desktop-v2-native/native-result.json` only after all behavior
checks and cleanup succeed. Screenshots and failure logs remain beside it for review.
The first passing request-pool run is retained as `native-result-after-request-pool-1.json`.
Those earlier successful runs verified these portable SHA-256 identities, not the current build:

| Artifact | SHA-256 |
|---|---|
| `wrongstack-desktop-native.exe` | `5003b384ef6b2ca33d449561c58b85018f16c0479bde8118fd2c27dcf1c9f640` |
| `wrongstack-engine.exe` | `3093aa7637d4d156b6ea6a79c213b560d9acfd5b7cd5e16fa6fcbf8b872976f6` |

## Cleanup limitations

Automatic approval review rejected cleanup with the reason `blocked by policy` for these owned
test directories. They were left untouched after rejection:

- `C:\Users\ersin\AppData\Local\Temp\wrongstack-desktop-v2-sPgQxN` (earlier run).
- `C:\Users\ersin\AppData\Local\Temp\wrongstack-desktop-v2-4WsGq5`.
- `C:\Users\ersin\AppData\Local\Temp\wrongstack-desktop-v2-urDACb`.

Windows cleanup also returned `EPERM` for these failed-run directories:

- `C:\Users\ersin\AppData\Local\Temp\wrongstack-desktop-v2-RUfbcC`.
- `C:\Users\ersin\AppData\Local\Temp\wrongstack-desktop-v2-HlNL1c`.

New test cleanup targets only processes whose command lines contain that run's unique directory,
including the private session-host copy, engine daemons, and WebView profiles.

## Uncertified

Full WebUI functional parity, long-running multi-agent stress, the complete coverage/release
matrix, hosted CI, signed installers/updates, macOS/Linux, external provider authentication,
live model quality, Docker worker execution, and GitHub publication are not certified.

## Approval, activity and next-step source checks

The current desktop source passes 135 tests in 32 files and its typecheck covers 102 files.
Approval cards now display structured arguments, edit previews and policy choices; session activity
groups engine events by run and agent; completed-turn suggestions can be added to a draft. These
checks do not establish complete WebUI parity or certify every native policy path.

A full current-source desktop build was blocked by type errors in the concurrently modified Goal
package (`checkpoint.ts`, `goal-runner.ts` and `phase-graph-builder.ts`). Those unrelated changes
were left intact. A UI-only native build reuses the previously built engine with SHA-256
`22c9ed08770180abeae0e63609572658fc57a8b615ae0a1e5c408778c6328629`; it is not a full build of
the current source tree. The initial UI executable SHA-256 is
`fdaae63766ea2bd857a64efea80a0d623d110fae8fef53e6203b17eeb673fa37`.
An isolated native trial reached a real `exec` approval, received the
engine's resolution and executed the command successfully; its later timeout was caused by the
fixture repeating an earlier held prompt, so that trial is not an end-to-end pass.

After correcting the fixture, both standard and companion-host native composer scopes passed with
identity `fdaae63766ea-22c9ed087701`, verified portable checksums, exit code 0 and isolated cleanup.
It exercised actual exec allow, deny and remembered exact policy, engine acknowledgement,
structured run activity, completed next-step selection and explicit queue submission, alongside
the existing composer, resource and attachment checks. This used the reused engine described
above and an isolated local provider; it does not replace a full current-source build or the
unresolved full-native settings-management gate.

A subsequent UI-only build `9b039768dba9-22c9ed087701` includes the approval auto-follow fix.
Its UI SHA-256 is `9b039768dba9b0f3da3e6cdc42f51edc10d54fe16197320113374fd833f447c4`;
the engine is the same reused binary. Source tests, typecheck and the standard native composer
scope passed again, including a viewport assertion for the new approval actions. The companion
host was tested on the preceding UI build, not this subsequent one.

## Chronicle project insights (in progress)

Desktop requests project-wide provider, task and file metrics directly from Chronicle; timeline
filters do not apply. Earlier native runs displayed the provider but returned empty task and file
views. The project transport was attaching its internal engine session ID to every outgoing
message, inadvertently filtering project metrics. A regression test failed with that behavior and
passed after separating project/profile requests from session-bound requests. All 13 native Rust
tests passed. Native scope `chronicle` passed without any desktop sessions using isolated portable
build `e3f4d3a22359-a566141c2989`; real fixture provider, task and file records were displayed and
portable checksums verified. The standard composer scope also passed with the same build, including
session model/effort, queue, BTW, steer, media, approvals and next steps. The engine was compiled
from already-built workspace packages, not from a successful full current-source dependency build.
The earlier empty metrics results were caused by the transport scope, not an old-engine defect.
The full profile/settings native scope was not rerun after the transport change.

## Conversation draft text recovery

The session text draft is stored in the native SQLite registry and loaded on demand for its agent
session. Saves are serialized per session; empty drafts delete their row and write failures are
reported. Registry tests cover independent sessions, restart, clearing and rejection of unknown
or terminal sessions. The desktop suite passed 137 tests, typecheck passed 104 files, and all 13
native Rust tests passed. Native composer scope `623c9d698194-a566141c2989` passed, including
renderer reload, actual UI process restart, saved-text readback and clearing. Its engine was built
from existing package outputs, not a successful complete current-source dependency build. Draft
delivery mode was not persisted, and concurrent editing of the same session across windows and
abrupt termination during a pending save were not certified.

The subsequent native composer run `7789abec58b7-a566141c2989` also passed after adding durable
attachment and reference storage. It restored an image, a PDF whose encoded payload exceeded
1 MB, and a project file reference after UI process restart; the actual engine received the image,
extracted PDF text and reference, and their stored draft entries cleared after submission. Native
checks used existing prebuilt engine package outputs, not a full current-source dependency build.
Concurrent same-session window editing remains outside this proof.

The later composer scope `1926a6bb7d2d-a566141c2989` passed with persisted delivery mode. A
Queue selection, text, image, PDF and project reference were restored after UI restart, and the
queued attachment was confirmed removed from the saved draft before a further reload. Cleanup
failures after engine acceptance are reported as such rather than presenting the message as unsent.
The engine again came from existing package outputs. Abrupt termination during an in-flight save
and concurrent edits from separate windows remain unverified.

Draft writes now compare per-part SQLite revisions in an immediate transaction. When another
window has changed a part, this window retains its local edits, blocks sending, offers copy and
requires explicit confirmation to load the stored draft. The same application build was exercised
in two real native windows with conflicting text edits, explicit reload, and a stale send refused
before contacting the local provider. Native composer scope `ced6e0a613a8-a566141c2989` passed
with portable checksums verified and cleanup completed, including the existing media, queue and
approval scenarios. The engine used existing package outputs. The SQLite tests also cover old-style unversioned writes:
database triggers advance the revision so a new client detects those writes. An old client itself
can still overwrite without checking; mixed-version concurrent editing has not been certified.
The send-time revision check and engine delivery are separate operations, so a change arriving
between them remains a race; abrupt termination during an in-flight save is not certified.

The conflict UI now compares both versions and can keep either, including references, attachment
data and delivery mode. Replacing the stored version checks all reviewed revisions in one SQLite
transaction. Native composer scope `fe7be0cc3c60-a566141c2989` passed with two real windows:
both choices worked, a change made after comparison caused replacement to be refused, and an
explicit retry preserved the local image bytes. The portable checksum was verified and isolated
cleanup completed. Its engine used existing package outputs; this is not a full current-source build.

Automatic approval review rejected deletion of the isolated control directories below with
`blocked by policy`; they remain untouched:
`wstack-metrics-control-nY1dGT`, `wstack-metrics-control-2SqpJp`,
`wstack-metrics-control-diLirw`, `wstack-metrics-control-GOKN5S`,
`wstack-metrics-sqlite-control-HrW7ph`, `wstack-metrics-sqlite-control-H9l418` and
`wstack-metrics-sqlite-control-9gz18V`, all under `C:\Users\ersin\AppData\Local\Temp`.
# Project Goals native validation — 2026-10-27

The project-owned Goals workspace was exercised in the Tauri/WebView2 shell using portable
identity `e12d3dbef7da-a566141c2989`. An isolated project with no desktop sessions loaded a
persisted goal from the engine catalog, opened its phase and task details, and changed the task
to `review`; both the persisted graph and the selected UI value were read back. The compact
800 × 640 viewport had no document-level horizontal overflow, portable checksums matched, and
the renderer error list was empty. The native harness exited successfully after cleanup.

The native engine in that package was the existing compiled engine probe, built from previously
available package outputs; this is not a full current-source engine build or a proof of goal
planning, pause/resume/stop, retry, multi-project isolation, or live provider execution. Earlier
fixture-path and hidden-option assertion failures were corrected before the successful run. Three
fixture files accidentally written under the user's WrongStack project directory were identified
by their exact IDs and contents and removed; their parent directories were retained.

Desktop typecheck passed (105 files), and the desktop Vitest suite passed with one worker
(34 files, 140 tests). A prior default-parallel test attempt failed with memory allocation errors.

The follow-up native Goals run used portable identity `51d83e67cd2d-a566141c2989` and the
same prebuilt engine limitation. With no configured provider, a real assessment returned an
unusable result; the form showed the failure and retained the goal text. A stopped goal did not
offer live-only assignment, and catalog, task status persistence, compact viewport, checksum,
and renderer-error checks passed again. Active-run assignment and phase movement, a successful
provider assessment, and cross-window assessment contention were not exercised natively.
Desktop typecheck passed (106 files); the one-worker desktop suite passed 34 files and 141 tests.

Persistent project mission follow-up: portable identity `f4a4cfc0af79-a566141c2989` passed the
native Goals scenario with no desktop conversation. The UI created a mission, held a replacement
until confirmation, persisted the replacement, paused and resumed it, and cleared it while the
separate execution graph remained in its store. Filled mission and goal text areas retained their
accessible labels. The same run passed the existing goal catalog, task status, assessment-error,
compact viewport, checksum and renderer-error checks. The engine was still the existing compiled
probe, not a full current-source engine build. Refinement with a live provider and concurrent
mission writers were not verified. The editor checks the last observed mission identity, but the
backend mutation has no conditional-write token, so a change between observation and write can
still race. Desktop typecheck passed (107 files); the one-worker suite passed 34 files, 142 tests.

Project SDD follow-up: portable identity `9aa713d6c5d7-a566141c2989` passed native catalog and
dependency-graph checks with no desktop conversation. The fixture used the canonical SpecStore
and TaskGraphStore inside the isolated test root; the engine discovered the specification, its
task descriptions and the reported dependency. Both task-list details and the React Flow edge
were observed, worktree isolation defaulted off, the empty run catalog rendered, the 800 × 640
viewport had no document overflow, checksums matched, and renderer errors were empty. An earlier
graph assertion ran before React Flow had measured its nodes; the final test waits for the actual
edge. The native job exited successfully after cleanup. The engine remained the existing compiled
probe, not a full build of the current engine source.

The interview, approval/rewind/discard, run-start and live task control paths are wired to canonical
project messages, but were not exercised with a live provider or active worker in this native
scenario. Historical run detail, task splitting, lifecycle/rollback and complete model catalogs
remain pending. Live control requests are queued by the engine; the desktop does not synthesize
an applied result. Typecheck passed (110 files), the one-worker desktop suite passed 35 files and
146 tests, and the targeted Biome check passed.

SDD maintenance follow-up: portable identity `8e9e597e2ded-a566141c2989` passed the native SDD
scenario with the same prebuilt-engine limitation. The isolated fixture had no managed worktrees;
the cleanup returned a real zero-removed result. Project-wide SDD clear retained the specification
before confirmation, removed it through the engine after confirmation, and refreshed the empty
specification catalog. The UI displayed the structured lifecycle outcome. This proves empty
worktree cleanup and isolated artifact removal, not removal of real worktrees or Git rollback.
Task splitting is wired to the live-run command and explains the completed-container/dependency
semantics; active-worker consumption of that command remains unverified. The desktop suite passed
35 files and 148 tests; typecheck passed 112 files. Maintenance gating also has coverage for a
different active run in the project. Lifecycle replies have no request correlation token, so the
UI matches the pending operation within its project connection.

Requirements intake follow-up: portable identity `911041c70331-a566141c2989` passed the extended
native SDD scenario. The desktop created an intake draft through the real project API and read
back its original request with leading whitespace and trailing newline unchanged. It saved edited
information, recorded a question answer, prepared an SDD interview draft without starting a run,
submitted the intake and archived it. A concurrent API update advanced the stored version; the
desktop's stale save was refused with the engine's readable conflict message, retained the local
edit, and preserved the concurrent writer's value. No desktop conversation was created.

The native package used the existing compiled engine probe, not a full current-source engine
build. Intake cancellation, transport-failure idempotency, cross-project isolation, attachments
and suggestion generation were not included in this scenario. Desktop typecheck passed 113 files;
the one-worker suite passed 36 files and 151 tests. The first new HTTP test attempt was blocked by
an uninitialized browser global; isolating the native-request boundary fixed the test setup.

Requirement resources follow-up: portable identity `322b5abdba90-a566141c2989` passed the same
native scenario with a file-path attachment reference and related issue authored in the new
intake form. The real API returned those references from the persisted record and the desktop
rendered them as named evidence, alongside the original request. Existing edit/conflict/answer/
SDD-transfer/submit/archive checks passed again; the native job completed cleanup successfully.
The package still uses the prebuilt engine probe and is not a full current-source engine build.

Recorded suggestion previews and field provenance have focused rendering coverage. No live
suggestion generation or decision was performed: the project intake service factory currently
does not configure a generator, and the HTTP router has no accept/reject or append-resource
endpoints. Resource authoring therefore applies to draft creation; file contents are not uploaded.
Desktop typecheck passed 114 files and the one-worker suite passed 36 files, 153 tests.

Versioned intake resource/decision APIs follow-up: source HTTP tests initially returned 404 for
the new resource and suggestion-decision requests. The authenticated router now forwards
`POST /api/requirement-intakes/:id/resources` and
`POST /api/requirement-intakes/:id/suggestions/:suggestionId/accept|reject` to the canonical
service. Each requires a non-negative integer `expectedVersion`. The HTTP suites passed
103 tests in three files, including stale-write refusal, missing-version refusal, authentication,
submitted-record locking and original-request preservation through suggestion decisions.
Server typecheck passed 308 files and its package build passed; desktop typecheck passed
114 files and the one-worker desktop suite passed 36 files, 153 tests.

Portable identity `d5f7c45b084e-0b6c6576bb09` then passed the extended native SDD scenario:
the UI appended a second file reference to an existing intake, accepted a title proposal, rejected
an outcome proposal and read all results back through the real API. The original request stayed
unchanged and the existing edit/conflict/answer/SDD-transfer/submit/archive checks passed.
Proposals were produced by a deterministic test generator through the canonical domain service;
this was not live provider generation. The native job completed cleanup successfully.

This native engine includes the freshly built webui-server package; other workspace dependencies
were reused from available compiled outputs with `build-engine --skip-build`. It supersedes the
older prebuilt-engine-only limitation for these new HTTP routes, but remains distinct from a full
current-source workspace/release build. Configured live suggestion generation and durable form
drafts remain pending.

Native new-requirement draft follow-up: portable identity `6625ce086351-0b6c6576bb09` passed the
extended SDD scenario with two real native UI restarts and a second project window. SQLite stored
the original text, structured fields, added attachment/resource references and create-retry identity
under the registered project's identity. A different project had no draft. A stale window could not
overwrite the saved version or submit its stale form, and a saved version changed after comparison
was refused until compared again. Confirmed use of the saved draft restored the full form.

The test also simulated a server-accepted create whose reply had not reached the form: it retained
the prepared identity, restarted the UI and retried through the desktop. The API returned the same
record, the catalog contained one intake and the persisted draft cleared with a revision tombstone.
An initial regression test failed because JSON field reordering changed the submission fingerprint;
canonical object-key ordering fixed it. No live provider was called. Existing resource/decision,
edit/conflict/answer/SDD-transfer/submit/archive checks passed again, and cleanup completed.

The desktop suite passed 36 files, 156 tests; typecheck passed 116 files. All 14 native Rust tests
passed, including project isolation, reopening, stale clears and tombstone revision behavior.
The engine is the prior freshly compiled server probe with other available dependency outputs,
not a full current-source workspace/release build. At that checkpoint, persistence covered new-request text,
information and explicitly added references, rather than existing-record edits, answer text or
reference fields not yet added. An abrupt exit while the UI still reports saving can lose pending
input; the tested restarts wait for native save acknowledgement.

## Existing requirement edit and answer recovery

Portable identity `e9dc8dd1d5b6-a6cd0208de38` passed the extended native SDD scenario. Existing
requirements now retain metadata edits and per-question answer drafts in the native SQLite
registry, under separate project/requirement slots. Hydration preserves the original server
version used to start the edit or answer; restarting does not silently rebase a write. Local
draft writes are ordered and revision-checked. Conflicting windows retain their local text and
offer readable comparisons with confirmed saved/local choices; a changed comparison is refused.

The real Tauri test restarted the UI with unsaved metadata, restored the fields, advanced the
record through a separate API writer and verified that saving refused the stale version while
preserving the draft. It then restarted with an unsent answer, restored the text, advanced the
record again and verified the same refusal. Reloading the record retained the answer, and the
explicit **Use current record version** action allowed a reviewed submission. The acknowledged
answer cleared its native draft while retaining a revision tombstone. The screenshot
`.temp_files/desktop-v2-native/sdd/native-requirement-answer-restored.png` was visually inspected.
The complete scenario also passed the earlier create/retry, multi-window draft review,
resources/suggestion decisions, edit/conflict, SDD transfer, submit/archive and spec dependency
checks, with zero desktop conversations, no renderer errors and no horizontal overflow at the
tested compact width. Owned test processes and temporary data were cleaned up successfully.

The HTTP answer endpoint now accepts an optional validated `expectedVersion` and passes it to
the canonical service. The regression failed before this change (stale answer returned 200
instead of 409), then passed with the same assertion. Clients omitting the version retain their
existing behavior. Focused server verification passed 104 tests across three files; server
typecheck passed 308 files and its build completed. Desktop verification passed 160 tests across
37 files, typecheck passed 119 files, and all 14 native Rust tests passed. Targeted Biome checks,
documentation links and `git diff --check` passed.

The engine was rebuilt with the current server output and other available dependency outputs;
this is not full current-source workspace certification or a release build. No live model was
called. Reference inputs not yet added to a resource list, cancellation-reason drafts, configured
suggestion generation and broader desktop parity remain open. The tested restart boundary is
after native save acknowledgement; an abrupt exit during a pending save remains outside this proof.

## Provider model catalog, credentials and health

Portable identity `3d59b9326922-82e4e745f023` passed the focused `--models` native scope with no
desktop conversations. This scope uses the Tauri-owned settings UI and canonical backend services.
It exercised model search against the bundled registry, an empty search, review without saving,
custom definition creation/edit/removal, persisted config readback, stale-editor refusal and
explicit draft-close choices. Explicit false capabilities and free input prices survived;
unexposed reasoning options and pricing tiers were retained during edits. Removing a definition
also removed its saved model-list entry. Refresh rediscovered connections after an empty catalog.

The same run changed the active saved key, cancelled and confirmed deletion, observed the engine
selecting the remaining key, and cancelled/confirmed provider removal. Fixture keys remained
encrypted on disk and absent from renderer markup. These checks do not establish OAuth, vault
lock/rotation/export or external-provider access parity.

Quota verification used an authenticated local account endpoint through the real configured
provider quota reader. It displayed 30% usage, the reset clock and a $12.50 balance; a separate
reader failed visibly. Repeated refreshes used the canonical throttle without another HTTP call.
After that interval, a failed refresh of the previously successful reader retained its recorded
usage. No model prompt or external provider was invoked.

The standalone route previously omitted its runtime provider status tracker. The native waiting-room
case failed before that connection was made. Routes now expose the existing tracker and lazily
restore recorded profile entries; manual release/clear updates the profile status file and writes
readable audit events. The native test restored a blocked fixture, released it for the next probe,
cancelled and confirmed clearing, then read the actual tracker. A permanent real-tracker/filesystem
test also verified reopening after clear, preservation of another provider's row, audit readback
and retry after a malformed status document is repaired. This does not certify automatic failure
persistence and synchronization across every independent engine runtime.

Model registry, quota, status and audit replies now retain request IDs. Correlation regressions
were observed failing first and then passing; unrelated frames and legacy calls remain unmodified.
Focused server verification passed 83 tests across five files, typecheck passed 309 files and the
server build completed. Desktop verification passed 177 tests across 39 files and typecheck passed
123 source files. The native screenshots were inspected, the compact 800px checks found no
horizontal overflow, no renderer errors were recorded, and owned test cleanup completed.

The engine includes the freshly built server and other available dependency outputs. This is
focused native evidence, not full current-source workspace certification, signed packaging or a
release. Model writes use a stale-edit preflight and saved readback; the protocol does not expose
an atomic model-definition revision. Advanced schema authoring and restart-safe model-editor
drafts remain open. Evidence is retained under `.temp_files/desktop-v2-native/models/`.

## Project mailbox

Portable identity `41a0ebf2c931-baecef10dcbc` passed the focused `--mailbox` native scenario.
The mailbox is a project workspace, accessible with zero desktop conversations. The actual
project engine supplied its canonical root for fixture setup; the first fixture incorrectly
used the Windows registry's extended namespace path and reached a different mailbox. That test
setup was corrected without changing the project's path identity implementation. Its owned
temporary directory was removed after absolute-path and process checks.

The native UI grouped a real root/reply pair, rendered Markdown, required an explicit actor
for receipt mutations, marked a message read, completed and reopened it, and sent a reply with
the actual parent reference. A rejected wildcard assignment retained its draft and created no
message. Switching projects showed neither the first project's messages nor its compose draft;
returning restored the draft, which was corrected and recorded through the real send handler.
The test inspected registered agents, cancelled/confirmed a soft-delete, ran purge and compaction
through their canonical result contracts, and cancelled/confirmed a project-wide clear. The
final store query was empty and no desktop conversation was created. Compact layout had no
horizontal overflow and no renderer errors were recorded; owned cleanup completed.

Mailbox read/maintenance replies now retain request IDs. Five correlation assertions failed
before the route wrapper and passed afterward, without claiming unrelated frames. The focused
mailbox server suites passed 25 tests across four files. Desktop verification passed 186 tests
across 40 files and typecheck passed 127 source files. Model tests cover cyclic/missing-parent
threads, canonical aggregate unread semantics, invalid retention thresholds, duplicate pending
sends, acknowledgement/refusal state and project draft ownership. Draft retention here is
in-process; application restart and independent-window compose conflicts are still pending.
Sending is not claimed to be exactly once after an unacknowledged transport failure. The UI
keeps the text and directs the user to inspect recorded messages before retrying.

The engine uses the freshly built server with other available dependency outputs. This is a
focused native scope, not full workspace/release certification. Evidence is retained under
`.temp_files/desktop-v2-native/mailbox/`. The provider/settings build above also re-passed its
SDD/requirements scope after the standalone health changes.

## Project Kit and TechStack native workflows (2026-10-27)

Project Kit passed the real portable Tauri/WebView2 workflow on
`55b51cc81379-baecef10dcbc`. Its project catalog reads manifests, guides, typed schemas,
tests and source listings without importing executable kit modules or creating conversations.
The fixture module throws on import, making accidental execution observable. Native checks
covered optional nested fields, arrays, Boolean and integer controls, constraints, recorded
revision-verification gating, changed-source refusal, project isolation and an explicit draft
handoff into a previously unopened conversation. Existing text, references and queue delivery
mode survived the append. Verification-history entries were explicit recorded fixtures; this
does not claim an executed kit verification or run. Native cleanup exited successfully.

TechStack passed its focused native workflow on `502e32a54444-5ff5072f28f7` with no
conversation sessions. The test performed a real local inventory and checked its persisted
job/snapshot, then used the same isolated canonical SQLite store for explicitly labelled
registry/advisory/model display fixtures. It exercised dependency details and filters, workspace
navigation, distinction between observed evidence and model interpretation, historical trends,
selected remediation review/cancellation and project isolation. Markdown, JSON, SPDX and
CycloneDX reports crossed the native HTTP bridge. Compact layout and screenshots were checked;
the workflow and cleanup exited successfully. Report generation and controls are proven here;
successful disk downloads, live registry enrichment, real model research and package installation
are not claimed by this scope.

The native check exposed setup-mode onboarding being advertised as an available research model.
A regression test using the actual setup provider reproduced that mismatch before the fix.
TechStack now excludes setup and unconfigured providers from both advertised research models
and the research-stage accessor. The same regression passed afterward; the combined TechStack
HTTP suites passed 38 tests. The native fixture also observed the unavailable-model response
and research refusal. Its option-state assertion reads the DOM `disabled` property: the earlier
generic disabled matcher returned false even when that property was true.

Reviewed remediation targets now carry their snapshot identity and selected item details to the
execution endpoint. The server refuses changed targets, rationale, risk or snapshot identity
before calling the package executor. Focused tests cover accepted and rejected requests; they
do not claim native permission prompts or a real package mutation. Existing clients that omit
this optional reviewed-plan contract retain their prior behavior.

The HTTP bridge accepts bounded UTF-8 Markdown only for the TechStack report API and still
requires JSON elsewhere. It preserves the research endpoint's 60-second server deadline with
a 75-second transport deadline. Rust verification passed 15 tests, including real loopback
Markdown/JSON, authentication, scope, redirect and response-size cases. Kit and TechStack load
as independent UI chunks; the project workspace chunk returned below the build warning limit.
Desktop verification passed 200 tests across 42 files and typecheck passed 137 source files.

Mailbox live event refresh separately passed on `0c80e78551ef-baecef10dcbc`: the new thread
appeared before the test clicked Refresh. Its receipt, completion/reopen, reply, refusal/draft,
soft-delete, retention and project-isolation checks also passed with successful cleanup.

These packages rebuild the server and standalone engine while reusing other available workspace
dependency outputs. They are focused native evidence, not full current-source release certification.
Kit parameter drafts across restart, full execution diagnostics, larger dependency inventories,
cross-window job discovery and the remaining external-service workflows stay open.

## Native dead-code cleanup and shared-package follow-up (2026-10-27)

Portable package `120c1486fe53-5ff5072f28f7` passed the focused Project Kit, TechStack and
dead-code workflows with successful isolated cleanup. The dead-code case scanned actual
TypeScript files, selected an unused declaration, inspected its exact diff, cancelled the
execution confirmation without writing, then explicitly applied it with verification disabled.
The remaining referenced declaration survived. Result and scan scope remained project-owned
after navigation; another project did not inherit them. The test exercised backup review,
cancelled restoration, a newer-file conflict refusal and an explicitly confirmed overwrite that
restored the original bytes. It created no conversation sessions.

The first native restoration attempt exposed a UI result interpretation defect. The engine
returns the pre-restore conflict list even when force restoration succeeds. The desktop initially
treated that list as unresolved and kept the conflict prompt open after restoring the file. The
UI now excludes successfully restored paths from unresolved conflicts. A permanent regression
test covers ordinary refusal, successful overwrite and partial restoration. The same native
workflow passed afterward. No shared dead-code engine change was required.

The desktop suite passed 207 tests across 43 files; the updated dead-code subset then passed
all seven tests. Desktop typecheck passed 141 source files. Three focused existing engine suites
passed 36 tests for dead-code analysis, backup identity and non-UTF-8 fix handling. Rust's 15
tests and formatting checks passed. The native bridge now gives synchronous scan/preview up to
five minutes and apply/verification up to one hour, rather than abandoning them after 30 seconds.
These transport bounds do not create a cancellation API; the canonical dead-code HTTP surface
has no scan-cancel command.

This native apply case deliberately did not run typecheck. Long-running verification, native
rollback, atomic preview-to-apply revision binding, abrupt restart during a write and every
backup lifecycle remain separate acceptance work. In-process operation ownership prevents a
second action from starting merely because its workspace component was replaced; it is not a
durable transaction log across application restart. The package still reuses other available
workspace dependency outputs and is not a full release certification.

## Native Design Studio and complete backend build (2026-10-27)

Portable `024d66601f12-fb834681ae87` passed the focused Design Studio flow with successful owned
cleanup. It activated a real curated kit without conversations, saved scoped light/dark colors,
rejected invalid colors, adjusted semantic radius/density/font/motion controls, checked every
returned token against the canonical resolver, and exercised project isolation and reset.
Output cancellation left no file; an outside-project path was refused. Confirmed CSS output was
written and read back through the real native file bridge. Design verification displayed actual
file results and the count of files with no signal; absence of signal was not counted as a pass.

The native output test exposed an incorrect `files.read` payload in the new desktop workflow.
The shared route requires `filePath`; the desktop sent `path`. The production action now uses
the canonical field, and an integration test exercises materialization followed by file readback
through the actual server handlers and desktop operation dispatcher.

An earlier tuning assertion hardcoded a radius value incorrectly. It was corrected to compare
the requested semantic knobs against the canonical resolver; this was a test expectation error,
not evidence of a stale compiled resolver. A complete backend dependency-closure build and
standalone engine build subsequently passed. These builds do not certify full repository tests,
coverage, hosted CI or a signed release.

## Native project tools and Chimera review tracking (2026-10-27)

Portable `5b5a6df7b677-488fe7d2d8b6` passed focused Project Kit, TechStack, Dead Code and Chimera
flows through the compact Project tools menu, each with final `native-result.json` and successful
owned cleanup. The menu keeps Memory, Kanban and Atlas prominent and provides a keyboard-native
expandable list for the secondary project tools. The engine includes the complete freshly built
backend dependency closure.

Chimera used explicit recorded fixtures from two different core sessions. It listed both without
an open conversation, preserved report-specific notes through project changes, appended a note
exactly once, filtered reports/findings, and recorded triage, work, false-positive resolution and
reopening through actual stores. Parent report completion/reopening was observed on disk.
Report decision cancellation left its lifecycle unchanged. Full Markdown reports and claimed vs
observed checks were readable; citation verification was labelled separately from defect confidence.
The 800 px screen/document checks passed. Follow-up preparation preserved an existing native
conversation draft and did not send it or mark the report actioned. This is recorded-data UI and
lifecycle evidence, not a live LLM review.

The route now correlates all Chimera replies and accepts explicit `projectWide` catalog scope
independently of an incidental carrier session. Legacy explicit session filtering remains intact.
A native test control initially omitted the carrier identity while assuming it was injected by
the raw test RPC; it now supplies the explicit identity. The production route tests cover both
scopes and read errors. Focused Chimera suites plus the design output integration passed 22 tests
across four files. After adding review-policy source, the full desktop suite passed 220 tests in
46 files and desktop typecheck passed 152 source files. Native review-policy acceptance remains
separate until its focused run completes.

Portable `8e3d18db0454-488fe7d2d8b6` subsequently passed the combined focused review-policy and
Chimera flow with successful cleanup. The profile test saved every exposed review-policy field,
checked canonical preferences and extension configuration on disk, retained an unrelated
concurrent iteration-budget change, rejected an invalid delay and restored the values after
UI reload. Named profile selection cleared explicit reviewer overrides, and editing the model
cleared the profile. File limits above 50 and concurrency above 10 were accepted by the actual
backend; those are not engine caps. The effective fallback chain remains observed read-only
evidence and is marked stale while routing edits are unsaved. No LLM review was launched.

The final review package `00cc779eeee5-488fe7d2d8b6` passed the same native flow again, including
the additional guard that prevents deleting a named fallback profile still selected by continuous
review. The final native result was written after owned cleanup completed. Desktop and server
typechecks passed 152 and 309 source files respectively; targeted formatting/lint checks passed
without warnings, and the documentation check found no missing local links.

The focused Design Studio scope also passed on `00cc779eeee5-488fe7d2d8b6` through the new
Project tools menu, including theme editing, output/readback and project isolation; its final
result was written after successful cleanup. These focused scopes do not replace the standard
and companion full-native matrix, external-provider acceptance, full coverage or release gates.

## Native session inspection and reviewed checkpoint recovery (2026-10-27)

Portable `4ff8fd9135af-aba56b267e17` passed the focused `--recovery` flow, with both portable
checksums verified and a final result written after successful owned cleanup. The backend dependency
closure and standalone engine were rebuilt before packaging. The session workbench exposes History
& recovery through its contextual Tools menu, without adding controls to the resting composer.

Two real engine turns used the authenticated isolated loopback model fixture. The second response
was deliberately held: the desktop disabled checkpoint review and the server refused a raw rewind
request while the run was active. After completion, the workspace inspected the actual journal,
searched recorded event previews, showed prompt checkpoints and verified four retained messages
and 210 journal usage tokens. These differ from raw message-event counts and cached session-summary
counters; the desktop now requests the actual retained transcript length and loaded journal usage.

Explicit file-snapshot fixtures were seeded only after both turns stopped writing their journal.
The fixture model did not edit project files. Cancelling rewind retained the actual file bytes.
A later journal append invalidated the reviewed checkpoint; the confirmation was refused and
preserved the file. After refresh, confirmed rewind restored both recorded edits of the same file
to their original bytes, truncated later journal events, replaced the displayed/live conversation
and kept the separately saved composer draft. Retained-message and journal-token counters both
became zero. A second recorded snapshot outside the project was refused by the real rewinder;
the outside file remained unchanged, and the desktop explicitly showed that the conversation
had been rewound while a file restoration error still required attention.

The first native harness attempted a backend session-resume command; the native host correctly
refused it because desktop owns session lifecycle. That guard remains intact. Another fixture
attempt appended snapshots between turns; the live writer's later writes displaced the injected
records. The harness now seeds historical file evidence only after model activity ends, and
asserts actual restored bytes without weakening its original restoration requirement.

The route correlates inspect/checkpoint/rewind replies, reports checkpoint read failures and
provides an optional SHA-256 journal revision. Desktop confirmation checks a fresh checkpoint
snapshot and sends the expected revision; the server checks it again under the runtime session
transition gate. Existing clients may omit this optional revision. Rewind responses include actual
restored paths, file errors, removed events and retained-message count. A replacement replay is
sent even for an empty conversation. Before the fix, the desktop projection retained discarded
answers; its regression test failed on that assertion and now passes for empty/nonempty replacement
replays, while foreign-session frames and resets without a replay retain their existing isolation.

Repeated checkpoint indices use the engine's first recorded boundary, with snapshot counts
deduplicated by index for presentation. Counts remain snapshot entries rather than a unique-file
preview. The 800 px screen/document checks passed, no renderer errors were recorded, and the
history, successful recovery and partial-restoration states were captured for visual inspection.
The complete desktop suite passed 224 tests across 47 files; six focused backend suites passed
89 tests. Desktop/server typechecks passed 154/309 files, targeted Biome checks passed without
warnings, and the documentation link check passed.

This proof does not establish complete transcript search, project history/fork/resume/story,
redo, crash-durable recovery-operation state, full native standard/companion certification,
external-model quality or the release matrix. Journal revision checks and the runtime gate do
not make project-file restoration atomic against independent filesystem writers. Rewind follows
the engine's recorded snapshot semantics and can overwrite later manual edits; it is not a full
project backup or a Git checkout.

## Project conversation library and retained transcript (2026-10-27)

Portable `ff21d03a8ad8-920113da43c7` passed the focused `--history` and
`--history --companion` native scopes. Both verified the bundled checksums and wrote their final
PASS results after successful owned cleanup. The backend dependency closure, standalone engine,
Vite assets and Tauri release executable were rebuilt before these checks. This probe package
does not replace the installed application or the portable latest pointer.

The project-owned Session history workspace opens with no desktop conversation. It offers recent
100/200/500-entry catalog windows, summary/provider/outcome filters, recorded-name editing and
read-only transcript inspection. `/sessions` opens this workspace; `/history` remains the prompt
journal. Existing native conversations can be reopened by matching their actual engine identity
within the owning project. Reading an archive never resumes the agent or acquires another writer.

The native fixture used the canonical project session store and catalog registration, with 24
retained messages covering long text, reasoning, tool input/results and attachment metadata.
An early fixture omitted projectRoot and bypassed the catalog daemon; correcting the fixture
restored production-equivalent registration. A separate product defect hid populated journals
whose legacy summary counter was zero. The catalog now optionally supplies canonical emptiness
state; the desktop hides only confirmed empty journals and keeps unknown states visible.

Both hosts verified message paging, complete retained-text search within the selected transcript,
long-text continuation, role filters, no-match controls and revision-based stale-page refusal.
The proof deliberately appended one owned historical message, then required refresh before
continuing. Read and rename operations preserved the journal bytes, apart from that deliberate
append. A peer name change refused a stale local rename; a refreshed edit saved with readback.
Another project could not inspect the same journal. Reads kept the desktop conversation count at
zero. Only the final reuse scenario explicitly created a destination conversation, preserved its
existing draft, appended visible historical text without sending, and returned to that same native
conversation without creating a second writer. Screenshots and 800 px overflow checks passed.

The shared inspect route supports optional transcript-only pages and revision-checked text-block
reads. Pages contain at most 25 messages, 100 blocks per message and 60,000 text characters;
individual text chunks contain at most 16,000 characters and preserve surrogate pairs. Structured
tool input has bounded depth, fields and text. Image/PDF binary data and reasoning signatures are
excluded; PDF extracted text remains readable. The native project service boundary permits only
catalog listing, inspection and recorded-name editing from this family; conversation lifecycle
mutations remain desktop-session-owned and profile services refuse these project operations.

The complete desktop suite passed 228 tests across 48 files. Eight focused backend suites passed
94 tests, and all 15 Rust tests passed. Desktop/server typechecks passed 157/311 source files;
targeted Biome checks and Rust formatting passed. Regression evidence included the initially
refused native read boundary, transcript projection and canonical emptiness behavior.

Remaining work includes new-runtime resume/fork, cross-session full-content search, deeper catalog
pagination, persisted history selection/filters, richer story views, binary attachment viewers,
access beyond 100 blocks per message and full structured tool-input expansion. Compressed and
large-history acceptance were not run. Rename preflight is not an atomic compare-and-swap. These
focused native scopes do not establish the full standard/companion matrix, full coverage, hosted CI
or release certification.

## Reviewed native history resume and fork (2026-10-27)

Portable `d0a7e7e17119-5fa578243a82` extends the project-history scope with explicit Resume and
Continue a copy actions. Both use a separate native `session.restore` command. Missing sources,
alternate workdirs, invalid identity paths and unsupported modes are refused before tab creation.
The registered project root determines storage ownership. An older bundled-engine session host is
refused before dispatch, rather than accepting optional arguments and opening an empty conversation.
Existing conversations remain running; transferring them to the newer host is not implemented.

The desktop engine adapter explicitly handles the history boot arguments. Fork uses the canonical
session-store implementation, closes its temporary catalog client, and then reopens the child
through the shared backend's ownership-controlled resume handler. Resume uses the same handler for
the original identity. A private, authenticated loopback connection performs only that one request.
The native host waits for verified replay and operation acknowledgement before exposing its engine
transport. Startup errors become session errors; no blank-conversation fallback is used. Legacy
resume acknowledgements omit requestId, so they are accepted only on this dedicated single-request
connection. Explicitly foreign request IDs are ignored. Binary credentials stay in the native host.

The focused standard and companion native flows passed on this package, with checksum verification
and final results after owned cleanup. Each exercised cancellation without creating a tab, fork
with a different actual engine identity and an unchanged parent journal, and resume with the exact
original identity and retained messages visible in chat. A second resume was refused without an
engine transport or changes to the source journal. Engine event journals contained no new desktop
user-message frames from opening either conversation. Both operations use current project files;
they do not materialize historical workspace snapshots.

The first native attempt exposed a missing compatibility path for uncorrelated resume replies and
timed out waiting for readiness; the adapter now handles that legacy response shape. A subsequent
attempt reached the restored chat but the test expected only the first sentence of a longer linked
message as an exact text match. The locator was corrected while retaining the transcript assertion.
The complete desktop suite passed 231 tests across 49 files, including private-connection controls
for foreign replies, missing replay and ownership failure. All 17 Rust tests passed, desktop
typechecking passed 158 source files, and targeted Biome/Rust formatting checks passed. The backend
dependency closure, standalone engine and Tauri release executable were rebuilt.

This fixture has no configured model provider: restored agent identity, history, draft separation
and writer exclusion are verified, but a newly submitted model turn after resume/fork was not run.
The forced companion scope uses the current bundled engine; real older-host rejection is covered
by the version-boundary test rather than an installed-old-binary native scenario. Full native
certification, coverage, hosted CI and release publication were not run. The immutable probe package
does not update the installed application or the portable latest pointer.

## Cross-session retained-text search (2026-10-27)

Portable `4cd69245f32e-67fc1959e29e` adds a collapsed Search across conversations workspace to
project Session history. Searching is explicit and reads the selected latest 100/200/500-record
window independently of summary/provider/outcome filters. It reports progress, matching conversation
and message counts, and unreadable records. Results contain at most three plain-text excerpts per
conversation. Each selected result opens the matching retained message with the same query and
role filter, after verifying the transcript revision. Normal summary selection clears that search.

The shared `sessions.list` read path accepts an optional contentSearch payload. Each request reads
at most five project-owned journals sequentially. Continuation requires a revision of the candidate
identities, query, role and window; catalog changes refuse a mixed continuation. Stop invalidates
pending UI results and prevents further batches, while the current server read batch may finish.
No model turn, resume, writer acquisition or binary-attachment transfer is involved. Search uses
the canonical retained-message projection, rather than matching superseded raw journal events.
Different journals can change between batches: this is not a project-wide transactional snapshot.

The standard and companion native history scopes exercised six additional persisted conversations
and the original multimodal/long-text fixture across multiple read batches. Search stopped cleanly
without a late response replacing its stopped state. A shared term found all six archives; an image
base64 term found none, and the user-role filter excluded an assistant-only match beyond the normal
text excerpt. Selecting that result opened the correct message. A deliberate journal append then
made the same saved result stale: reopening refused it, and explicit refresh read the current
transcript. Another project returned no matching archives. Reading retained the zero-conversation
desktop registry until the later explicit draft/resume/fork scenarios. The companion scope also
checked the expanded search at 800 px without screen or document overflow. Screenshots were
captured for visual inspection. Existing history, rename, draft reuse, resume/fork and duplicate
writer refusal checks remained in the native scope.

Disk-backed backend tests cover stable continuation, changed query/catalog refusal, unreadable
records, role controls, deep-text excerpts, excluded image bytes and replaced history, exact match
counts and the three-excerpt cap. The complete desktop suite passed 231 tests across 49 files;
nine focused backend suites passed 98 tests. Desktop/server typechecks passed 159/312 source files,
and targeted Biome checks passed without warnings. The backend dependency closure, standalone
engine and Tauri release executable were rebuilt. Rust product source was unchanged in this round.

Search beyond the latest 500 records, full-text indexing, deeper catalog paging and durable search
preferences remain open. Loading an individual very large journal is not interruptible through
this API, and compressed/large-history acceptance was not added. These focused scopes do not
replace full native certification, coverage, hosted CI, external-provider acceptance or release
publication. The immutable probe package leaves the installed application and latest pointer alone.

## Profile model visibility and favorites (2026-10-27)

Portable `b767f08989ba-67fc1959e29e` passed the focused native `--models` scope, including the new
profile Model visibility workspace and the existing model-definition/key lifecycle scenarios.
The Tauri release executable and frontend were rebuilt; the unchanged bundled engine from the
previous round was reused. No dependency or installed-application update was performed.

The workspace opens without a conversation and lists saved-provider catalogs with disabled entries
included. Search and enabled/disabled/favorite filters leave model definitions intact. Exclusion
changes use the parent profile draft and explicit Save settings flow. A review lists affected
favorite, default fallback and named fallback-profile references before disabling a model. Bare
routing references are removed only for their default provider; other provider references and
explicit role overrides remain. Enabling reviews matching exclusion rules and explains the wider
effect of removing a bare model rule. Removed favorites/fallback references are not automatically
recreated. Persisted exclusion rules remain editable when their models are absent from the catalog.

The real native flow cancelled an exclusion, applied another only to the draft, and verified that
the engine catalog stayed unchanged until Save. After saving, ordinary provider.models reads
excluded the model while includeDisabled retained it for administration. Disk configuration and a
fresh settings mount retained the exclusion. A concurrent peer edit refused a stale enable write
without losing the peer's rule. Reload/review then enabled the model while preserving unrelated
rules. Favorite persistence and discarded orphan-rule removal passed. Settings and catalog reads
kept the desktop conversation count at zero. The 800 px document overflow check passed and
screenshots were inspected; input/select styling was aligned with the desktop theme before the
final package rerun. Final native results were written after successful owned cleanup.

Session model controls filter disabled providers/models and rank favorites from their own runtime
preferences. The browser-only reference matcher is tested against the engine's canonical grammar,
including bare, qualified, spaced and slash-containing model IDs. Exclusion wins over favorite
ranking, and source catalog order is preserved. The complete desktop suite passed 235 tests across
50 files; all 17 Rust tests passed, desktop typechecking passed 161 source files and targeted Biome
checks passed without warnings. Rust and backend product source were unchanged in this round.

Separate running engines do not yet receive automatic policy synchronization; this workspace
changes profile defaults and does not switch an existing session's model. Composer ranking and
exclusion were covered by focused logic tests, not a new native chat-picker interaction in this
round. Provider-wide visibility editing, bulk model actions, external-provider policy acceptance,
atomic compare-and-swap saves and complete settings parity remain open. The native flow verifies
read-before-write conflict refusal and readback, not an atomic cross-process transaction. Full
native/companion certification, coverage, hosted CI and release publication were not run.

## Subscription authentication UI and attempt ownership (2026-10-27)

Portable `0c1554b5f6ad-e968137cc424` adds a registry-driven subscription authentication workspace
to provider settings. It supports reviewed default/new named connection targets, reconnecting
saved subscription accounts, browser and device-code presentation, explicit external-browser
opening, transient password-style callback/code paste, cancellation and saved-credential readback.
OAuth credential entries show their authentication method and optional expiry and use the existing
verified local key-removal workflow. Local removal does not revoke provider-side browser sessions
or tokens. Existing sessions are not switched automatically after authentication.

The provider route now correlates OAuth list/status responses. Optional attempt identities bind
desktop start/code/cancel requests to one login, including background completion statuses. Stale
code and cancellation requests cannot complete or close a replacement attempt. Legacy clients
without these fields retain their prior protocol behavior. The desktop ignores foreign/old
same-service attempts, freezes terminal states, fences overlapping action completions, cancels its
owned attempt when the panel detaches, and clears manual input on submission/cancellation. The
opaque attempt-id validator was tightened after a test showed that the generic config-key grammar
accepted a path-shaped identity. Saved-provider projections expose only method/expiry metadata in
addition to their existing masked keys; access and refresh tokens remain excluded.

The focused native models scope passed with the rebuilt dependency closure, standalone engine and
Tauri release frontend. It used the real built-in ChatGPT authorization flow only to create a local
PKCE/loopback interaction: no sign-in website was opened, callback code submitted, token exchange
performed or live account authenticated. Registry discovery, alias collision refusal, review/cancel,
browser-ready state, stale cancellation refusal, manual-input clearing and panel-detach listener
cancellation passed without creating a conversation or saved test account. Existing model
visibility, custom definitions, key lifecycle and diagnostics checks remained in the scope.
Screenshots were captured for visual review, including the expanded sign-in view at 800 px.

Production-route backend tests inject a controlled authentication strategy at the external-auth
boundary. They verify successful manual completion into the selected named account, request/attempt
correlation, stale code/cancel refusal, owned cancellation, malformed-id refusal and token-free
credential metadata. The existing cancellation/persistence and provider-route/projection suites
also pass. The complete desktop suite passed 237 tests across 51 files; four focused backend suites
passed 78 tests. Desktop/server typechecks passed 163/312 source files and targeted Biome checks
passed without warnings. Rust product source was unchanged.

Live browser/device authentication, automatic refresh, successful native account readback and
OAuth refresh-token encryption acceptance still need real-account or dedicated local-provider
fixtures. Device-code rendering and remote authentication were not exercised by the native browser
startup scenario. Pending authentication is not restored after a renderer/process crash; cancellation
does not roll back a credential write already committed. The protocol has no provider-side revoke
operation. Full vault lifecycle, companion/full-native certification, full coverage, hosted CI and
release gates remain open. This immutable probe does not replace the installed application or
portable latest pointer.

## Provider-wide visibility and hosted catalog filtering (2026-10-27)

Portable `706943207f19-1c2f4c54a480` passed the focused native models scope with a dedicated
provider-level control inside Model visibility. The reviewed action changes only disabledProviders
in the profile draft. It retains credentials, definitions, favorites, fallback chains and individual
model exclusions. Enabling removes every case/whitespace-equivalent exclusion for that provider;
existing model rules still apply. Unavailable/deleted provider rules remain explicitly editable.
Enabled/disabled catalog filters now account for both provider-wide and individual exclusions.

The native proof cancelled a provider review, applied a draft without changing saved preferences,
then saved and verified ordinary catalog exclusion, complete administrative reads, disk persistence
and a fresh settings mount. The saved connection, favorites and both default/named fallback chains
remained identical. A concurrent provider-rule edit refused an old local enable operation and kept
the peer rule. After reload/review, enabling preserved that unrelated rule. Repeated provider
disable/enable retained a separately configured model exclusion; clearing that model rule restored
its catalog entry. An orphaned provider rule was removed through the UI and saved. The existing
model visibility, OAuth startup/cancel, custom-definition, key-management and diagnostics flows
also passed without conversation creation. Final results were written after successful owned cleanup.

A backend regression was reproduced before patching: hosted ACP catalogs returned their models
even when disabledProviders excluded ACP. The enabled control passed, but the exclusion assertion
failed with the actual hosted descriptor instead of an empty list. The hosted early-return branch
now applies the same provider/model exclusion predicate as saved catalogs, while includeDisabled
retains the complete administrative view. The unchanged assertions then passed for provider and
model exclusions, alongside saved-provider precedence controls.

Three focused backend suites passed 76 tests. The complete desktop suite passed 239 tests across
51 files; desktop/server typechecks passed 164/312 source files and targeted Biome checks passed
without warnings. The backend dependency closure, standalone engine and Tauri release executable
were rebuilt. Screenshots were inspected, and the existing 800 px visibility checks remained in
the native scope. Rust product source was unchanged.

Automatic propagation to separate running engines, native chat-picker policy refresh, live provider
execution acceptance and atomic cross-process preference transactions remain open. This control is
configuration exclusion, not credential deletion or an access-control boundary. Focused models
acceptance does not establish the complete native/companion matrix, full coverage, hosted CI or
release certification. The immutable probe leaves the installed application and latest pointer alone.

## Current-profile session choices and durable file workflows (2026-10-27)

The open conversation model picker now reads the current profile service's saved connections,
provider catalog and visibility/favorite policy. It refreshes policy while open and checks the
latest exclusions again before an explicit session model switch. Only these choice-policy fields
are projected; a profile preference frame must not replace session effort, identity or draft text.
Provider/model catalog requests have correlated replies and stale-selection guards. A reducer
regression first failed when a session preference frame erased preceding shared policy in one
batch; the unchanged assertion passed after merging partial preference updates. The actual native
picker initially timed out because providers.list did not echo its request identity; that route
now correlates provider.catalog and failure acknowledgements.

Portable `46472ee45709-9b6bb0afa2fc` passed the complete composer scope. Portable
`94776c39279c-9b6bb0afa2fc` passed the same scope using a companion session host. The actual profile
fixture changed favorites and model/provider exclusions while the picker was open, verified
ordering and re-enabling, and explicitly switched a temporary model and the original model back.
Session effort, draft and identity were retained. No additional conversation or human user-message
frame was created by these settings operations. Both scoped runs also passed ordinary composer,
BTW, queue/reload/drain, stop/steer, refinement, prompt resources, context controls, binary image/PDF
transport, approvals and next-step submission. A queue-after-reload test now waits for the current
panel to be expanded before asserting the retained attachment action; it still asserts real media
delivery and an unchanged provider-call count while the current turn is held.

Unsaved file text now persists in revision-checked per-file records in the native project registry.
The metadata-only recovery list exposes up to 500 recent records; opening one loads its content and
original disk baseline. Missing or no-longer-text source files do not erase recovery content.
Clean/save/discard operations retain revision tombstones. Before a disk save or explicit discard,
pending local writes drain and the stored draft revision is checked. Competing windows receive
an explicit local/stored comparison, with a fresh comparison after a stale resolution attempt.
This check does not make the subsequent project-file write an atomic cross-process transaction.
The existing 2 MiB native form limit includes both edited text and the original baseline.

An actual native navigation assertion failed when moving from Files to Memory and back lost the
open editor. Window-local file tabs now retain their existing draft controller and revision baseline
across project-tool remounts, while other windows still use independent revision ownership.
Portable `10d81a539441-0b72a5a5d912` passed the focused native files scope, including the unchanged
navigation assertion, durable recovery after renderer reload, a real peer write to the SQLite
draft, side-by-side comparison, explicit stored-version recovery, real disk writes/external-change
refusal, rename/move/delete and unified/split Git review with staging. No conversation was created.
The recovery/comparison screenshots were inspected, including the 800 px comparison layout.

The same files scope exercised engine-owned literal UTF-8 content search: actual source text,
folder and case controls, a rejected parent-directory scope, selected-source-line navigation,
and a real 205-line fixture producing 200 visible results with an explicit partial-result notice.
The 800 px search layout was inspected. The engine searches saved text rather than unsaved drafts,
returns bounded line previews instead of full file contents, honors the explorer's root ignore and
hidden/build/dependency policy, skips symbolic links and reports omissions. Limits are 1 MiB per
file, 32 MiB read, 5,000 scanned files, 20,000 directory entries and five seconds. These limits are
not a large-repository completeness or performance certification.

The wider native run also exposed a genuine number-preservation defect: a fractional instruction
revision changed by one floating-point bit through the Rust client. A real loopback Client.call
regression with an integer control failed before enabling serde_json's float_roundtrip feature and
passed afterward. The pinned version remains 1.0.154; its current registry version and supported
[feature list](https://docs.rs/crate/serde_json/latest/features) were checked before the change.
The full Rust suite passed 19 tests. The exact native timestamp assertion was retained, and the
focused settings scope passed instruction save/stale-refusal/reload, actual tool configuration and
availability windows. Cleanup now avoids treating an already-enabled tool's idempotent refusal as
a failed product operation.

The complete desktop suite passed 245 tests across 53 files with --no-fsModuleCache. Three focused
provider suites passed 77 tests; three file-content/routing suites passed five tests against real
temporary files, including scope/ignore boundaries, literal matching, link escape refusal,
oversized/binary omissions and result limits. Desktop/server/protocol typechecks passed
168/313/29 source files. Targeted Biome checks passed. A direct desktop-suite retry exhausted the
parent environment's memory; the owned 12 GiB QA job then passed. The backend dependency closure,
standalone engine and Tauri executable were rebuilt into an immutable portable probe. Installed
binaries and the portable latest pointer were not replaced. Full native-matrix completion,
external-provider quality, full coverage, hosted CI and signed release certification remain separate.

The default complete standard native suite subsequently passed on
`10d81a539441-0b72a5a5d912`, with verified copied checksums and Bun/Node absent from PATH. It covered
the project workspaces, settings and file/search cases above, three concurrent PTYs, renderer and
application restart, multi-project/session ownership, the full composer/media/approval flow,
canonical appearance, actual local-provider execution, saved-key use by a new engine process,
Code Assist and task dispatch. This is standard-host local acceptance; a complete companion-host
matrix, external provider acceptance and release certification are still distinct gates.

## Topic-boundary choice through refinement (2026-10-27)

Portable `839c1e1bdeab-0b72a5a5d912` passed the complete scoped composer suite on both standard and
companion hosts. It now includes the actual canonical topic advisor. The desktop asks only for
idle normal submissions on a supporting engine after five visible user turns; the engine retains
its own history-size, explicit-continuation, overlap and classifier gates. Advice failure continues
without inventing a fresh boundary. Cancel keeps the unsent text; edits made during the check
require a fresh explicit submission. Queue, active BTW and steering never reset the context.

The native fixture supplied real user turns, exercised advice without a human-send frame, cancelled
and verified the unchanged draft, then sent an explicit same-context choice. A fresh-context choice
opened normal refinement, created no human turn before approval, and retained its flag through
Original approval. The actual next provider request contained the canonical context_boundary marker
and excluded the previous topic's user text, while earlier visible chat and native session identities
remained intact. Both normal and 800 px topic dialogs were inspected. The ordinary queue/refinement,
resource/context, image/PDF, approval and next-step cases also passed after this scenario.

The desktop suite passed 246 tests across 53 files, including delivery acceptance with original
refinement metadata and explicit refusal of fresh-context requests on unsupported, active, queued
or steering paths. Desktop typecheck passed 168 files and targeted Biome checks passed. No engine
or dependency upgrade was required for this feature. Classification used the isolated authenticated
provider fixture; it does not establish external-model recommendation quality, full companion
project-workspace coverage, full coverage, hosted CI or release certification.

## Session-owned agent model plans (2026-10-27)

The advanced composer menu now opens an Agent model plan editor for the owning conversation.
It edits the canonical enabled/lock/followSessionModel/slots/roles preference through the session
engine. The concrete-model picker reuses the current-profile policy/catalog workflow with a local
selection callback; it never sends model.switch while editing a lane. Named tier and fallback
references, labels and nested reasoning settings are retained. Removing configured lanes requires
an explicit draft confirmation. Role overrides, label/runtime metadata and disabled/following pins
are preserved rather than replaced by a minimal provider/model object.

The editor keeps a saved baseline, refuses a competing whole-plan write, verifies full normalized
readback and offers explicit keep/discard/reload choices. The engine journals accepted plans with
the conversation. Profile settings are not used to store a conversation's lanes. Existing active
workers do not switch model merely because the future plan changes. Current subagent/companion
permission is reported independently; changing a model plan grants no spawn permission.

Portable `bc017a8deafb-0b72a5a5d912` passed the complete standard-host composer scope including this
new scenario. The native proof seeded real lane/role preferences, edited reasoning, selected a
current-profile lane model, checked that nothing changed before Save, and verified the saved
provider/model plus retained labels/runtime/roles. Following retained the pins; reducing configured
lanes required review. A competing plan update was refused without losing the local edit. Explicit
reload and renderer reload recovered the stored plan and preserved the independently persisted chat
draft. Profile config bytes and the active chat model stayed unchanged. No human message frame or
additional native session was created by plan management. Actual worker execution and cross-session
worker assignment are separate acceptance cases, not inferred from preference readback.

Portable `bf29d92921e5-0b72a5a5d912` passed the complete companion-host composer scope, including
the same plan scenario, topic/refinement flow, resources/context, binary attachments, approvals and
next steps. Its plan, file-recovery comparison and content-search dialogs use viewport-bounded native
dialog geometry. The plan's normal and 800 px vertical bounds were measured and passed; screenshots
were inspected, including its visible save bar. The complete desktop suite passed 248 tests across
54 files, desktop typecheck passed 170 source files, and targeted Biome checks passed.

Two earlier parallel native runs lost their WebView target before completing; their cause was not
established and they are not counted as passes. Serialized standard and companion retries passed.
The harness now records UI process exit/signal and browser connection state on failure. This does
not establish a parallel stress gate. Unsaved plan-editor recovery, atomic cross-process plan writes,
actual worker-routing execution, full companion project coverage and release certification remain open.

## Project Agent Roster (2026-10-27)

Portable `3ecda931611d-8b27c071046d` passed the dedicated `--roster` scope in a real
Tauri/WebView2 window with the bundled engine and portable checksum verification. The scenario
created custom roles in two isolated projects, edited/read back typed runtime policy, selected
models without switching a conversation, preserved unrelated peer budget edits and refused
same-field conflicts. It recovered window-local runtime drafts, saved identity Markdown exactly
on disk, reviewed a competing identity update and retained malformed configuration until explicit
file repair. Profile config bytes remained unchanged by role edits.

The same native scenario taught three structured directives, captured another from agent output,
paused/resumed learning without removing its buffer, verified project/role draft isolation, pinned
a skill, saved its addendum and resolved a custom role inheriting another custom role. The React
Flow graph used two actual base-role edges. Dark/light screenshots and an 800 px overflow check
passed. An authenticated local provider performed real headless consolidation; all four consumed
directives were archived exactly, the active buffer became empty and consolidated knowledge was
read back and explicitly cleared. Typed single-role/all-role resets stayed inside the fixture
projects and retained unrelated source files. No native conversation was created; no renderer
errors or extra frontend pages were observed.

The native run caught a document verification mismatch caused by canonical boundary trimming;
verification now follows loader normalization while the test separately asserts exact disk bytes.
An initial test incorrectly treated consolidation `sourceEntryCount` as consumed-entry count. That
field intentionally records the buffer after pruning for freshness checks; the UI now labels it
accordingly, and the native proof checks the original four-entry count, exact archive and empty
remaining buffer separately. Earlier failing attempts are not passes.

Backend regressions separately reproduced raw-versus-resolved protected-role tool/budget counts
and legacy-versus-structured directive counts, then passed after canonical resolver/parser fixes.
The three roster server suites passed 33 tests; the complete desktop suite passed 250 tests across
55 files. Desktop typecheck passed 175 source files, server typecheck passed 313 files, Rust tests
passed 19 tests and targeted Biome checks passed. Unsaved secondary forms persist within a window,
not across application restart. Cross-process writes are preflight checked rather than atomic.
Actual worker execution, live fleet topology, knowledge-checklist editing, full companion roster
coverage, full coverage, hosted CI and release certification remain unverified.

## Automation management and evidence (2026-10-27)

Portable `f2ef747dcce9-8b27c071046d` passed the first dedicated native `--automation` management
scope. Portable `47da535684d4-8b27c071046d` passed the expanded scope with the bundled engine,
checksums verified and no Bun/Node dependency in the launched application's PATH. Real Tauri UI
actions reviewed a canonical template, chose a profile model without changing profile config,
authored a reusable environment, refused an invalid cache path, preserved the form on close,
and applied it to the local job draft without creating a stored job. Setup argv, service health
checks and environment-name references, caches, ports and deadlines were saved and read back
through the real project management API. Credential references, GitHub event filters and
verification commands/deadlines survived the same round trip. Preview exposed missing references
without launching a worker or model request.

Two job drafts and two projects retained independent window-local edits. Dirty jobs could not
queue their older saved revision or toggle its enabled state. A competing server revision was
refused without losing the local draft; explicit reload recovered the actual saved revision.
The same scenario enabled a job, queued it with the worker offline, cancelled it through the
actual API and inspected its honest missing-result state. Missing artifacts were readable errors.
A malformed verification artifact was refused without crashing the renderer. Presentation-only
fixture files then exercised failed-check identity/duration/exit status and an explicitly unverified
environment receipt with setup/cache/loopback-port details. These files are rendering fixtures,
not Docker execution evidence. The cancelled run could inspect publication state but could not
prepare or publish a plan. No native conversation or external frontend page was created.

The complete desktop suite passed 254 tests across 57 files; desktop typecheck passed 181 source
files and targeted Biome checks passed. The native scenario includes light/dark screenshots and
an 800 px environment-dialog bounds/overflow check; screenshots were inspected. Actual Docker
execution, vault resolution inside a worker, real GitHub webhook delivery, successful PR plan
preparation/publication/update/CI/follow-up, restart durability of these secondary forms and full
release certification are NOT RUN. Publication controls use the canonical evidence/fingerprint
gates and an explicit in-app review; their presence does not establish successful external execution.

## Broader native baseline and fixture traffic ownership (2026-10-27)

Portable `22b61c4d9b75-8b27c071046d` passed the complete default standard-host native suite,
including project workspaces, settings/provider/model management, files/draft/search/review, Atlas,
Chronicle, skills, concurrent PTYs/restart, themes, cross-window draft conflicts, conversation and
composer/model plans/topic choice/resources, attachments, approvals, next steps, Code Assist and
actual isolated task dispatch. This is a local native baseline, not full release certification.
Automations were split into a lazy route: the main project chunk decreased from 512.52 kB to
464.71 kB; the dedicated automation chunk was 48.75 kB in this build.

An earlier full run on `47da535684d4-8b27c071046d` failed an attachment assertion because its
fixture-wide streaming-call count increased during a held media turn. Its retained transcript
showed the media still queued, no early human turn and an independently registered Kanban
supervisor; that attempt did not retain request metadata establishing the additional call's exact
origin. The stricter fixture-wide counter passed on the subsequent complete `22b...` run.
A separate real-loopback HTTP regression then reproduced the counter's inability to distinguish
unrelated streaming project work from tagged composer traffic (RED 2 versus 1, then GREEN).
Attachment checks now use the fixture's literal instruction markers while retaining exact
no-extra-call assertions, plus an explicit no-early-human-turn assertion. Failure artifacts now
record model/stream/refiner/topic/marker metadata without prompt bodies or media payloads.
This does not establish a parallel stress gate. One overlapping automation retry was stopped
by terminating only its exact owned QA runner and is not counted as a pass.

## Profile MCP resources and prompts (2026-10-27)

Portable `81172a2689af-114df4db694e` passed the dedicated `--mcp` native scope with the actual
bundled engine and portable checksum verification. Before any project/session existed, the UI
saved a disabled loopback HTTP MCP connection with an explicit private-network grant, verified its
stored transport/policy, enabled it, completed real JSON-RPC initialization and displayed its actual
tool count. Catalog opening and metadata selection performed no resource read. Explicit reads
resolved a resource and concrete template URI; a server error returned immediately through the
correlated operation. Required/optional prompt arguments reached the server and the resolved text
appeared with role/source labels. Closing reviewed inputs preserved them until explicit discard.
The scenario checked 800 px dialog bounds/overflow, inspected screenshots and removed the fixture
connection. There were zero projects and zero desktop sessions throughout that workflow.

The same native scenario first reproduced a real remote-connection defect: the UI omitted transport,
so the engine tried stdio and failed with `MCP stdio transport requires "command"`. Remote and local
forms now send `streamable-http` and `stdio` explicitly. Canonical server tool lists contain names,
not description objects; the desktop now preserves/counts those names instead of dropping them.
Server errors and untrusted annotation hints have readable presentation.

Two backend tests separately reproduced missing request IDs on selected MCP content and content
errors while the catalog control passed; after the narrow dispatcher correction, the four relevant
MCP/correlation suites passed 59 tests. The desktop suite passed 255 tests across 58 files and its
typecheck passed 182 source files; targeted Biome checks passed. Real external MCP OAuth,
binary content viewing/download, deep catalogs and first-class chat insertion remain
open. Text-only copy explicitly marks omitted non-text blocks; content is never sent as a user
message merely by browsing or resolving it.

## MCP connection edits and session tasks (2026-10-28)

Portable `ac9fbf84af09-114df4db694e` passed expanded native `--mcp` acceptance. The connection
editor saved a description while retaining a peer's endpoint update and exact hidden fixture
environment/header values, permissions and private-network policy. A competing description was
refused with the local draft retained until explicit reload. The existing content success/error,
compact and theme checks passed with zero projects/sessions in the profile workflow. This does
not cover OAuth or secret administration.

Portable `30fc040aa455-326645085c45` passed the initial native `--mcp-tasks` scope. A real modern
HTTP MCP peer received one tool invocation following the actual session permission review.
The desktop listed its local receipt, hid the remote task ID, prevented duplicate observation,
isolated a second session, preserved owner identity over UI reload, and requested cancellation
only after review. The peer received exactly one cancellation and the engine collected its final
cancelled state without replaying the tool. An expanded run on the same portable passed a real
JSON-RPC polling-error case: the receipt remained undelivered, its observer lease released, and
the UI requested observation recovery through the canonical permission gate. The original remote
result was collected with exactly two total tool invocations for two tasks, rather than replaying
either tool. The compact screenshot was inspected. No seeded task journal or WebUI frontend was
used. An intervening test retry reloaded before the
debounced native layout persisted its selected owner and restored the other session; the proof
now awaits actual persisted owner selection before reload, rather than relying on click timing.

Portable `c86e84d3c467-ed44fc062628` passed the expanded task scope including native elicitation.
This first failed on the real motor with `MCP interaction requests an unsupported or unadvertised
client capability`: the standalone backend never installed an elicitation handler. Its registry
now uses the canonical form adapter with the invoking run's requester, without a pre-context
root fallback. A durable construction/wiring assertion failed before this fix and passed after.
The native UI displayed Needs input, returned to the owning conversation's real question form,
submitted the branch value, observed exactly one actual `tasks/update`, and collected the final
result. Three scenarios caused exactly three total `tools/call` requests. The question screenshot
was inspected. Four covering backend bootstrap suites passed 30 tests; six MCP suites passed 81.
The current desktop suite passed 259 tests across 60 files and typecheck passed 187 source files.

The same portable passed expanded `--mcp` acceptance, including the profile-only connection and
content cases followed by a dedicated native composer session. Catalog browsing made no resource
read. Explicit resource and prompt resolution then appended source-attributed text to an existing
draft without replacing its prefix, creating a human turn or invoking a remote tool. Prompt role
labels remained ordinary draft text. UI reload retained both selections through the actual native
draft store. The normal submit controls remain responsible for sending, refinement and delivery.
Two content-projection tests cover wrong-source refusal, embedded text, binary omission labels,
binary-only refusal and the UTF-8 256 KiB selection limit. Binary attachment insertion is not
implemented by this text workflow.

The native proof exposed real root session IDs in `YYYY-MM-DD/sess_...` form being rejected by
MCP task handler/subscription validation. Both valid-owner cases failed before the correction;
shared validation now accepts a single safe date/session separator while retaining exact owner
resolution and rejecting traversal, encoded separators, backslashes and extra path segments.
The two handler/subscription suites passed 22 tests. Desktop tests passed 257 across 59 files;
desktop typecheck passed 185 source files and server typecheck passed 314.

An accidental root `typecheck` also invoked the root build while an engine build was running;
the overlapping engine output was discarded. Root typecheck failed with seven errors in two CLI
test files outside this desktop scope (`bench-menu.test.ts` and
`wrongforge-leader-provider.test.ts`). No base comparison established when those errors began.
The roster handler's direct production dependency on the private workspace agent-catalog was
moved from devDependencies to dependencies without changing its version; frozen installation
passed. A subsequent serialized engine build and the native task proof passed. Full root
certification, hosted CI, release/install/signing gates and external services remain NOT RUN.

## Session-owned process inspection (2026-10-28)

Portable `40f15229bf7c-6982289680b8` passed the initial dedicated native `--processes` scope.
Portable `e25216eab549-9c37a37d752f` passed the expanded scope with styled theme controls and
operation-time process identity checking. The UI began with an empty owned registry and created
no process by opening it. An actual approved `bash` tool launched an isolated Windows background
command; the desktop displayed its command/PID/tool/start-time and background status and read
its registered log through `process.output`. Explicit refresh awaited the shell's first output;
the UI never claimed that an empty first read was a live output subscription. The line-count
choices follow the canonical endpoint's 200-line maximum.

A second real conversation could not see the first conversation's process. Keeping the reviewed
termination dialog open left that process running; confirming termination used `process.kill`,
waited for registry disappearance and separately verified the actual owned OS PID had exited.
Light/dark and 800 px screenshots were captured and inspected. The test used an absolute Windows
PowerShell path because the bundled acceptance environment deliberately removes development
runtime paths and therefore selects cmd when no PowerShell is discoverable. Earlier fixture
attempts without provider setup or with unresolved shell commands were setup failures, not native
passes. One premature overlapping runner produced no result and is also not counted as a pass.

Three actual-handler tests reproduced missing request IDs on list/output/termination replies;
the narrow route correlation change restored them. A separate regression reproduced termination
of a replacement PID despite a mismatched reviewed start time. Optional `expectedStartedAt` now
checks identity inside the canonical output/termination operation, preserving legacy requests
and existing permission/protected-process policy. Matching and replaced identities have durable
tests; the three process suites passed 24 tests, followed by a five-test rerun after fixture
isolation cleanup. Desktop tests passed 261 across 61 files, desktop typecheck passed 189 source
files and server typecheck passed 314. Batch termination, richer exit/history records, browser
preview controls, long-running stress and full release certification remain separate work.

An additional incorrectly scoped root test command was interrupted and is NOT a full-suite
result. Focused reruns identified stale content-search protocol counts and an incomplete container
stub in host-seam acceptance; the original protocol iteration and cross-host assertions are retained.
The two focused protocol/host suites subsequently passed nine tests. The protocol inventory now
asserts all 299 client and 310 server entries, including content search and task notifications.
The CLI's WebUI response-consumer guard passed with the desktop-only content-search reply
explicitly documented; it does not imply that the WebUI implements the native search workflow.

## Refreshed complete standard-host native baseline (2026-10-28)

Portable `e25216eab549-9c37a37d752f` passed the complete default standard-host native suite after
the MCP content/task and process changes. Its final result was written only after test cleanup
completed; the owned QA job exited zero. The bundled binaries/checksums were verified and the
launched app had no Bun/Node on PATH. The run covered project workspaces without conversations,
SAGE/candidates/doctor and separate vector status, Kanban, Atlas, Chronicle, settings/provider/model
management, profile visibility/OAuth fixture handling, files/search/drafts/Git review, skills,
three concurrent PTYs/restart, all canonical palette pairs and theme persistence, two-window draft
conflicts, chat/clarification, model/effort and session model plans, explicit topic boundaries,
BTW/queue/steer/refinement, prompt/context tools, actual image/PDF transfer and extraction,
approvals, next steps, Code Assist, actual task dispatch and saved-provider reuse by a new engine.
The separate process scope also passed this portable; MCP content/task scopes passed the earlier
`c86...` portable as recorded above. This is focused local native acceptance and a broader local
standard-host baseline, not complete WebUI parity, a fresh companion-host certification, full
coverage, hosted CI, external-service proof or release/signing certification.
