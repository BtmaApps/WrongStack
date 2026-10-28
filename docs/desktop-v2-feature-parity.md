# Desktop v2 feature parity

The product requirement is complete functional access to WebUI capabilities from desktop-owned
screens. Embedding, opening, or importing the WebUI frontend is not an implementation strategy.
Backend services, protocol contracts, validation, and permission policy remain shared.

## Scope and acceptance

The current WebUI navigation contract contains 32 views, 7 activities, 16 settings tabs, 7 dock
sections, and additional inspector/composer overlays. Navigation coverage and functional parity
are separate gates. A launcher tile, a read-only snapshot, or a generic JSON viewer does not
establish management parity. Each capability needs its actual read, create/edit, lifecycle,
permission/error, persistence, and multi-project/session behavior verified where applicable.

The experience requirement is equally binding: projects and sessions remain the center of the
application. A compact conversation toolbar and independent project workspaces replace the growing tab row.
System/Light/Dark and the 13 canonical WrongStack color pairs apply throughout the desktop, including
terminals. Navigation mappings remain an acceptance inventory. Generic action-form pages have
been removed; they are not accepted as completed product screens.

The desktop uses the original five-block mark and native app icons. Build-time brand synchronization
copies the canonical palette labels, paired swatches, light/dark signal tokens and neutral surfaces;
it imports no WebUI runtime or component styles. Blue Navy is the shared default. Legacy desktop
preferences migrate to supported canonical palettes. Xterm receives concrete colors from the same
tokens; primary-button text uses an accessible foreground when the original foreground falls below
4.5:1 against its unchanged brand color.

Inventory sources:

- `packages/webui/src/stores/ui-store-types.ts`: views, activities, settings, dock, inspectors.
- `packages/webui/src/components/activity-bar/activity-bar-items.tsx`: navigation priorities.
- `packages/webui-protocol/src/client-*.ts`: WebSocket actions.
- `packages/webui-server/src/server/http-server/api-router.ts`: HTTP feature surfaces.
- Feature-specific server routes and contracts: accepted payloads and lifecycle semantics.

## Feature inventory

| Capability | WebUI views / activities | Desktop acceptance scope |
|---|---|---|
| Conversation | chat | Markdown/media/attachments, thinking/stream telemetry, queue, refine, prompts, approvals, structured input, history search, checkpoints, rewind, recovery |
| Projects and sessions | sessions, session-inspect, session-story | Native multi-project registry/windows, persistent sessions/terminals, restore, inspect/story, rename/delete/fork/resume, session search |
| Agents and fleet | roster, agents; fleet dock/inspectors | Live roster, definitions/personas, office map/topology, delegation/assignment, control, models/budgets, council, side effects |
| Files | files | Tree/search, read/edit/save, create/rename/move/delete, images, file activity, code assistance |
| Changes and repository | changes, history | Stage/unstage, diffs, history/commit details, commit/discard, worktree scan/diff/merge/cleanup, conflict handling |
| Mailbox and collaboration | mailbox; collab dock | Compose/reply/actions, agents, filters, receipts/threads, retention, collaborative annotations and control |
| Kanban and work | kanban; work dock | Boards/tasks/fixed lifecycle columns, create/edit/move/delete, assignments, workflows, contracts, decomposition, verification, todos and plan |
| Goals and missions | goal; goal/goal-state dock | Persistent mission, refine/pause/resume/clear, multiple goal graphs, phases/tasks, start/control/retry/assign, budgets and final verification |
| SDD | sddhub | Spec conversation/approval/rewind, graph/run creation, boards/tasks, assignment/models/fallbacks/verification, pause/resume/retry/stop, lifecycle and rollback |
| Memory | memory | SAGE listing/search/filter/detail/edit/remember/delete/recover, candidates/graph/doctor, vector memory and diagnostics |
| Automations | automation | Jobs/templates/environments/credentials, preview/create/edit/enable/delete/import/export, schedules/GitHub triggers, run queue/cancel, evidence, PR prepare/publish/check/follow-up |
| Skills | skill, skills | Discovery/read/create/edit/install/update/uninstall/export, source filtering, invocation/mentions |
| Design Studio | design-gallery, design | Kits/gallery/state, selection/tuning/swap/materialize/verify, project output |
| Providers and models | setup, settings, provider-test, provider-quota | Presets/custom endpoints, vault keys/OAuth, model catalogs/capabilities/custom models, test/quota/audit/status, fallbacks/routing |
| Context and instructions | context; context settings | Modes/editor/validation/apply, compaction/repair/clear, breakdown, system prompts/presets and user instructions |
| MCP and integrations | integrations/connection settings | Server config/lifecycle/auth, tools/resources/prompts/tasks, service health/actions, plugin integration capabilities |
| Prompts | prompts; composer journal/library | List/search/read/create/favorite/recent/used, journal, insertion/refinement and images |
| Reviews | chimera | Reports/findings, transitions/notes, evidence and review policy |
| CodeMap | codemap | Packages/files/symbols, live agent/file activity and navigation |
| TechStack | techstack | Snapshot/inventory/analyze/trends/reports, research/jobs/cancel, remediation preview/apply |
| Project Kit | project-kit | Reusable executable project capabilities: guides, typed input/output contracts, source revisions, tests, verification/run history and revision-pinned agent requests |
| Requirement Intake | intake | List/create/edit/answers/suggestions/submit/cancel/archive |
| Dead code | deadcode | Scan/filter/select, exact change preview, confirmed apply/verification/rollback, backups/undo and finding navigation; the current shared API is synchronous and has no scan-cancel command |
| Chronicle | chronicle | Status/query/facets/metrics/graph and detail navigation |
| Analytics and diagnostics | analytics, debug, refresh-debug | Usage/cost, runtime diagnostics, watcher/system state, connection/reconnect behavior |
| Browser and processes | browser dock; process/terminal overlays | Native preview isolation/devtools, live browser selection, process list/output/kill, terminals |
| Application preferences | settings | General/fonts/provider/JEV/connection/agent/execution/fallbacks/routing/fleet/integrations/chimera/context/logs/security/display |

