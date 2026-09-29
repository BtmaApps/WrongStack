## Proven subsystem checks

- `packages/tools/src/project-kit/` — `KitProcessResult`/`KitRunRecord` additions must be `?: T | undefined` and be read only in the `finish()` resolve literal in `runner.ts`. A parent timestamp on `failure` while `resultReceived` stays `false` is intentional; flag only undeclared or non-optional fields that break existing literals.
- Same tree: read `catalog.ts` before alleging traversal or symlink escape — `assertKitId`/`KIT_ID` pre-validate names; `kitPath` rejects `..`/`.`/empty components, `\`, `:`, and symlinks per component. Re-check only for new unvalidated callers. If added files import siblings the bundle omits (`project-kit.ts` → `./project-kit/service.js`, `runner.js`), `glob` the directory and `read` them; report absence only if missing on disk.
- `packages/webui/src/types/sage.ts` — compare `Sage`↔`SageEntry` and `MemoryAnchor`↔`SageAnchor` property sets in both directions against `packages/sage/src/memory-model.ts` (guard: `packages/webui/tests/types/sage-type-contract.test.ts`). `kind: string` vs closed `SageKind` and optional canonical `sources` are deliberate widenings — never report.
- `packages/sage/src/sqlite-store-search.ts` — a new optional per-row field like `SearchHit.bm25` needs its backing array initialized on every branch; a `const x = rows.map(...)` living only in the FTS path makes plain results a TDZ `ReferenceError`. Cite the unconditional `const finalBm25 = ...` line as clean evidence.
- `.gitignore` wiring in `packages/tools/src/**` — read `packages/tools/src/codebase-index/gitignore.ts`: `loadGitignoreMatcher(root)` reads only the root `.gitignore` (no nested files, no `.git` requirement), returns `(relPath: string, isDir: boolean) => boolean`, with last-match-wins `!` plus trailing-slash dir-only rules. Confirm the enumerator's `require_git` before endorsing ripgrep parity.

## Evidence rules

- If `read` returns `[artifact middle omitted]`, head/tail are not coverage: re-issue ranges (`offset=1 limit=250`, then `offset=251`) until the changed region is seen. Never emit an all-clear banner or a Medium+ finding without a line read this session; if stopping early, name uncovered `file:line` ranges and return `completion: "partial"` with `{"findings": []}`.
- Before filing `noUnusedParameters`/`TS6133`, re-read the live signature — bundles can capture an intermediate `file.external.edit` state. Verify with `grep -n '^function <name>\|<paramName>' <file>` and cite the live line.

## Tests that pass vacuously

- A handler diff threading a flag (`failOnEmbeddingError`) into a store call in `packages/webui-server/src/server/http-server/*-handlers.ts`: run `grep <flagName> packages/<store-pkg>/src/*.ts` before judging — mocks in `packages/webui-server/tests/` pass either way. If cut off, log an unverified summary risk, not a finding.
- A test flipping state after `buildAgent(...)` (`ctx.meta.featureToolCoach = false`, `packages/core/tests/core/agent-malformed-retry.test.ts`): confirm `packages/core/src/core/agent-loop.ts` gates via `toolCoachEnabled = () => isToolCoachEnabled(a.ctx.meta, …)` — construction-time capture makes the test vacuous. Dot-access on the index signature is not a type error: `tsconfig.base.json` lacks `noPropertyAccessFromIndexSignature`.
- A test pinning build flags via `toContain` (`'--no-compile-autoload-dotenv'`, `packages/cli/tests/standalone-update.test.ts` → `scripts/build-binaries.mjs`): verify the literal's quote style, that it sits in live code, and that its array reaches `run('bun', args)`.
