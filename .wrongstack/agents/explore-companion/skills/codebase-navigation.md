## Orientation

- For vague leader todos such as “final diff review, round report” or “Discover/map fresh surfaces,” run an mtime-descending `glob` over `packages/**/src/**` and `packages/**/tests/**`; use `codebase-skeleton` on the freshest 3–4 production files and matching `tests/` cluster.
- When an active proof-driven-bug-hunter round is expected, `tree` `.temp_files/proof-driven-bug-hunter/` directly. Do not trust `glob '.temp_files/**'` to prove absence because ignore rules can suppress traversal.

## Consumer Closure

- Do not pass filename stems such as `secret-scrubber-patterns` to `codebase-impact-analysis`; `symbolFound=false` is expected. For unbarreled data modules such as `packages/core/src/security/secret-scrubber-patterns.ts`, combine `codebase-incoming-calls` on exported symbols such as `PATTERNS` with repo-wide module-path grep `secret-scrubber-patterns(\.js)?`.
- For small domain modules, combine a module-path grep such as `./vibe(\.js)?["']` with a symbol-name grep. Barrel exports from `packages/requirement-intake/src/index.ts` can hide external consumers importing `@wrongstack/requirement-intake`.
- Before describing gateway crypto imports as local, run `codebase-search` for `timingSafeTokenEqual`; `packages/primitives/src/timing-safe.ts` is the canonical constant-time comparison seam.
- Treat `packages/webui-server/tests/*.test.ts` and `packages/cli/tests/wrongforge-leader/*` as non-exporting suites: establish dependents via repo-wide stem grep and path ratchets in `architecture/*.json`, especially `architecture/test-only-exports.json` and `docs/reports/architecture-health-current.json`. Find production consumers with module-path grep such as `wrongforge-leader-provider(\.js)?`, not symbol impact tools.
- Treat `.bun-version` and similar pinning files as data: use direct `read` plus repo-wide `grep` on the filename; index, skeleton, and call-graph tools will not find consumers, and CI may duplicate the literal.

## Disambiguation

- Distinguish `packages/webui-server/src/server/memory-handlers.ts` from `packages/webui/src/hooks/ws-memory-handlers.ts` and `server/http-server/vector-memory-handlers.ts`; ignore `tsconfig.tsbuildinfo` noise and classify full import specifiers.
- Disambiguate `breakStaleLock` by module path: `packages/core/src/session-catalog/session-registry-atomic-file.ts` is separate from `packages/core/src/plugins/review-claim-store-lock.ts`, which is re-exported by `review-claim-registry.ts` and imported by `packages/core/tests/plugins/review-claim-registry.test.ts`.
