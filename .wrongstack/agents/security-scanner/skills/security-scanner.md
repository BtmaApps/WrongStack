## Gate narrowing
- When `isInsideAgentStateRoot` containment is replaced by a name/subtree classifier in `packages/core/src/security/agent-state-sensitivity.ts`, enumerate the credential filenames the codebase actually writes rather than trusting the classifier list: grep `packages/persistence/src/file-permissions.ts`, `packages/persistence/src/ipc-endpoint-secret.ts`, and `packages/core/src/hq/auth-store.ts` for secret paths and assert each against the new predicate. `ipc-endpoint.secret` and `runtime.json` are easy misses because they carry no obvious secret name. [applied 9×, 9 ok]
- Treat a green run after narrowing as missing coverage, not evidence: verify each fixture in `tests/security/yolo-risk-state-root.test.ts` and `packages/core/tests/security/agent-state-sensitivity.test.ts` still exercises a distinct rule, then add cases for dropped paths. [applied 3×, 3 ok]
- Before reporting a weakening in a narrower path-regex leaf module, verify the live predicate: `isInsideAgentStateRoot` in `packages/core/src/security/permission-helpers.ts` gates the whole global root with a realpath pass. Grep the module filename for zero importers; treat a doc comment claiming "shared by X and Y" as a claim to check, not evidence. [applied 8×, 8 ok]

## Refactor sync
- When a shared module replaces hand-duplicated security lists, diff the live copies at `packages/core/src/security/permission-helpers.ts:450` and `packages/core/src/security/yolo-state-risk.ts:14` against it for missing entries, and confirm the lingering "keep in sync" comment is gone. [applied 7×, 7 ok]

## Secret reads
- Treat `readSecret` in `packages/persistence/src/ipc-endpoint-secret.ts` as tri-state `string | null | undefined`: `undefined` means transient, so retry with a bound and guard caching with explicit `if (secret !== undefined)`; `null` means absent and may be cached. Never memoize a derived value once at process start.
- Test both failover outcomes as in `packages/persistence/tests/ipc-secret-transient-read.test.ts`: a recovered retry and an exhausted fallback. Asserting only successful retry never proves the non-caching guard.

## Scan-state hygiene
- Build security-gate block reasons from accumulated scan state using only `patternTypeForGroups` output in `packages/plugins/src/secret-scanner/`, never matched substrings: the shared `found: Set<string>` in `findMatches` accumulates across windows and would disclose credential classes.
- If a guard is reordered ahead of evidence collection in a fail-closed gate, verify evidence is recorded before `throw new SecretScanTimeoutError(...)` inside `scanWindow`, and that `buildHook`'s `catch` still maps it to `decision: 'block'`.

## Explain-path guards
- Give new lockdown guards in `explainPermissionTrace` an allow-path-only placement, verified against the real predicate in `packages/core/src/security/permission-policy.ts`; session denies must stay unconditional to match "Denies still are" under `--restricted`.
