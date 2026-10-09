## Gate narrowing
- When replacing root-wide containment in `packages/core/src/security/agent-state-sensitivity.ts` with a name/subtree classifier, enumerate the credential filenames actually written—grep `packages/persistence/src/file-permissions.ts`, `packages/persistence/src/ipc-endpoint-secret.ts`, and `packages/core/src/hq/auth-store.ts`—and assert each against the new predicate; `ipc-endpoint.secret` and `runtime.json` carry no obvious secret word and are the likeliest misses. [applied 9×, 9 ok]
- After such a narrowing, treat a green run as missing coverage: confirm the fixtures in `tests/security/yolo-risk-state-root.test.ts` and `packages/core/tests/security/agent-state-sensitivity.test.ts` still exercise distinct rules, then add cases for dropped paths. [applied 3×, 3 ok]

## Live-predicate checks
- Before reporting an authorisation gap in a narrower leaf module, verify the live enforcement predicate—`isInsideAgentStateRoot` in `packages/core/src/security/permission-helpers.ts` gates the whole global root via realpath. Grep the module filename for zero importers; a doc comment claiming "shared by X and Y" is a claim to check, not evidence. [applied 8×, 8 ok]
- When a shared module replaces hand-duplicated security lists, diff the live copies at `packages/core/src/security/permission-helpers.ts:450` and `packages/core/src/security/yolo-state-risk.ts:14` against it for missing entries, and confirm the lingering "keep in sync" comment is gone. [applied 7×, 7 ok]

## Secret reads
- Treat `readSecret` in `packages/persistence/src/ipc-endpoint-secret.ts` as tri-state `string | null | undefined`: `undefined` is transient—retry with a bound and guard caching with explicit `if (secret !== undefined)`; `null` is absent and may be cached. Never memoize a derived value once at process start.
- Test both failover outcomes as in `packages/persistence/tests/ipc-secret-transient-read.test.ts`: a recovered retry and an exhausted fallback; asserting only successful retry never proves the non-caching guard.

## Scan-state and gate hygiene
- Build block reasons from accumulated scan state using only `patternTypeForGroups` output in `packages/plugins/src/secret-scanner/`, never matched substrings—the shared `found: Set<string>` in `findMatches` accumulates across windows and would disclose credential classes.
- If a guard moves ahead of evidence collection in a fail-closed gate, verify evidence is recorded before `throw new SecretScanTimeoutError(...)` inside `scanWindow`, and that `buildHook`'s `catch` still maps it to `decision: 'block'`.

## Explain-path guards
- Placement-only on the allow path in `explainPermissionTrace`, verified against the real predicate in `packages/core/src/security/permission-policy.ts`; session denies must stay unconditional to match "Denies still are" under `--restricted`.