## Current baseline

The existing vertical slice implements native projects/sessions/PTYs, persistent host transport,
provider/key setup and model selection, Markdown/copy/structured-input conversation, approvals,
and dedicated project knowledge, code, files/review, journal and automation workflows. This is
partial coverage, not parity.

Ownership is explicit:

| Scope | Desktop surface | Required independence |
|---|---|---|
| Project | Overview, Agent Roster, Session history, SAGE/Vector Memory, Kanban, Goals/mission, SDD/requirements, Code Atlas, Files/Changes/History, Chronicle, Mailbox, Project Kit, TechStack, Dead Code, Design Studio, Chimera Reviews, Skills, Automations, Prompt library/journal | Opens without creating or selecting a conversation |
| WrongStack profile | Providers, execution, context, capabilities, profile Skills, agents/fallbacks, MCP, diagnostics/logs | Opens with zero projects and sessions |
| Desktop | Appearance, local registry and layout | Does not rewrite engine preferences |
| Session | Conversation, terminal, context/instructions inspector, run activity, approvals, questions, results | Remains attached to its own persistent session |

Project/profile services have their own private native lifecycle and never appear as desktop
sessions. A newer service host can coexist with an older session host so an update does not
terminate running conversations. New portable builds are staged in immutable directories. Project/profile service reuse also
requires an exact bundled-engine build identity; mismatched engines use a versioned companion
service directory while the original host retains human sessions.

The native HTTP feature bridge exists because WebSocket-only access cannot cover Automations,
TechStack, Intake, CodeMap, analytics, vector memory, and other HTTP-backed features. The native
host retains the backend origin/token, binds calls to their owning project/profile/session runtime, bounds
requests/responses, and refuses redirects and arbitrary external/static resources. Its private
authentication uses the backend's `X-WS-Token` contract; credentials stay outside the renderer.

