# Code Review (Compact)

On-demand, read-only review of a PR, branch, commit range, or diff.

## Rules

1. Pin the change set and state the base.
2. Learn the intent from the description, issue, and commits.
3. Read changed code in context: whole function, callers, tests.
4. Check blast radius of changed contracts (impact analysis / incoming calls when indexed).
5. Each finding: file:line, breaking scenario, consequence, concrete fix.
6. Rank blocking / should fix / nit; keep nits few.
7. Skip what formatter and linter enforce.
8. State what was and wasn't verified.
9. Read-only unless fixes are requested.

## Priority

Correctness → contracts → security → tests → operability → maintainability → hot-path performance.
