# Core, Runtime, Storage, Coordination, Kanban, and Memory Workstream

> Archived on 2026-10-06. Claims, counts and test results below are historical
> evidence or proposals; they are not current checkout certification. Use the
> [maintained documentation](../../../README.md) and current source for runtime behavior.


## Workstream objective

Reduce Core to an honest foundation, settle Runtime ownership through an evidence-based pilot, establish explicit persistence and memory ports, and remove the highest-risk internal dependency cycles.

## Entry gates

- `V1`, `V2`, `V4`, `G1`, and `G3` are complete for any physical package movement.
- The affected subsystem has behavior/contract characterization.
- Current package and module dependency graphs are stored as PR evidence.
- Public and internal consumers are enumerated.
- Old and new authorities, adapter, rollback, and removal gate are stated.

## A. Core public surface and layering

**Canonical tasks:** `R1`, `R8`, supported by `G1–G3`

### Problems

- The root barrel exposes a large fraction of Core and encourages broad imports.
- The `types` barrel exports implementation modules.
- The internal layer registry omits actual source areas;
- Event payloads depend on the complete mutable Context type;
- Core contains both singular `plugin/` infrastructure and plural `plugins/` feature implementations;
- `defaults` remains a broad compatibility barrel;
- Lower-level utilities import broad barrels and create hidden cycles.

### Planned slices

#### A1 — Generate a Core ownership inventory

Classify every Core source directory and public export as one of:

- kernel primitive;
- agent-domain contract;
- concrete runtime default;
- storage/repository implementation;
- coordination implementation;
- product feature;
- host/application concern;
- compatibility-only.

Generate consumers for each public subpath and root export. No export is moved until its consumer set is known.

**Exit:** every Core directory and public export has an owner classification and intended destination.

#### A2 — Make the layer model complete

Replace the partial hand-written layer list with a registry that covers all Core directories. Define explicit permitted runtime and type edges. Test every layer with the same engine.

**Exit:** an unclassified new Core directory fails CI; all current violations are either fixed or have owned, expiring exceptions.

#### A3 — Remove implementation exports from type barrels

Add a correct implementation subpath, migrate internal consumers, retain a deprecated compatibility export if externally required, and prohibit new runtime exports from `types` entrypoints.

**Exit:** `types` public paths emit no implementation imports at runtime.

#### A4 — Narrow event DTOs

Inventory consumers of events carrying `Context`. For each event family, define immutable DTOs containing required identifiers, state snapshots, or scalar fields. Services required by consumers are injected separately.

**Exit:** kernel event modules do not import the full mutable Context; event contract tests protect serialization and compatibility.

#### A5 — Ratchet root-barrel usage

Introduce public domain subpaths first. Migrate internal packages in small batches. Add a no-new-root-import rule before removing old exports.

**Exit:** root import count decreases monotonically and the root barrel is documented as compatibility-only or has a deliberately small stable surface.

## B. Core feature extraction candidates

Package names require ADR confirmation. The extraction order is based on cohesion and dependency risk.

### B1 — Built-in product plugins

Move auto-review, prompts, skills, Chimera, sync, and related feature plugins from `core/src/plugins` to `@wrongstack/plugins` or dedicated plugin packages. Keep plugin infrastructure in the singular Core plugin API only until the contract itself can become neutral.

Migration:

1. create manifest entries and lazy loaders;
2. re-export from old Core subpath for compatibility;
3. migrate CLI composition;
4. scan external/public consumers;
5. deprecate for at least one release;
6. remove Core feature implementations.

**Exit:** Core has no product plugin implementations and no plugin-specific external dependencies.

### B2 — Skills implementation

Separate skill contracts from GitHub download, installation, generation, filesystem, and marketplace behavior. Concrete behavior belongs in a skills implementation package or Runtime subsystem.

**Exit:** Core does not download or install skills; hosts consume a narrow skill service.

### B3 — HQ implementation

Retain neutral HQ DTOs only in the protocol authority. Move runtime/backend behavior to its own feature/runtime package and browser behavior to WebUI HQ.

**Exit:** Core has no HTTP/WS or host lifecycle ownership for HQ.

### B4 — Design execution workflow

The cohesive `design-*` execution cluster becomes an internal feature module or `@wrongstack/design`. Define its input/output contract before moving it.

**Exit:** generic execution does not know design-specific workflow steps.

### B5 — Management tools

Move fallback-management and similar application tools to Tools or a product plugin. Core may retain the underlying domain service contract.

**Exit:** Core does not register host-facing management tools.

## C. Runtime ownership pilot