Dedicated project Memory, Kanban and Code Atlas screens and separate WrongStack profile settings
replace generic snapshots. SAGE opens its own React Flow relationship map and canonical counts,
with bounded record previews. Only persisted relations produce graph edges; vector search is a
separate workspace and is not loaded by the SAGE map. Full records load on explicit selection;
listing, filters, detail editing, deletion and recovery remain available. Kanban provides
real boards/tasks, priorities, labels, editing, drag/drop and canonical managed transitions. Code
Atlas explicitly indexes actual project code, drills packages/files/symbols and opens source in a
visible drawer. Profile fields save only edited values and verify backend readback; disabled MCP
connections can be configured and removed through their actual lifecycle.

Automation covers job
preview/create/edit, enable/disable, import/export, queue/cancel, and evidence reads. Docker worker
execution, GitHub publication, OAuth, and the remaining complex domains still require independent
native workflow evidence and design work. Generic action descriptors do not close these gaps.

## Action-level gaps in the current source

This table prevents partial management screens from being counted as completed WebUI domains.
Source implementation, focused tests, native interaction evidence and release certification are
separate statuses; see the [validation record](desktop-v2-validation.md) for the tested binary.

| Area | Desktop actions implemented | Remaining acceptance work |
|---|---|---|
| Files | Tree/folder browsing, filename filtering, engine-owned literal UTF-8 content search with scope/case/ignored-source controls, line previews/navigation and explicit budgets/omissions/partial results; tabs, native project-owned persistent text drafts with original disk baselines, metadata-only recovery list, explicit side-by-side stale-window draft resolution, text edit/save/readback, observed external-change conflict, images, create/folder/rename/move/delete, bottom evidence panel | Large-tree virtualization, richer editor, atomic concurrent disk-save policy, bulk operations; draft payloads are bounded to 2 MiB and the recovery list shows up to 500 recent records; content search is bounded and excludes hidden/build/dependency paths and symbolic links |
| Review / Git | Unified/split diff, context folds, line notes/copy/composer draft, stage/unstage, commit/discard, branch/tag history, parents, commit files/diff, working-file navigation | Worktree management, conflict resolution, hunk staging, history topology visualization, persistent review threads, broader rename/binary/merge native cases |
| SAGE | React Flow relationship map by default, direct canonical totals, bounded preview-only opening payloads, persisted directed/labelled edges without fabricated shared-tag links, explicit full-record fetch on selection, optional structured library, read-only Markdown detail, explicit create/edit/cancel, stored relationship inspection, all non-deleted lifecycle states, visible revision/retention/source/anchor metadata, canonical kinds/statuses, cursor paging, real relationship map, evidence/retention/audience/lifecycle editing with revision checks, candidates accept/reject/bulk, Doctor checks/named repairs, search score breakdown, canonical file associations, delete/recover | Injection context and live trace inspector, recovery/backfill administration, full validity-authoring UX, large-graph exploration, every repair/retirement proposal native case |
| Vector memory | Separate disabled/enabled status, provider/model/dimensions/store metrics, semantic search, verified SAGE links | CRUD, reindex/maintenance, provider configuration and enabled-store native proof |
| Code Atlas | Explicit Smart/All rendering scopes, selected-node/path preservation beyond 160 nodes, architecture graph, subsystem boundary/coupling overview, paginated directed dependency matrix, incoming/outgoing change-impact analysis with hop limits, index, package/file/symbol drilling, source drawer, three graph layouts, explorer/sort, filters, centrality, minimap, grounded tour, directed path, relation weights, SAGE/file history, Code Assist | Rich persona tours, collapsed subsystem exploration, cross-scope paths, AI flow traces, broader live actor overlays, scale/performance native proof |
| Chronicle | Project timeline, UTC/time/path/event/outcome/agent/provider/model/session filters, cursor pagination, full-query summary, evidence detail, confidence-labelled lineage graph, file navigation, collector health; project-wide provider/task/file metrics views backed by the canonical endpoint and exercised natively without sessions | Richer cross-domain navigation, prompt-manifest viewer, export and long-history performance |
| Code Assist | Nine presets, request-scoped streaming/result, abort, explicit edit opt-in, file/symbol context | Applied-edit review/diff/rollback, broader cancellation/error native cases and real-model quality |
| Kanban | Visible board list with summary counts/progress; task list/cards; Definition/Execution/Evidence/Breakdown/History and expanded inspector; changed-field definition writes; live tool/skill/provider/model catalogs; default/pinned/fallback-profile routing; explicit tool/capability grants; isolated worker dispatch/result; verification execution/report; manual child split/chaining and proposal approve/reject; checks/notes/assignment/activity; managed transitions | Goal/SDD-linked run controls and task steering, tier-aware assignments where supported, decomposition generation/atomic assessment administration, resource-boundary editing, workflow administration within the canonical five fixed columns, goal/SDD linkage, concurrent same-field editor conflicts |
| Automations | Preview/create/edit, schedules, reviewed canonical template cards, profile-aware job model choice, typed reusable environments with setup/services/health/caches/ports and portable import/export, credential reference rows, GitHub event/filter configuration, enable/disable, job import/export and revision-guarded writes; independent per-job/project window drafts and explicit reload; offline queue/cancel, run inspector, structured verification/environment receipts, logs/colored patches and explicit PR plan/publication/CI/follow-up controls through canonical endpoints | Actual Docker execution/credential resolution/service lifecycle and signed GitHub delivery; successful PR prepare/publish/update/check/follow-up native evidence; run comparison, event sample authoring, restart-durable secondary drafts and broader completed-result presentation cases. The shared management API currently offers no job-delete endpoint |
| Conversation | Compact native composer with current-profile model choices and effort, BTW, persistent queue, stop-and-steer, refinement and media; reviewed topic-boundary choices; session-owned agent model plans with role/lane reasoning and fallback references; project references, prompt library/journal and context controls; streaming Markdown, structured questions, readable approvals, grouped activity, next steps and restart-persistent draft text, references and media | [Action-level chat checklist](desktop-v2-chat-parity.md): complete tool/media viewing, richer reference selection, actual worker-routing execution, remaining recovery administration and full native parity |
| Native projects / sessions | Registry/windows, multiple agents/PTYS, search/attention, persistent tabs, replay, UI reattach and restart-persistent conversation drafts; version-checked writes with side-by-side review and confirmed local/saved version choice across windows; session-owned History & recovery with actual journal inspection, retained-message/journal-usage counters, recorded-event search/type filters, file/tool footprint, reviewed checkpoint rewind, active-run guard, stale-journal refusal and observed file/journal result with transcript replacement; native local-provider, real-file, partial-error and draft-preservation proof | Search beyond the latest 500 records, richer story views, redo/recovery administration, durable recovery-operation records, selective conflict merging, long-running stress, geometry/migration |
| Project conversation history | Dedicated project catalog with bounded recent windows, summary/provider/outcome filters and canonical journal-emptiness checks; recorded name editing with stale-name preflight and verified readback; read-only retained transcript, bounded cross-session retained-text search with progress/stop and revision-checked match navigation, role/full retained-text search, revision-protected message/text pagination, structured tool input previews/results, collapsed reasoning, image/PDF metadata and extracted document text; copy and explicit append-to-existing-draft, plus identity-matched return to an already-open native conversation; reviewed native resume/fork with current project files, private bootstrap readiness and engine-version guard; standard- and companion-host native proof without creating a conversation for reads | Search beyond the latest 500 records and deeper catalog pagination, persisted selection/filter state, binary attachment viewers, more than 100 blocks per message, full structured tool-input expansion, compressed/large-history acceptance, atomic name changes, older-host migration and richer story views |
| Project Agent Roster | Searchable built-in/custom catalog and creation, stored base-role inheritance map, resolved runtime policy alongside typed project overrides, current-profile model picker, six budgets, model allow/fallback policy, availability, tools/skills/capabilities, identity and directive Markdown editors, structured learning evidence, enable/pause/teach/capture, conflict overlap review, consolidation/archive metadata, skill affinity/pins/addenda, prepared improvement instructions and reviewed project-file resets; stale-write preflight/readback and window-local role/project drafts | Native acceptance is recorded separately in the validation log; unsaved secondary forms survive navigation in the current window, not application restart; actual worker execution/routing, large catalogs, cross-window atomic writes and knowledge-checklist editing remain separate |
| MCP content and tasks | Profile-owned resource/template/prompt browser, explicit reads and concrete template URIs, typed prompt arguments, source/role-labelled text and attributed copy; changed-field connection editing with peer-field merge, protected credential/policy preservation and same-field conflict refusal; actual transport/private-network configuration and tool counts. Session-owned task receipts with search/status filters, independent correlated refresh, observer recovery and reviewed canonical cancellation; actual task invocation/isolation/reload/cancellation, polling-error recovery and task question/answer native proof; explicit composer resource/prompt text selection with source/role retention and durable append-to-existing-draft | MCP OAuth, secret environment/header and advanced policy administration, broader task lifecycle stress, binary media/download viewers and large catalogs |
| Fleet / agents | Desktop session overview, status/attention and session controls; independent project Agent Roster | Live execution/office topology, assignments and control, council, side-effect inspection; role inheritance is not execution topology |
| Session processes | Session-owned list/search/status, command/PID/tool/start-time and protected/background details, explicit registered-log tail with line-count selection, reviewed single termination and fresh process-identity check through canonical endpoints | Native acceptance is recorded in the validation log; batch actions, richer exit/history metadata, process stress and browser preview controls remain separate |
| WrongStack settings | Global instruction document with Markdown preview and revision-protected save, actual tool catalog with durable profile enable/disable and rollback on write failure, provider/model availability calendar with weekdays/timezones/overnight/allow-only/blackout windows and verified saves, providers/custom endpoints and model selection; profile model/provider visibility and favorites with reviewed draft actions, preserved provider-wide references, retained per-model exclusions on re-enable, and reviewed model-level fallback cleanup, orphaned exclusion-rule editing, explicit draft/save and conflict/readback checks; saved-key activation/deletion and provider removal with confirmations/readback; registry-driven subscription OAuth browser/device/manual-code UI, reviewed aliases/reconnect, attempt-owned status/cancel and saved-credential verification; searchable model registry and provider model details, structured custom definition create/edit/remove, token limits/pricing/cache costs/modalities/tri-state capabilities, schema preservation and stale-edit preflight; recorded account quota/balance/reset/pace views with real account refresh outcomes, model waiting-room retry/clear and readable audit; searchable settings navigation, ordered fallback chains and named profiles, role/phase model and reasoning overrides, cost tiers/routing/leader guards, optional shared-contract resource limits, draft preservation, read-before-write nested merge and conflict refusal, typed preference groups/save/readback, MCP connection lifecycle, runtime diagnostics/log controls | Live OAuth account/refresh acceptance and full vault lifecycle, advanced reasoning/price-tier schema authoring, durable model-editor drafts, atomic custom-model writes, cross-runtime policy refresh, broader external-provider/quota proof and automatic cross-runtime waiting-room synchronization, complete fleet/Brain/Shadow/security/display policies and session-specific lane controls |
| Skills | Project/profile libraries, source filters, read-only bundled/foreign sources, Markdown reading/edit/preview, create/save/readback, invalid-document refusal, draft-leave guard, related files/references, Git install/update/uninstall and Markdown/ZIP export controls | Native Git lifecycle/export proof, richer invocation progress, durable drafts across workspace/app restart, richer document metadata and dependency navigation |
| Goals / missions | Separate project-owned persistent mission and execution-goal catalog; mission set/replace, refine, pause/resume, clear, progress, deliverables and activity; per-goal state, creation and feasibility assessment, phase/task details, status changes, retry, live task addition/assignment/move with dependency warning, pause/resume/stop and verification status | Budgets, richer task/verification details, conditional mission writes and broader native action coverage |
| SDD | Project-owned interview with persisted snapshots, answers, review/rewind/discard; specification catalog, task dependency list and React Flow graph; current execution snapshot and run list, run start options and pause/resume/stop; task routing/verification/dependencies/activity inspector and live-only retry/cancel/delete/assignment/model/fallback/verification/split controls; project maintenance with explicit scope, confirmations and engine results for cleanup/rollback/destroy | Full intake and spec authoring, live graph/kanban, historical run detail, catalog-backed run/model configuration, live split/rollback and broader native provider/run coverage |
| Mailbox / collaboration | Dedicated project mailbox with recent-window thread grouping, loaded-message search, aggregate/actor visibility and receipt semantics, Markdown bodies, reply references, task context, registered agents, compose/reply with canonical types/audience/priority, acknowledged sends/refusals, in-process project draft ownership and pending-send protection, read/complete/reopen/soft-delete actions, and confirmed project-wide purge/compact/clear with thresholds and observed results | Restart-safe compose drafts and multi-window draft resolution, complete older-history/thread retrieval, richer delivery receipts and notifications, collaboration annotations/control and broader lifecycle/stress coverage |
| Design Studio | Dedicated project gallery with actual light/dark token previews, aesthetic/tag search, kit/stack pinning and confirmed reset, scoped CSS color editing with stale-color preflight/readback, semantic corner/spacing/font/motion tuning, confirmed theme materialization with source readback, contrast observations, implementation guide and file-level design verification with signal coverage; native activation/edit/tune/export/verification/isolation proof | Durable editor drafts, atomic cross-runtime kit/override changes, broader supported-stack outputs and quality/scale evidence |
| Project Kit | Dedicated project catalog/search and invalid-kit diagnostics; read-only guide/contracts/tests/source listing, typed recursive input forms with optional fields/arrays/enums/defaults and constraints; revision verification status and recent run history; refreshed revision preflight, verification/run request preparation, copy and explicit same-project conversation draft handoff preserving existing text/references/media/mode | Durable parameter drafts, richer run diagnostics and source snapshots, broader real agent verification/run evidence and large-catalog usability |
| TechStack | Dedicated project workspace with local inventory, registry/advisory enrichment and model research controls; persisted current-job tracking/cancel, dependency/workspace/status/directness filters, version/source/license facts, evidence and interpretation-labelled findings, dependency research, trends, selected remediation review/apply with server-side reviewed-target validation, Markdown report reading and JSON/SPDX/CycloneDX export controls; native local-inventory/job/project-isolation and report-format proof | Real registry/model research quality, permission-governed package execution and disk export proof; cross-window job discovery, large inventories and historical comparison |
| Requirements intake | Project-owned catalog/search/status filters; idempotent draft creation with verbatim original request and attachment/related-resource references; native new-request and per-record edit/answer draft recovery with ordered revision checks, reviewed multi-window recovery and persisted create-retry identity; original server-version baselines retained for edits and answers with explicit answer review after reload; structured information and versioned edits/resource appends/suggestion decisions; question answers, history, submit/cancel/archive and guarded SDD draft transfer; readable recorded resources, suggestion proposals/statuses and field-source provenance | Configured suggestion generation, unadded-reference form draft recovery, richer assessment and larger-catalog performance |
| Dead code | Dedicated project scan with retained report scope/public API option, category/confidence/search/fixability filters, selected findings and bounded rendering, exact diff preview, preview-drift preflight, confirmed apply with explicit verification mode, readable verification/rollback/exclusion results, backup list and conflict-aware confirmed restoration, same-project agent-draft handoff and in-process project operation/result ownership; native real-file scan/preview/apply/backup/restore and project-isolation proof | Atomic preview-to-apply revision binding, long-running verification and rollback cases, restart recovery and broader source/editor navigation |
| Chimera | Dedicated project report catalog across originating core sessions, lifecycle/origin/search filters, report and finding journals, severity/status filters, explicit finding and report decisions with recorded outcomes/reasons, citation verification distinct from defect confidence, claimed/observed evidence, readable full reports, project/report-owned in-process notes, same-project follow-up draft preparation and live refresh; native project isolation and lifecycle proof. Profile-owned Chimera/continuous review policy covers models, profile selection, follow-up, cascade, batching and concurrency with native save/disk/readback/reload evidence | Restart-safe notes, broader concurrent lifecycle coverage, advanced plugin policy, report pagination and large-history usability |
| Context / prompts | Session-owned calibrated context breakdown, effective instructions read, acknowledged repair/normal or aggressive compaction/guarded provider-context clear; project prompt library even with zero conversations, search/categories/favorites/recent, typed variables/preview/append/copy/create/readback/draft guard; real original/refined journal with session/date/category filters and reuse; canonical standalone journal recording and persisted refinement original | Validated context editor/apply, mode authoring/residency, atomic prompt-create collision handling, expanded template metadata, journal export and larger-history performance |
| Usage / diagnostics / integrations | Native connection state and selected profile controls; MCP lifecycle and dedicated resource/prompt browser | Full usage/cost dashboards, watcher/process/browser controls, MCP auth/tasks/advanced configuration and remaining integration capabilities |

