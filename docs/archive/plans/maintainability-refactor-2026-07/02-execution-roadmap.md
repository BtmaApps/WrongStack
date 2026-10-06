# Execution Roadmap

> Archived on 2026-10-06. Claims, counts and test results below are historical
> evidence or proposals; they are not current checkout certification. Use the
> [maintained documentation](../../../README.md) and current source for runtime behavior.


## Relationship to the canonical task graph

This roadmap expands the canonical waves without changing their task statuses. Canonical task IDs such as `V1`, `P3`, or `R3` are defined in [`../architecture-refactor-task-graph-2026-07.md`](../architecture-refactor-task-graph-2026-07.md). Status changes must be made there, not in this document.

## Sequencing rules

1. Verification gates precede behavior movement.
2. Authority is introduced before consumers migrate.
3. A hotspot is split only after its behavior has journey or characterization coverage.
4. Compatibility removal is later than authority introduction and consumer migration.
5. Package moves require before/after workspace and module dependency graphs.
6. The CLI and other composition roots migrate last for a given authority, after reusable behavior has a stable home.
7. Workstreams may run in parallel only when their file ownership and contract dependencies do not overlap.

## Wave 0 — Make architecture evidence trustworthy

**Canonical tasks:** `V1–V5`, `G1–G3`<br>
**Goal:** Eliminate false-green architecture and verification results.

### Deliverables

- machine-readable workspace/package/source/test inventory;
- complete test-project ownership with zero-collection failure;
- test-inclusive TypeScript ratchet;
- clean-build artifact lineage in CI;
- complete internal Core layer registry;
- module dependency graph covering runtime and type edges;
- strongly connected component failure gate;
- no-growth hotspot baseline generated from current tree;
- architecture exception registry with owner and expiry;
- generated architecture health report.

### Required architecture-check changes

1. Enumerate every actual Core source area, including defaults, goal, HQ, hooks, plugins, prompts, notifications, tasking, tools, worktree, and chronicle.
2. Apply dependency checks to every declared layer, not a selected subset.
3. Resolve imports through barrels when detecting cycles.
4. Report runtime and type-only cycles separately; both are blocking unless explicitly excepted.
5. Compare current hotspot size/coupling against a committed baseline and fail on unexplained growth.
6. Treat an expired exception as a CI failure.

### Exit gate

Two clean checkouts produce identical inventories and all expected tests are discovered, typechecked, and assigned to exactly one runtime project. The generated module graph identifies the currently known cycles until their explicit exceptions or fixes are landed.

## Wave 1 — Introduce neutral contracts and lifecycle seams

**Canonical tasks:** `S1–S4`, `L1–L2`, preparation for `P1`, `M1`, `M2`, `R3`<br>
**Goal:** Create small stable seams before moving implementations.

### Deliverables

- `TrustBoundary` capability decision contract;
- disposable plugin host handle and deterministic teardown;
- surface protocol ADR and package scaffold;
- `MemoryPort` contract and conformance suite;
- `ProviderDefinition` and `PluginManifest` schemas;
- event DTO policy replacing full mutable Context payloads;
- compatibility adapter registry.

### Exit gate

Each new contract is dependency-light, has contract tests, and is adopted by at least one real producer and one real consumer. No old behavior is deleted in this wave.

## Wave 2 — Consolidate cross-surface authorities

**Canonical tasks:** `P1–P6`<br>
**Goal:** Remove duplicate protocol, backend, and frontend semantic ownership.

### Ordered slices

1. Introduce protocol decoders and golden fixtures.
2. Adapt WebUI Server to the canonical protocol.
3. Adapt WebUI and SimpleUI clients.
4. Move shared connection state and pure projections out of renderers.
5. Migrate CLI embedded backend handler families to WebUI Server services:
   - handshake/authentication;
   - session and message operations;
   - execution and tool events;
   - configuration/provider/model operations;
   - memory and history operations;
   - Kanban/coordination/HQ operations;
   - static asset and lifecycle handling.
6. Cut Desktop production hosting over to the sole backend.
7. Retire the CLI inline HQ dashboard after WebUI HQ asset and recovery gates pass.
8. Delete the embedded backend only after request/response and event parity is demonstrated.

### Exit gate

There is one message union, one decoder family, one WebUI backend behavior path, and one featureful HQ frontend. CLI contains only host adapters and composition for browser surfaces.

## Wave 3 — Consolidate metadata and extension composition

**Canonical tasks:** `M1–M5`<br>
**Goal:** Replace manually synchronized registries and orphan implementations.

### Ordered slices

1. Provider registry: canonical definitions, projections, then surface migrations.
2. Plugin manifest: data-only catalog, lazy loaders, lifecycle/config projections.
3. Tool definitions: tier and pack authority inside Tools.
4. ACP: isolate legacy entrypoints and remove the runtime compatibility cycle.
5. Security Scanner: choose one real CLI/plugin composition path and remove the no-op placeholder.

