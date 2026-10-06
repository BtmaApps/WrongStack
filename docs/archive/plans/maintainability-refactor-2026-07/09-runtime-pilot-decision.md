# Runtime subsystem pilot decision

> Archived on 2026-10-06. Claims, counts and test results below are historical
> evidence or proposals; they are not current checkout certification. Use the
> [maintained documentation](../../../README.md) and current source for runtime behavior.


- Date: 2026-07-22
- Canonical tasks: `R4`, `R5`, `R7`
- Scope: production packages and applications except `website/`
- Pilot subsystem: metrics and health
- Decision: stop the concrete-owner migration and fold the pass-through facade

## Question

Can `@wrongstack/runtime` become the concrete owner of metrics sinks, health
checks, event-to-metric bridging, Prometheus rendering/server behavior, and
OTLP metric export without worsening the package graph or compatibility cost?

## Baseline

The complete implementation is 706 physical lines in Core:

| Module | Lines |
|---|---:|
| `observability/metrics.ts` | 149 |
| `observability/health.ts` | 60 |
| `observability/event-bridge.ts` | 68 |
| `observability/prometheus.ts` | 211 |
| `observability/otlp-metrics.ts` | 218 |

Core owns the erased observability contracts. The only non-test production
composition consumer of the concrete pilot symbols is CLI metrics wiring.
Runtime already has a declared dependency on Core and multiple runtime imports
from Core in its container, host, vision, clipboard, probe, pack, tool
registration, and fleet composition modules.

Before the decision, Runtime root also re-exported the entire Core defaults
barrel plus three Core concrete classes. Those exports had no discovered
production consumer outside Runtime and were pure pass-through ownership.

## Feasibility result

A physical move to Runtime has only three compatibility choices:

1. Core statically re-exports Runtime: creates the forbidden
   `Core -> Runtime -> Core` workspace cycle.
2. Core retains a second implementation: violates the single-authority gate.
3. Core removes the compatibility surface immediately: violates ADR-004's
   measured deprecation window for a published API.

Moving the subsystem to another lower-level package could avoid the cycle, but
that package—not Runtime—would be the concrete authority. Runtime would again
be a pass-through facade, which is the condition this pilot is meant to test.

The pilot therefore hits two ADR-004 kill criteria before a safe production
move can be made: a required reverse workspace edge and a compatibility surface
that would be entirely pass-through. Performing a temporary code move would
add churn without producing a mergeable ownership state.

## Decision and implemented fold

The `R5` kill branch is selected. Metrics and health stay in Core's focused
observability subpath with contracts in Core types. Runtime no longer claims
ownership of Core defaults: its root pass-through exports are removed. Runtime
continues as the truthful owner of host composition and platform adapters that
are physically implemented in the package.

This is rollback-safe: no data, wire format, runtime behavior, or concrete
observability import changes. A downstream source import that relied on the
undocumented Runtime pass-through must use the declared Core owner instead.

## Gate evidence

The decision is accepted only when:

- Runtime source typecheck and package build pass;
- Runtime subpath/package smoke tests pass;
- CLI metrics behavior tests remain green against the canonical Core owner;
- the Core public API snapshot is current;
- workspace and runtime module graphs remain acyclic;
- Runtime root contains no Core re-export.

## Consequence for R6 and R8

`R6` is not executed because the pilot did not pass. `R8` may retire other
compatibility exports only from evidence-backed zero-usage sets; it must not
reintroduce Runtime as a blanket defaults barrel.