Kanban columns are fixed by the engine to Backlog, To Do, In Progress, Review and Done; custom
column creation/renaming/removal is not a WebUI capability to port. Pause/resume/stop on mirrored
boards belongs to the linked Goal/SDD run, not an invented standalone task endpoint.

No percentage is assigned from navigation or component counts. Missing actions remain missing
even when a related screen exists. The next domains must receive purpose-built workflows and
their real engine contracts; adding a generic action launcher does not change this table.

## Remaining delivery order

This order prioritizes daily multi-project/session use, then missing project workspaces. Each
item remains open until its engine-backed interactions and native acceptance cases pass.

1. **Provider/model and policy settings:** live OAuth account/refresh acceptance and full vault lifecycle; advanced model
   definition authoring; broader quota/test workflows and health
   synchronization; fleet, Brain, Shadow and security
   policies; session-specific effective routing. Preserve the distinction between desktop
   appearance, profile defaults and the options of an already running session.
2. **Files and repository work:** editor depth and large-tree navigation;
   hunk staging, merge-conflict resolution, worktree management and persistent review notes.
   The current pre-save external-change check does not establish atomic concurrent saves.
3. **Session history and recovery:** deeper project catalog paging and content search beyond the latest 500 records;
   richer story, redo and edit/retry actions. The catalog and
   retained transcript reader exist independently of open conversations. Inspect and
   reviewed rewind now have their own session workspace under Tools. Keep the resting chat calm.
