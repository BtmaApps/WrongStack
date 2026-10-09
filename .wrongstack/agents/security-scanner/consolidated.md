# Security Scanner Instructions

## Review Discipline

- Before applying a suggested fix in a cascade, re-read the flagged file and check `git diff HEAD` — a parallel worker may have already landed the remediation after the review snapshot; confirm against the live tree and fix only what remains.
- When a new shared module is intended to replace hand-duplicated security lists, verify the additions actually reached the live lists. Duplicated basename regexes exist at `packages/core/src/security/permission-helpers.ts` and `packages/core/src/security/yolo-state-risk.ts`; compare them against the new module for missing entries and for the lingering "keep in sync" comment the refactor was meant to delete.
- Before reporting an authorisation gap in a new security module, verify the live enforcement predicates independently — grep the module's own filename to detect zero-importer dead code; a doc comment claiming "shared by X and Y" is evidence to check, not evidence.

## Gate Narrowing and Coverage

- When a security gate narrows from a broad containment check (e.g. `isInsideAgentStateRoot` over the whole root in `packages/core/src/security/permission-helpers.ts`) to a name/subtree classifier, enumerate the credential filenames the codebase actually writes — grep `packages/persistence/src/file-permissions.ts`, `packages/persistence/src/ipc-endpoint-secret.ts`, and `packages/core/src/hq/auth-store.ts` for secret paths — and assert each against the new predicate. Names like `ipc-endpoint.secret` and `runtime.json` carry no obvious secret word and are the most likely to be missed.
- Treat a passing security test as missing coverage when the gate it covers was narrowed: fixtures pinning both halves of a new predicate (e.g. `packages/core/tests/security/agent-state-sensitivity.test.ts`) do not prove the write gate still covers credential filenames the new list forgot. Confirm each pre-existing fixture still exercises a distinct rule and add cases for paths that lost coverage.

## Fail-Closed Ordering

- When introducing an allow-everything mode that must not outrank user refusals, fail closed on rules that could not be evaluated — in `packages/core/src/security/permission-policy.ts`, the `denyUnevaluated` refusal before the YOLO+ auto-allow keeps a broad switch from silently outranking a rule the user wrote.
- When a guard is reordered relative to evidence collection, verify the new order records evidence before throwing rather than discarding it, and confirm the caller still converts the throw into a block decision — a `throw new SecretScanTimeoutError(...)` inside `scanWindow` is only safe while `buildHook`'s `catch` maps it to `decision: 'block'`.
- When an explain/diagnostic function gains a lockdown guard, verify it against the real enforcement predicate rather than the explanatory comment, and confirm the guard was applied only to the allow path — session denies in `explainPermissionTrace` must stay unconditional to match "Denies still are" under `--restricted`.

## Secret Caching and Fallback

- Always distinguish a *transient* read failure from a *definitive* absence when a secret gates a value, and never cache the transient case — in `packages/persistence/src/ipc-endpoint-secret.ts` the tri-state `string | null | undefined` return from `readSecret` makes this possible, where `undefined` means "retry" and `null` means "absent, remember it." Callers that memoize once at process start turn any transient failure into a permanent one; use a bounded retry plus an explicit `if (secret !== undefined)` guard before caching.
- Test secret-fallback code with both a *recovered* and an *exhausted* failure — in `packages/persistence/tests/ipc-secret-transient-read.test.ts` the regression is a process that quietly latches a less-secure value, so a test that only asserts the successful retry never proves the non-caching guard still holds.
- Always confirm that a security-gate block reason built from accumulated scan state carries only pattern type ids (`patternTypeForGroups` output in `packages/plugins/src/secret-scanner/`) and never the matched substring — a shared `found: Set<string>` accumulates across all windows in `findMatches`, so any reason string derived from it discloses which credential classes a pending write contains even though no secret value leaks.