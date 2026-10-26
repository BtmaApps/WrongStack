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