4. **Agents and collaboration:** project roster/personas and typed model/budget controls now have
   dedicated native evidence. Finish actual worker routing, delegation/live execution topology,
   council and side-effect inspection; extend mailbox thread/receipt/retention coverage. Role
   inheritance and the desktop session overview do not substitute for live fleet topology.
5. **Existing project workspaces:** finish linked Kanban/Goal/SDD run controls and verification,
   historical SDD run details and catalog-backed run options; SAGE trace/recovery/validity and
   large graphs; Code Atlas collapsed subsystems, richer tours and flow traces; actual automation
   Docker/environment/credential execution and signed GitHub delivery/publication evidence,
   beyond the implemented native management and evidence workflows.
6. **Project domain completion:** Chimera review has a native-tested dedicated workspace;
   advanced plugin policy and durable notes remain. Design Studio needs durable edits and atomic kit changes;
   dead-code cleanup needs
   long-running verification and restart coverage.
   Project Kit needs broader agent execution evidence and durable
   parameters; TechStack needs external-service execution and disk-export acceptance coverage.
7. **Cross-cutting completion:** finish MCP auth/advanced configuration, broader task lifecycle stress and binary composer content beyond the
   native-tested content browser, connection editing and task lifecycle; usage/cost dashboards, batch process and
   browser controls, remaining composer actions and durable secondary forms. Then complete
   keyboard/accessibility, multi-window stress, migration, geometry, performance, packaging and
   signed update gates. Focused native checks do not replace the full release matrix.

Requirements intake already preserves new forms, existing metadata edits and answer drafts.
Its remaining work is configured suggestion generation, resource inputs not yet added, richer
assessment and larger-catalog behavior; it is not the largest outstanding desktop domain.

## Release gate

- Every current WebUI view/activity/settings section has an explicit desktop mapping.
- Every mapped feature has an action inventory and an honest implementation/evidence status.
- Runtime frontend imports never reach `packages/webui`, `webui-hq`, or `vibeui` UI modules.
- Both WebSocket and HTTP operations preserve the engine's validation and permission policy.
- Mutations show real errors and observed results; transport queue acceptance is not success.
- Cross-project/session isolation, persistence, cleanup, and user-visible workflows pass native tests.
- Full feature parity is not claimed until the action-level matrix and required release gates pass.
