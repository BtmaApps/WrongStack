# Maintainability Refactor Completion Report

> Archived on 2026-10-06. Claims, counts and test results below are historical
> evidence or proposals; they are not current checkout certification. Use the
> [maintained documentation](../../../README.md) and current source for runtime behavior.


**Date:** 2026-07-22
**Scope:** All production packages and applications except `website/`
**Result:** In-repository program complete
**External gate:** Physical removal of the published `@wrongstack/core` compatibility root remains scheduled for the next major release under ADR-004

## Outcome

The program replaced implicit root-barrel coupling with explicit domain ownership across the in-scope monorepo. Repository code no longer imports the `@wrongstack/core` root. Core remains available as a compatibility entrypoint only for external consumers during the documented deprecation window.

The final state is enforced rather than merely documented:

- the Core-root import ratchet is exactly zero;
- static, dynamic, side-effect, `require`, and type-query imports are scanned;
- non-command imports from CLI slash-command implementations are zero;
- runtime dependency cycles are zero;
- reviewed type-inclusive cycles remain registered and cannot silently expand;
- every test file belongs to a TypeScript test project;
- hotspot and import fan-out baselines are generated from the reviewed final tree;
- architecture health has no blocking error.

## Authority changes

### Core public boundaries

Consumers now depend on focused public owners rather than the compatibility root. The migration covers agent runtime, agent catalogs, coordination, design, execution, extensions, goals, hooks, HQ, infrastructure, models, notifications, observability, plugins, registries, replay, security, storage, tasking, tools, shared types, utilities, and worktrees.

New public subpaths added during close-out include `design`, `hooks`, and `replay`. Existing focused subpaths were expanded only when the symbol's ownership matched that boundary.

### Runtime

The Runtime pilot hit the documented kill criteria. Preserving Core compatibility after a physical observability move would have introduced a reverse workspace dependency and a pass-through facade. Runtime was folded to the implementations it actually owns instead of becoming a second Core authority.

### CLI and TUI

The CLI command host now reaches the slash-command catalog through one dedicated wiring bridge. Shared command-host adapters depend on the neutral dependency type exported by that bridge, so application composition no longer imports command implementations directly.

TUI and CLI Core imports use domain subpaths, including dynamic imports and type queries. Package-local Vitest aliases explicitly resolve the exceptional physical `core/agent` source layout without reintroducing root imports.

### Memory, persistence, and extensions

Memory consumers use `MemoryPort` capabilities. Legacy stores remain behind an explicit adapter. Plugin creation, replay, session persistence, design, and hook consumers use focused owners. Test doubles implement the same capability contracts instead of relying on accidental duck typing.

## Final measurements

| Measure | Final value |
|---|---:|
| In-scope workspace packages | 24 |
| Production source files | 2,104 |
| Test files | 1,789 |
| Core-root import files | 0 |
| Non-command slash imports | 0 |
| Runtime module cycles | 0 |
| Reviewed type-inclusive cycles | 15 |
| Tests without TypeScript project ownership | 0 |
| Tests owned by multiple TypeScript projects | 0 |

The Core-root ratchet started from a corrected 1,061-file baseline and was tightened after each package migration until it reached zero. It may not be raised to admit a new consumer.

## Verification evidence

| Gate | Result |
|---|---|
| Core build | pass |
| Tools typecheck/build | pass |
| TUI typecheck/build | pass |
| WebUI Server typecheck/build | pass |
| CLI typecheck/build | pass |
| Core + Tools + WebUI Server suites | 658 files; 9,956 passed; 7 reviewed skips |
| TUI full suite | 210 files; 3,380 passed |
| CLI full suite | 250 files passed, 2 skipped; 3,211 tests passed, 12 skipped |
| Core API snapshot | current; root ratchet 0 |
| Architecture health | pass; no blocking errors |

Package-specific evidence accumulated during migration remains in the canonical task graph. It covers Runtime, Super Memory, MCP, Telegram, LSP, WebUI, WebUI-HQ, Providers, Plugins, Tools, TUI, CLI, and WebUI Server.

## Release-gated residuals

### Published Core root

The root export remains solely for external compatibility. ADR-004 requires a deprecation window and next-major release before physical removal. Repository usage is zero and guarded, so publishing and later deleting that entrypoint is an external release operation rather than unfinished repository migration work.

### Type-inclusive cycles

Fifteen type-inclusive cycles remain. Each is visible in the architecture report and covered by a reviewed exception with ownership and a removal condition. Runtime cycles are zero. New members and stale exceptions fail the gate.

### Hotspots

Large files remain visible in the generated report and are protected by exact line and relative-import baselines. The completion claim concerns authority, dependency direction, composition, and enforced boundaries; it does not claim that every large cohesive implementation was split solely to satisfy a line-count target.

## Future change rules

1. Do not restore repository imports from `@wrongstack/core`.
2. Add or extend a focused subpath only when ownership is explicit.
3. Do not raise the zero root-import ratchet.
4. Route CLI command catalog access through the wiring bridge.
5. Update hotspot baselines only with reviewed responsibility or coupling evidence.
6. Remove the published Core root only through the ADR-004 next-major release procedure.