**Canonical tasks:** `R4–R7`

### Pilot selection criteria

Choose one subsystem that:

- has a clear contract and at least two host consumers;
- currently has concrete defaults in Core;
- does not require simultaneous protocol or UI migration;
- has enough tests to compare change cost;
- can be rolled back without data migration.

Observability or a small storage repository is preferred. Memory is not the first pilot because it already has a separate high-risk migration.

### Pilot measurements

Record before and after:

- number and direction of workspace edges;
- host imports needed for composition;
- Core implementation LOC and exports;
- pass-through exports in Runtime;
- test setup complexity;
- number of consumers importing concrete classes;
- build and package size effects.

### Decision gate

Proceed with Runtime as concrete owner only if:

- no reverse workspace edge or cycle is introduced;
- host imports and test setup do not become more complex;
- Core loses concrete ownership rather than re-exporting it indefinitely;
- Runtime is not more than 50% pass-through for the pilot;
- the number of consumers coupled to concrete classes decreases.

Otherwise fold the Runtime facade and keep concrete owners in focused packages.

## D. Persistence and storage

**Canonical task:** `R2`

### Problems

- generic filesystem/atomic persistence is mixed with session, goal, prompt, memory, cloud-sync, and task repositories;
- storage facades expose domain behavior and compatibility paths;
- broad storage imports make repository replacement difficult.

### Target structure

```text
persistence primitive
  atomic write · locking · paths · serialization envelope · migration journal
          |
          +-- session repository
          +-- goal repository
          +-- prompt repository
          +-- memory repository
          +-- task repository
          +-- cloud-sync adapter
```

### Planned slices

1. Inventory persistence primitives and error dependencies. **Completed by R2.**
2. Break the errors/utils ownership problem with a lower-level package and thin host adapter. **Completed by R2.**
3. Define a dependency-free persistence interface and failure model. **Completed by R2.**
4. Pilot one repository without changing its on-disk format.
5. Add golden filesystem fixtures and fault-injection tests.
6. Migrate repositories individually.
7. Separate cloud synchronization from local persistence.
8. Reduce session-store to a repository facade or split read/write/migration responsibilities.

### R2 completion record

`packages/persistence` now owns the shared filesystem mechanics without any
workspace dependency. Core injects its existing structured `FsError` at the
adapter boundary; Kanban preserves its historical `FsError` export as an alias
of the neutral package error. Both adapters and the authority pass the same
adversarial contract suite. This slice deliberately does not move repository
formats, serialization envelopes, migrations, or cloud synchronization; those
remain incremental repository work after the ownership/runtime pilot.

### Data safety gates

- no format change in the same PR as ownership movement;
- existing data fixtures open in both old and new paths;
- interrupted writes and recovery are tested;
- migration is idempotent and journaled;
- rollback does not require data loss.

## E. Memory architecture

**Canonical task:** `R3`

### Problems

- legacy `MemoryStore` and `SageStore` contracts coexist;
- Runtime uses `as unknown as MemoryStore`;
- CLI and WebUI Server define independent duck-typed Super Memory detection;
- CLI memory command owns backend compatibility behavior;
- Super Memory store mixes commands, queries, indexing, migration, injection tracking, and persistence;
- injection tracking and turn-memory have a cycle.

### MemoryPort design

The port should expose use cases, not implementation identity checks:

- append/record memory;
- query/search with explicit options;
- retrieve by stable identity;
- update/delete where supported;
- session and project scoping;
- health/capability introspection;
- deterministic close/dispose;
- migration status through an administrative interface rather than normal reads.

Optional features use capabilities, not `instanceof` or `isSageStore`.

### Planned slices

#### E1 — Contract and conformance suite

Define `MemoryPort`, capability model, errors, and behavior fixtures. Run the suite against legacy and Super Memory adapters.

**Completed 2026-07-22.** Core owns `MemoryPort`, `MemoryCapability`, and lifecycle/health contracts. One conformance suite exercises SQLite, JSONL, and the legacy adapter.

#### E2 — Explicit legacy adapter

Wrap the legacy implementation behind `MemoryPort`. Keep conversion helpers inside the adapter package/module. Remove consumer-side backend detection incrementally.

**Completed 2026-07-22.** `LegacyMemoryPortAdapter` is the only supported bridge for historical or third-party `MemoryStore` implementations.

#### E3 — Runtime composition

Construct one `MemoryPort` implementation without unsafe casting. Hosts receive only the port and optional administrative capability interfaces.

