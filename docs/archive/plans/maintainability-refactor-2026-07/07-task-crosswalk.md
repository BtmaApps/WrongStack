# Task Crosswalk and Execution Index

> Archived on 2026-10-06. Claims, counts and test results below are historical
> evidence or proposals; they are not current checkout certification. Use the
> [maintained documentation](../../../README.md) and current source for runtime behavior.


## Purpose

This document maps the July 21 audit findings and detailed playbook sections to the canonical task graph. It does not carry task status. Status, hard dependencies, and completion evidence remain in [`../architecture-refactor-task-graph-2026-07.md`](../architecture-refactor-task-graph-2026-07.md).

## Canonical task crosswalk

| Audit finding | Canonical task(s) | Detailed plan | Primary completion evidence |
|---|---|---|---|
| Incomplete architecture layer coverage | `V1`, `G1` | Core A1–A2; Verification §§1–2 | Generated complete source/layer registry |
| Runtime and type module cycles hidden | `G1`, `G3` | Core A2; Verification §§1–3 | SCC report with no unowned cycle |
| Advisory-only file-size guard | `G2` | Roadmap Wave 0; Verification §4 | No-growth coupling/size ratchet |
| Temporary limits and allowlists lack expiry | `G3` | Verification §3 | Owner/expiry/removal schema enforced |
| Core root export sprawl | `R1`, `R8` | Core A1, A3, A5 | Consumer inventory and root-import ratchet |
| Core event payloads depend on full Context | `R1` | Target event boundaries; Core A4 | Narrow immutable event DTOs |
| Product plugins inside Core | `M2`, `R6`, `R8` | Core B1; Platform B | Implementations owned by plugin authority |
| Skills installer/generator inside Core | `R1`, `R4–R8` | Core B2 | Concrete skills service outside Core |
| HQ implementation inside Core/multiple surfaces | `P5`, `R6`, `R8` | Core B3; Surfaces F | One HQ frontend and correct runtime owner |
| Design workflow inside generic execution | `R1`, `R4–R8` | Core B4 | Feature-owned workflow contract/implementation |
| Application management tools inside Core | `M3`, `R6`, `R8` | Core B5; Platform C | Tool/plugin-owned implementations |
| Runtime is a transitional facade | `R4–R7` | Core C | Measured pilot decision and implemented outcome |
| Storage primitives mixed with domain repositories | `R2`, `R4–R8` | Core D | Persistence port and repository migrations |
| Legacy and Super Memory contracts coexist | `R3`, `R8` | Core E | One MemoryPort and conformance suite |
| Unsafe memory cast and local duck types | `R3` | Core E2–E4 | No casts or concrete identity checks |
| Super Memory god store and internal cycle | `R3`, `G2` | Core E5 | Command/query/index/migration/persistence split |
| Director/tool runtime cycle and mixed policies | `D1–D3` | Core F | Journey coverage and orchestration shell |
| CLI slash context/type SCC | `C2`, `C3` | Surfaces A2–A3 | Narrow command capability contracts |
| CLI god composition and shutdown | `C1–C3`, `L1` | Surfaces A1, A4–A6 | Explicit phases and deterministic disposal |
| Duplicate CLI and WebUI Server backend | `P1–P4`, `C3` | Surfaces B | One canonical dispatcher/backend |
| Duplicate surface message unions | `P1` | Target protocol; Surfaces B/D/E/G | Versioned protocol and decoders |
| TUI god component/reducer | `T1–T3`, `G2` | Surfaces C | Feature slices and thin root shell |
| TUI state imports view models | `T2`, `T3` | Surfaces C5 | View-independent action/state types |
| WebUI source aliases and browser shim | `P1`, `R1` | Surfaces D | Declared browser-safe exports only |
| WebUI component hotspots | `P2`, `G2` | Surfaces D | Controller/model/view seams |
| SimpleUI semantic duplication and cycle | `P2`, `P6` | Surfaces E | Shared projections and thin renderer |
| CLI inline HQ and WebUI HQ overlap | `P5` | Surfaces F | One featureful HQ frontend |
| Desktop owns backend/runtime semantics | `P4`, `S3` | Surfaces G | Thin native host and trusted IPC |
| Provider facts duplicated | `M1` | Platform A | ProviderDefinition projections |
| Plugin metadata duplicated/eager imports | `L1`, `L2`, `M2` | Platform B | Data-only manifests and lazy loading |
| Tool catalogs and packs centralized | `M3` | Platform C | ToolDefinition-driven registration |
| ACP compatibility cycle and trust boundary | `S1`, `S2`, `M4` | Platform D | Canonical entrypoints and trusted execution |
| Security Scanner orphan/no-op plugin | `M5` | Platform G | Real production route or intentional removal |
| Privileged surface policy drift | `S1–S3` | Target contracts; Surfaces B/G; Platform D | Shared capability decision seam |
| Legacy persisted secret exposure | `S4` | Verification behavioral/data gates | Scrubbed read/replay path |

## Follow-on slices not yet represented by a dedicated canonical node

