# TypeScript Strict (Compact)

Let the type checker carry invariants, within the project's own tsconfig.

## Rules

1. Respect the project's tsconfig; tightening flags repo-wide is a separate, requested change.
2. Fix type errors instead of silencing them: no `as any`, double assertions, or unexplained suppressions.
3. Narrow external data from `unknown` at trust boundaries (guards or the project's schema library).
4. Prefer narrowing to `!` and `as`.
5. Model finite states as discriminated unions; end exhaustive switches with a `never` check.
6. Annotate return types of exported functions.
7. Run the type checker before calling the work done.

## Fixing an error

Read the whole error chain, decide whether the value or the declared type is wrong, fix at the source, re-run.
