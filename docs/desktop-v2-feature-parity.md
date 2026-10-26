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
| Project Kit | project-kit | Readiness, instructions/skills/config/checks, project-specific setup/actions |
| Requirement Intake | intake | List/create/edit/answers/suggestions/submit/cancel/archive |
| Dead code | deadcode | Scan/status/cancel/report and finding navigation |
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
| Project | Overview, SAGE/Vector Memory, Kanban, Code Atlas, Files/Changes/History, Chronicle, Skills, Automations, Prompt library/journal | Opens without creating or selecting a conversation |
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
| Files | Tree/folder browsing, search, tabs/drafts, text edit/save/readback, observed external-change conflict, images, create/folder/rename/move/delete, bottom evidence panel | Durable drafts across restart, large-tree virtualization, content search, richer editor, atomic concurrent-save policy, bulk operations |
| Review / Git | Unified/split diff, context folds, line notes/copy/composer draft, stage/unstage, commit/discard, branch/tag history, parents, commit files/diff, working-file navigation | Worktree management, conflict resolution, hunk staging, history topology visualization, persistent review threads, broader rename/binary/merge native cases |
| SAGE | React Flow relationship map by default, direct canonical totals, bounded preview-only opening payloads, persisted directed/labelled edges without fabricated shared-tag links, explicit full-record fetch on selection, optional structured library, read-only Markdown detail, explicit create/edit/cancel, stored relationship inspection, all non-deleted lifecycle states, visible revision/retention/source/anchor metadata, canonical kinds/statuses, cursor paging, real relationship map, evidence/retention/audience/lifecycle editing with revision checks, candidates accept/reject/bulk, Doctor checks/named repairs, search score breakdown, canonical file associations, delete/recover | Injection context and live trace inspector, recovery/backfill administration, full validity-authoring UX, large-graph exploration, every repair/retirement proposal native case |
| Vector memory | Separate disabled/enabled status, provider/model/dimensions/store metrics, semantic search, verified SAGE links | CRUD, reindex/maintenance, provider configuration and enabled-store native proof |
| Code Atlas | Explicit Smart/All rendering scopes, selected-node/path preservation beyond 160 nodes, architecture graph, subsystem boundary/coupling overview, paginated directed dependency matrix, incoming/outgoing change-impact analysis with hop limits, index, package/file/symbol drilling, source drawer, three graph layouts, explorer/sort, filters, centrality, minimap, grounded tour, directed path, relation weights, SAGE/file history, Code Assist | Rich persona tours, collapsed subsystem exploration, cross-scope paths, AI flow traces, broader live actor overlays, scale/performance native proof |
| Chronicle | Project timeline, UTC/time/path/event/outcome/agent/provider/model/session filters, cursor pagination, full-query summary, evidence detail, confidence-labelled lineage graph, file navigation, collector health; project-wide provider/task/file metrics views backed by the canonical endpoint and exercised natively without sessions | Richer cross-domain navigation, prompt-manifest viewer, export and long-history performance |
| Code Assist | Nine presets, request-scoped streaming/result, abort, explicit edit opt-in, file/symbol context | Applied-edit review/diff/rollback, broader cancellation/error native cases and real-model quality |
| Kanban | Visible board list with summary counts/progress; task list/cards; Definition/Execution/Evidence/Breakdown/History and expanded inspector; changed-field definition writes; live tool/skill/provider/model catalogs; default/pinned/fallback-profile routing; explicit tool/capability grants; isolated worker dispatch/result; verification execution/report; manual child split/chaining and proposal approve/reject; checks/notes/assignment/activity; managed transitions | Goal/SDD-linked run controls and task steering, tier-aware assignments where supported, decomposition generation/atomic assessment administration, resource-boundary editing, workflow administration within the canonical five fixed columns, goal/SDD linkage, concurrent same-field editor conflicts |
| Automations | Preview/create/edit, schedules/configuration, enable/disable, import/export, run queue/cancel and evidence reads | Environment/credential administration, complete templates/triggers, Docker execution, GitHub PR prepare/publish/check/follow-up, run comparison |
| Conversation | Compact native composer with model search/switch and effort, BTW, persistent queue, stop-and-steer, refinement and media; project-owned references, prompt library/journal and context controls; streaming Markdown, structured questions, readable approvals with remembered scopes, grouped session activity and completed-turn next steps added explicitly to drafts | [Action-level chat checklist](desktop-v2-chat-parity.md): complete tool/media viewing, richer reference selection and durable drafts, topic boundary, subagent model plans, checkpoint/rewind/recovery and full native parity |
| Native projects / sessions | Registry/windows, multiple agents/PTYS, search/attention, persistent tabs, replay and UI reattach | Full inspect/story/search/fork/resume workflows, durable draft recovery, long-running stress, geometry/migration |
| Fleet / agents | Desktop session overview, status/attention and session controls | Real agent roster/personas, assignments/topology, budgets/control, council, side-effect inspection |
| WrongStack settings | Global instruction document with Markdown preview and revision-protected save, actual tool catalog with durable profile enable/disable and rollback on write failure, provider/model availability calendar with weekdays/timezones/overnight/allow-only/blackout windows and verified saves, providers/custom endpoint/keys/model selection, searchable settings navigation, ordered fallback chains and named profiles, role/phase model and reasoning overrides, cost tiers/routing/leader guards, optional shared-contract resource limits, draft preservation, read-before-write nested merge and conflict refusal, typed preference groups/save/readback, MCP connection lifecycle, runtime diagnostics/log controls | OAuth, full vault lifecycle, model capabilities/custom catalogs/testing/quota/audit, complete fleet/Brain/Shadow/security/display policies and session-specific lane controls |
| Skills | Project/profile libraries, source filters, read-only bundled/foreign sources, Markdown reading/edit/preview, create/save/readback, invalid-document refusal, draft-leave guard, related files/references, Git install/update/uninstall and Markdown/ZIP export controls | Native Git lifecycle/export proof, richer invocation progress, durable drafts across workspace/app restart, richer document metadata and dependency navigation |
| Goals / missions | No dedicated management workspace | Persistent mission controls, graphs/phases/tasks, budgets, assignment/retry and verification |
| SDD | No dedicated management workspace | Specification conversation/approval/rewind, graph/run/task administration and complete lifecycle |
| Mailbox / collaboration | No dedicated management workspace | Threads/compose/reply/actions, receipts, retention, annotations and control |
| Design Studio | No dedicated management workspace | Gallery/kits, tuning, swap, materialization and verification |
| TechStack / Project Kit | No dedicated management workspace | Inventory/analysis/research/jobs/remediation, project readiness/configuration actions |
| Intake / Dead code / Chimera | No dedicated management workspace | Intake lifecycle, scan/report/cancel, review findings/transitions/notes/policy |
| Context / prompts | Session-owned calibrated context breakdown, effective instructions read, acknowledged repair/normal or aggressive compaction/guarded provider-context clear; project prompt library even with zero conversations, search/categories/favorites/recent, typed variables/preview/append/copy/create/readback/draft guard; real original/refined journal with session/date/category filters and reuse; canonical standalone journal recording and persisted refinement original | Validated context editor/apply, mode authoring/residency, atomic prompt-create collision handling, expanded template metadata, journal export and larger-history performance |
| Usage / diagnostics / integrations | Native connection state and selected profile controls | Full usage/cost dashboards, watcher/process/browser controls, MCP tools/resources/prompts/tasks and integration capabilities |

Kanban columns are fixed by the engine to Backlog, To Do, In Progress, Review and Done; custom
column creation/renaming/removal is not a WebUI capability to port. Pause/resume/stop on mirrored
boards belongs to the linked Goal/SDD run, not an invented standalone task endpoint.

No percentage is assigned from navigation or component counts. Missing actions remain missing
even when a related screen exists. The next domains must receive purpose-built workflows and
their real engine contracts; adding a generic action launcher does not change this table.

## Release gate

- Every current WebUI view/activity/settings section has an explicit desktop mapping.
- Every mapped feature has an action inventory and an honest implementation/evidence status.
- Runtime frontend imports never reach `packages/webui`, `webui-hq`, or `vibeui` UI modules.
- Both WebSocket and HTTP operations preserve the engine's validation and permission policy.
- Mutations show real errors and observed results; transport queue acceptance is not success.
- Cross-project/session isolation, persistence, cleanup, and user-visible workflows pass native tests.
- Full feature parity is not claimed until the action-level matrix and required release gates pass.