These slices are required by the audit but must not silently become a second backlog. Before implementation, either attach each slice to the nearest active canonical task with explicit scope or add a reviewed node to the canonical graph.

| Follow-on ID | Scope | Proposed graph relationship | Entry gate | Exit gate |
|---|---|---|---|---|
| `F-KANBAN-1` | Break Kanban module cycle | Follow `G1/G3`; may run beside `R2` | SCC report and Kanban behavior fixtures | No Kanban runtime SCC |
| `F-KANBAN-2` | Decompose `_internal` | After `F-KANBAN-1` | Repository/domain boundaries agreed | `_internal` removed or non-authoritative |
| `F-MCP-1` | Separate registry persistence, transport, auth | After `V4`; coordinate with `P3` | MCP contract/lifecycle tests | One-way internal dependencies |
| `F-SDD-1` | Split parallel-run orchestration | After `V4`, protected by `G2` | Scheduler journeys | Explicit scheduler/dispatch/supervisor seams |
| `F-TECH-1` | Remove fake Context cast | Can run after `V2` | Headless research characterization | Narrow dependency and no sentinel cast |
| `F-TELEGRAM-1` | Unify redaction and lifecycle | After `L1` | Redaction parity fixtures | Correct shared utility and disposal |
| `F-LSP-1` | Plugin lifecycle and command split | After `L1/M2` | Plugin smoke and command tests | Manifest/lifecycle adopted |
| `F-BENCH-1` | Public-API-only benchmark consumers | After package moves begin | Benchmark baseline | No internal/source-alias imports |
| `F-APP-1` | Protect thin app wrapper | After `G1` | Architecture rule available | Wrapper remains entrypoint-only |

## Execution packet template

Before a canonical task or follow-on slice begins, create or link an execution packet containing:

```markdown
# <Task ID> — <Outcome>

## Scope
- In scope:
- Out of scope:
- Files/packages expected to change:

## Authority change
- Old authority:
- New authority:
- Compatibility adapter:
- Consumer migrated in this slice:

## Dependencies
- Canonical hard dependencies:
- Supporting tasks:
- Concurrent file-ownership conflicts:

## Characterization
- Existing behavior tests:
- New fixtures/journeys required:
- Expected/discovered/executed test counts:

## Implementation steps
1.
2.
3.

## Rollback
- Switch/revert boundary:
- Data compatibility:
- Cleanup/disposal:

## Exit gate
- Behavior:
- Architecture:
- Packaging:
- Usage scan:

## Removal follow-up
- Deprecated path:
- Review/removal release:
- Owner:
```

## Suggested delivery batches

### Batch A — Evidence and smallest cycle removal

- `V1`, `G1`, `G2`, `G3` foundations;
- complete Core layer classification;
- SCC reporting;
- direct-import fix for Core errors/utils;
- SimpleUI helper extraction;
- Super Memory text-normalization extraction;
- fallback model parser extraction;
- ACP compatibility wrapper direction.

These cycle fixes are small enough to validate the new architecture gates without beginning broad package movement.

### Batch B — Contract authorities

- `P1` protocol package and fixtures;
- `R3` MemoryPort and adapters;
- `M1` ProviderDefinition pilot;
- `M2` PluginManifest pilot;
- `L1` disposable host handle.

### Batch C — First consumer cutovers

- WebUI Server handshake/read-only handlers;
- one provider across CLI/WebUI/server projections;
- one plugin through data-only lazy manifest;
- Runtime memory composition without unsafe cast;
- CLI memory command consuming MemoryPort.

### Batch D — Behavioral shell decomposition

- TUI journey and input seam;
- CLI boot/dispatch journeys and command context split;
- Director journeys and error/tool contract extraction.

### Batch E — Authority retirement

- embedded CLI WebUI handler deletion after parity;
- manual provider/plugin list deletion;
- no-op security plugin replacement/removal;
- inline HQ application retirement;
- Core feature implementation moves.

### Batch F — Foundation close and follow-on packages

- Runtime pilot decision and migrations;
- persistence and Super Memory decomposition;
- Kanban internals;
- MCP/SDD/Desktop consolidation;
- documentation and architecture-reference refresh;
- compatibility export retirement.

## Final audit checklist

At program close, verify every production area explicitly:

- [ ] Core
- [ ] Runtime
- [ ] Storage and persistence
- [ ] Coordination and Director
- [ ] Super Memory
- [ ] Kanban
- [ ] CLI
- [ ] TUI
- [ ] WebUI
- [ ] WebUI Server
- [ ] WebUI HQ
- [ ] SimpleUI
- [ ] Desktop
- [ ] app wrapper
- [ ] Providers
- [ ] Plugins
- [ ] Tools
- [ ] ACP
- [ ] MCP
- [ ] SDD
- [ ] Security Scanner
- [ ] Techstack
- [ ] Telegram
- [ ] Plug-LSP
- [x] Website — explicitly out of implementation scope; no refactor changes required
- [ ] Bench

For each checked item, link the current architecture report, relevant task evidence, remaining exceptions, and any public compatibility commitment.
