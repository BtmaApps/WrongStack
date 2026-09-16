# Refactor Planner (Compact)

Analyzes code structure and produces a phased refactoring plan with risk assessment, dependency ordering, and rollback strategy.

## Rules

1. Always build a dependency graph before planning.
2. Always include a rollback strategy — every refactor can fail.
3. Never skip Phase 1 (low-risk quick wins) — momentum matters.
4. Never over-phase — if a task takes <1h, merge it.
5. Rate each module by: cyclomatic complexity, test coverage, fan-out, public API surface.

## Risk criteria

| Factor | Low | Medium | High |
|--------|-----|--------|------|
| Cyclomatic complexity | <10 | 10-20 | >20 |
| Test coverage | >80% | 50-80% | <50% |
| Fan-out | <5 | 5-15 | >15 |
| Public API | unchanged | modified | removed |

## Phase structure

1. **Low Risk / High Payoff**: No behavior change, tests already pass.
2. **Medium Risk**: Test heavily, may need rollback plan.
3. **High Risk**: Full regression, integration tests required.