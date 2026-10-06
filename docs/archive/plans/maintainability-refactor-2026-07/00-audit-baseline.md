# Audit Baseline

> Archived on 2026-10-06. Claims, counts and test results below are historical
> evidence or proposals; they are not current checkout certification. Use the
> [maintained documentation](../../../README.md) and current source for runtime behavior.


**Evidence date:** 2026-07-21<br>
**Nature:** Point-in-time working-tree audit; regenerate measurements before using them as acceptance thresholds

> The original audit measured Website sources. The implementation program excludes `website/` by the 2026-07-21 scope decision; Website rows below are retained only to preserve the audit evidence.

## Scope and method

The audit covered production TypeScript/JavaScript sources under packages, applications, and website sources. It combined:

- source-file and line-count inventory;
- large-file and responsibility-hotspot analysis;
- package and relative-import analysis;
- root-barrel and public-export inspection;
- approximate module strongly connected component detection;
- manual verification of suspected runtime cycles;
- compatibility, duplication, TODO, legacy, cast, and mirror markers;
- package manifest and workspace dependency inspection;
- architecture-test inspection and targeted execution.

The measurements are diagnostic, not permanent targets. The architecture inventory task must replace them with generated evidence.

## Repository scale

| Measure | Observed value |
|---|---:|
| Production source files | 2,001 |
| Production source lines | approximately 574,204 |
| Files over 350 lines | 495 |
| Files over 500 lines | 306 |
| Files over 800 lines | 118 |
| Files over 1,000 lines | 73 |
| Files over 1,500 lines | 32 |
| Files over 2,000 lines | 14 |

The 350-line threshold is currently advisory. `scripts/check-file-size.mjs` reports growth but does not fail CI. The hotspot architecture test covers only a small hand-maintained subset and includes temporary raised ceilings.

## Package-level concentration

| Area | Source files | Approx. source lines | Files >= 500 | Primary risk |
|---|---:|---:|---:|---|
| Core | 465 | 124,608 | 67 | Product features and implementations accumulated in the foundation |
| CLI | 299 | 89,360 | 47 | Composition, host behavior, commands, and backend behavior mixed together |
| WebUI | 300 | 86,512 | 51 | Protocol authority, domain state, and rendering mixed together |
| TUI | 161 | 53,663 | 23 | Root component and reducer centralize most behavior |
| Tools | 116 | 34,881 | 20 | Static central registration and several feature-sized tools |
| Plugins | 69 | 32,444 | 28 | Manual metadata and eager catalog imports |
| Website | 77 | 31,244 | 16 | Hand-maintained, giant content registries |
| WebUI Server | 88 | 24,307 | 15 | Intended authority but still duplicated by CLI backend |
| Super Memory | 19 | 9,950 | 5 | God store plus legacy compatibility behavior |
| Providers | 47 | 9,744 | — | Provider facts duplicated across surfaces |
| WebUI HQ | 44 | 9,118 | — | Competes with CLI inline dashboard ownership |
| ACP | 27 | 8,455 | — | Compatibility cycle and large protocol implementations |
| SimpleUI | 54 | 8,266 | — | Duplicate semantic state and direct app/component cycle |
| Techstack | 37 | 7,707 | — | Mostly cohesive; one invalid-context compatibility pattern |
| Desktop | 30 | 7,643 | — | Host shell owns runtime/process responsibilities |
| MCP | 23 | 7,612 | — | Cohesive but registry and transport hotspots are growing |
| SDD | 26 | 6,980 | — | Successful extraction with remaining orchestration hotspot |
| Kanban | 17 | 5,836 | — | Internal god module and a multi-module runtime cycle |
| Telegram | 20 | 4,302 | — | Good package boundary; one shared redaction opportunity |
| Plug-LSP | 41 | 3,909 | — | Good plugin boundary; command module can be reduced later |
| Bench | 22 | 3,440 | — | Low-risk, cohesive support package |
| Security Scanner | 10 | 2,644 | — | Real implementation is not wired into production composition |
| Runtime | 8 | 1,540 | — | Transitional facade rather than settled ownership boundary |
| App wrapper | — | 15 | — | Correctly thin |

## Highest-risk hotspots