### Exit gate

Adding a provider, plugin, or tool requires one canonical definition plus its implementation, not edits to multiple hand-maintained lists. Security Scanner is either genuinely reachable in production or intentionally removed.

## Wave 4 — Decompose behavioral hotspots

**Canonical tasks:** `T1–T3`, `C1–C3`, `D1–D3`<br>
**Goal:** Turn god components and coordinators into tested feature/domain slices.

### TUI order

1. top-level journey harness;
2. input/key-routing seam;
3. submit/run orchestration seam;
4. overlay and picker controller seams;
5. domain reducer slices;
6. root shell composition;
7. direct view-type imports removed from state modules.

### CLI order

1. boot/dispatch journey harness;
2. move reusable services out of slash commands;
3. split slash context contract from command catalog;
4. explicit bootstrap/runtime/surface/shutdown phases;
5. plugin disposal integrated with shutdown;
6. thin `cli-main` composition.

### Director order

1. realistic multi-agent journey harness;
2. extract error and tool contracts from Director implementation;
3. assignment lifecycle service;
4. budget, lease, retry, and recovery policies;
5. mailbox/fleet adapters;
6. Director becomes orchestration shell.

### Stop rule

After two slices, pause and redesign a stream if it has not reduced either cross-domain imports or target-file responsibility/size by at least 20%, or if integration-test flakiness materially increases.

## Wave 5 — Resolve Core, Runtime, persistence, and memory ownership

**Canonical tasks:** `R1–R8`<br>
**Goal:** Make the foundation and runtime layers honest.

### Ordered slices

1. Decide public export and configuration ownership.
2. Extract a dependency-free persistence primitive.
3. Introduce `MemoryPort` and split Super Memory internally.
4. Pilot one complete subsystem under the proposed Runtime ownership model.
5. Apply the pilot gate:
   - proceed when dependency and host complexity decrease;
   - fold Runtime when it remains mostly pass-through or creates reverse edges.
6. Migrate one subsystem at a time.
7. Move product plugins, skills installer, HQ runtime, design workflow, and management tools out of Core.
8. Retire compatibility exports after usage and release gates.

### Exit gate

Core's declared architecture matches its actual contents and dependencies. Runtime has one settled purpose. Storage implementations and memory behavior conform to explicit ports without unsafe casts or consumer-specific duck types.

## Wave 6 — Consolidate the remaining packages

**Goal:** Apply the established contracts to lower-risk or more cohesive packages.

### Deliverables

- Kanban cycle removal and `_internal` decomposition;
- Tools feature packs and writer decomposition;
- ACP client/server/integration entrypoints;
- MCP registry/transport/auth internal boundaries;
- SDD scheduler/dispatch/supervisor boundaries;
- Desktop thin-host completion;
- shared redaction utility for Telegram and other hosts;
- documentation and architecture-reference refresh.

## Milestones

| Milestone | Definition |
|---|---|
| M0 — Truthful baseline | Verification inventory, module graph, ratchets, and exceptions are enforced |
| M1 — Contracts available | Protocol, memory, provider, plugin, lifecycle, and trust contracts have real adopters |
| M2 — Single browser backend | CLI embedded backend no longer decides behavior |
| M3 — Metadata authority | Provider/plugin/tool additions have one canonical edit path |
| M4 — Thin primary shells | TUI app, CLI main, and Director are orchestration shells |
| M5 — Honest foundation | Core and Runtime ownership is settled and compatibility debt is scheduled |
| M6 — Program close | All package workstreams meet their acceptance gates and docs are regenerated |

## Recommended first ten PRs

1. Generate workspace/source/test/architecture inventory (`V1`, `G1`).
2. Expand Core layer coverage and add runtime/type SCC reporting.
3. Add hotspot ratchet and exception owner/expiry schema (`G2`, `G3`).
4. Add TUI, CLI, and Director characterization gaps without moving behavior.
5. Accept surface protocol ADR and scaffold its dependency-light package (`P1`).
6. Add golden protocol fixtures and migrate one handshake path.
7. Define `MemoryPort` and conformance tests; add legacy adapter without switching defaults (`R3`).
8. Define `ProviderDefinition` and migrate one low-risk projection (`M1`).
9. Define data-only `PluginManifest` and change enablement to precede import (`M2`).
10. Break the smallest confirmed module cycles: SimpleUI, Super Memory text utilities, fallback model parser, and ACP compatibility re-export.

## Parallelization guidance

Safe early parallel lanes:

- verification inventory and CI lineage;
- protocol design and golden fixtures;
- memory contract design;
- provider/plugin schema design;
- characterization tests for TUI, CLI, and Director.

Do not parallelize changes that simultaneously edit:

- Core root exports;
- CLI composition/bootstrap;
- WebUI message unions;
- plugin catalogs and CLI plugin wiring;
- provider registry and setup UI projections;
- shared package manifests or lockfile.