**Completed 2026-07-22.** Runtime constructs `createSqliteMemoryPort(...)`; host wiring carries `MemoryPort` and requests typed optional capabilities.

#### E4 — Consumer migration

Migrate WebUI Server memory handlers, CLI slash memory, execution services, and other consumers one at a time. Delete local duck types after each migration.

**Completed 2026-07-22.** Runtime, CLI, TUI, and WebUI Server no longer identify a concrete backend or maintain local Super Memory duck types.

#### E5 — Split Super Memory internals

Target internal structure:

```text
sage/
  service.ts                 # MemoryPort facade
  commands/                  # write/update/delete orchestration
  queries/                   # retrieval and ranking
  index/                     # indexing and token/text normalization
  persistence/               # SQLite and transaction implementation
  migration/                 # legacy conversion and versioning
  injection/                 # prompt-injection tracking policy
  admin/                     # health, diagnostics, maintenance
```

Move shared text normalization out of turn-memory to break the injection cycle.

**Completed 2026-07-22.** The package has explicit port/lifecycle, JSONL and SQLite persistence/migration, graph, retrieval, shared normalization/index, middleware injection, anchors, embeddings, and tool adapter modules. Shared normalization is owned by `store-helpers.ts`, removing the middleware cycle. The two concrete backend classes remain compatibility implementations rather than host-facing facades; further compatibility export removal is an R8 concern.

#### E6 — Legacy retirement

After all consumers use the port, stop creating legacy stores by default. Keep the adapter for the documented release window, measure usage, then remove legacy Core memory implementation.

**Compatibility window started 2026-07-22.** Production composition no longer constructs legacy stores. Architecture tests reject new direct callers; export removal is deferred to R8 so it follows the published compatibility policy.

### Exit gate

- no unsafe cast between memory contracts;
- no consumer branches on concrete store identity;
- one conformance suite covers all supported adapters;
- migration code is isolated from normal request paths;
- Super Memory's facade coordinates services but does not implement every concern.

## F. Coordination and Director

**Canonical tasks:** `D1–D3`

### Problems

- coordination is a feature-sized subsystem inside Core;
- Director and director-tools have a runtime cycle through error classes;
- Director owns policies, assignment, leases, recovery, budget, tools, and orchestration;
- realistic multi-agent journeys are insufficient for safe splitting.

### Planned slices

1. Add deterministic journey tests for assignment, handoff, timeout, retry, cancellation, lease loss, budget exhaustion, recovery, and shutdown.
2. Extract Director error types and tool contracts to an implementation-independent coordination contract module.
3. Move tool registration/translation behind `DirectorToolPort`.
4. Extract assignment lifecycle state machine.
5. Extract lease and deadline policy.
6. Extract retry/recovery policy.
7. Extract budget/cost policy.
8. Adapt mailbox and fleet through ports.
9. Make Director an orchestration shell.
10. Evaluate physical `@wrongstack/coordination` extraction only after internal edges are one-way.

### Exit gate

- director-tools does not import Director implementation;
- policy modules are pure or depend only on narrow ports;
- journey tests prove ordering and failure behavior;
- Director has no persistence, transport, or presentation details.

## G. Kanban

### Problems

- `_internal.ts` is a large de facto domain service with a wide export surface;
- boards, dependencies, serialization, lifecycle, and internal helpers form a cycle;
- helpers call public board operations back, reversing dependency direction.

### Planned slices

1. Characterize board lifecycle, dependency validation, persistence, and concurrent mutation.
2. Classify all `_internal` exports as primitive, repository operation, domain rule, transaction helper, or compatibility function.
3. Move pure graph/dependency rules to a dependency-free module.
4. Introduce a board repository/transaction port.
5. Ensure serialization depends on DTOs, not board service functions.
6. Ensure lifecycle orchestrates repository and rules without being imported by them.
7. Leave a small internal compatibility facade temporarily.
8. Remove the facade after imports migrate.

### Target dependency flow

```text
manager facade -> lifecycle/application services
                 -> domain rules
                 -> repository port
                 -> serialization/persistence adapter
```

### Exit gate

No Kanban runtime SCC exists; `_internal` is deleted or reduced to a small, non-authoritative compatibility module.

## Workstream completion criteria

This workstream is complete when:

- Core contents match the accepted ownership inventory;
- Core layer checks cover every source area;
- Core event primitives do not depend on full mutable Context;
- Runtime has one settled role;
- persistence and memory use explicit ports;
- known Core, Director, Memory, and Kanban cycles are gone;
- product plugins, installers, HQ runtime, and management tools no longer live in Core;
- compatibility exports have tracked removal gates.