| File or subsystem | Observed condition | Refactor interpretation |
|---|---|---|
| `packages/tui/src/app.tsx` | 7,672 lines, 117 relative imports, 57 effects | Product shell, controller, state bridge, and workflows are one component |
| `packages/sage/src/store.ts` | 3,772 lines | Commands, queries, indexing, migration, injection tracking, and persistence are one store |
| `packages/webui/src/types.ts` | 3,004 lines | Wire protocol, UI models, and domain types share one authority |
| `packages/cli/src/cli-main.ts` | 2,643 lines | Bootstrap, lifecycle, dispatch, surfaces, and shutdown remain coupled |
| `packages/tui/src/app-reducer.ts` | 2,533 lines and hundreds of cases | State domains and view-component models are coupled |
| `packages/core/src/coordination/director.ts` | 2,362 lines | Assignment, policies, lifecycle, tools, recovery, and budget behavior share one class |
| `packages/core/src/coordination/director-tools.ts` | 2,013 lines | Tool contracts depend back on Director implementation errors |
| `packages/core/src/storage/session-store.ts` | 1,856 lines | Persistence facade and session-domain behavior are combined |
| `packages/cli/src/slash-commands/memory.ts` | 1,798 lines | CLI command owns legacy/sage compatibility and domain behavior |
| `packages/cli/src/execution.ts` | 1,793 lines | Execution orchestration remains in host layer |

## Verified architecture failure modes

### 1. Core is not a minimal foundation

Core contains coordination, storage, HQ, skills, goals, chronicle, built-in product plugins, design execution, and management tools. Its root barrel exports a broad implementation surface. The `types` barrel also re-exports an implementation from storage. Core has a workspace dependency on Kanban, which confirms that it is already above a product package rather than purely below the system.

### 2. Architecture checks have blind spots

The declared internal layer list excludes real directories including goals, HQ, hooks, prompts, built-in plugins, notifications, tasking, tools, worktree, and chronicle. General violation detection is not applied to all declared layers. The cycle check excludes type-only relationships, and the file-size script is non-blocking.

Targeted architecture tests passed on the audited tree, but this does not prove that the declared layer model matches the actual dependency graph.

### 3. Runtime and compatibility cycles exist

Manually confirmed examples include:

- Core errors importing the broad utils barrel, whose exports import the error classes back;
- Director importing director-tools while director-tools imports Director error classes;
- Kanban boards, dependency, serialization, lifecycle, and `_internal` modules importing one another;
- ACP runner re-exporting its caller for API compatibility;
- Super Memory injection tracking importing turn-memory utilities while turn-memory owns an InjectionTracker;
- SimpleUI model-switcher importing an application helper while the application imports the model-switcher;
- WebUI slash routing importing a CommandPalette facade that imports slash routing;
- fallback-model and fallback-profile-manager importing one another.

### 4. Cross-surface authorities are duplicated

- WebSocket messages are represented independently in CLI, WebUI Server, and WebUI.
- Embedded CLI WebUI handling mirrors the standalone WebUI Server.
- provider facts are copied into Core, Providers, CLI, WebUI, and WebUI Server;
- plugin metadata is copied into package exports, a catalog, CLI factories, and audit lists;
- HQ has both an inline CLI dashboard implementation and a dedicated WebUI HQ surface;
- SimpleUI and WebUI repeat semantic connection and model-selection behavior.

### 5. Compatibility has become architecture

Examples include unsafe `unknown` casts between Super Memory and legacy memory, local duck-typed memory interfaces, source aliases from WebUI into sibling package source files, browser shims for Core utilities, explicit compatibility re-exports, local metadata mirrors, and a no-op security plugin standing in for an unwired implementation package.

## Risk ranking

### P0 — Must precede broad movement

1. Complete architecture and verification visibility.
2. Establish neutral surface protocol authority.
3. Establish one `MemoryPort` without unsafe casts.
4. Make WebUI Server the sole backend authority.
5. Establish plugin and provider metadata authorities.
6. Characterize TUI, CLI, and Director behavior before splitting.

### P1 — Structural extraction and hotspot work

1. Core/Runtime ownership pilot.
2. Core coordination and storage decomposition.
3. TUI feature slices and shell reduction.
4. CLI phase composition and slash-command service extraction.
5. Super Memory service split.
6. Security Scanner production composition.
7. Kanban cycle and `_internal` decomposition.

### P2 — Consolidation and lower-risk cleanup

1. ACP compatibility entrypoint isolation.
2. SimpleUI projection cutover.
3. Desktop process-management extraction.
4. Tools manifest and feature-pack registration.
5. Website content generation.
6. Shared redaction and local utility cleanup.

## Baseline cautions

- Do not compare future measurements to old reports without regenerating both with the same rules.
- Do not treat package DAG acyclicity as proof of module-level acyclicity.
- Do not count barrels, adapters, or forwarding wrappers as successful decomposition.
- Do not make line count the sole acceptance criterion.
- Re-run usage scans before every removal because the working tree is active and concurrent changes are expected.
