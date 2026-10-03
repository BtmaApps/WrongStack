# explore-companion Role Instructions

## Result Submission

- Submit findings with `submit_result`; this role has no `mailbox`. Keep every field ASCII-only. If validation rejects a result, shorten the narrative and `files_examined` before removing evidence.
- Separate confirmed findings from inconclusive checks. Tool failure, ignored paths, index gaps, truncation, or an unqualified zero-hit result never proves absence.
- Re-read or re-tree volatile targets immediately before `submit_result`; report observed state transitions rather than an earlier snapshot.

## Search and Evidence Discipline

- Read named files directly. Treat skeleton ranges and call-graph rows as leads; confirm declarations, imports, assertions, and wiring with exact searches or short reads.
- Build tracked candidate sets with repo-wide, case-sensitive `grep` in `files_with_matches` mode and `truncated=false`. Read hits to reject comments, generated artifacts, same-file references, and suffix collisions.
- Use word-boundary tokens such as `\bSymbol\b` and search every export separately; case variants and same-file call-graph conflation can otherwise create false edges or false absence. Only `codebase-incoming-calls` rows with `callType: "call"` are runtime call edges; report capped counts separately.
- Avoid directory-level nested braces, extension alternation, and large combined token patterns for file enumeration or capped searches. Confirm config presence with flat globs such as `packages/wrongtrace/*`, exact-name reads, or `tree`; split searches by family and run the most generic token alone after an unexpected zero.
- Raw `<` may arrive HTML-escaped. For JSX/component usage, combine an exact import search with `\bComponentName\b`, then inspect hits to distinguish imports, JSX render sites, re-exports, and mentions.
- Content search does not search filenames. A test need not mention itself. Zero hits describe only the searched scope; filesystem absence requires direct `ENOENT` plus an untruncated containing-directory tree.

## Public Surface and Consumer Closure

- Establish API exposure before counting consumers: diff module exports against every barrel re-export, follow wildcard barrels, and inspect the owning `package.json` `exports`. An alias accepted only by `scripts/vitest-core-aliases.mjs` but absent from `exports` is an exposure anomaly, not a public Node ESM path.
- Pair exact module-specifier searches—static `from`, `require`, and dynamic `import()`—with separate exported-symbol searches; named-token grep cannot detect wildcard re-exports.
- For `packages/wrongtrace/src/*`, search both `@wrongstack/wrongtrace` and the CLI shim `packages/cli/src/wiring/wrongtrace-hooks.ts`; split factory families so match caps cannot hide tests.
- For `packages/webui/src/lib/ws-client-*.ts`, also inspect the installer block, composed intersection, and re-exports at the bottom of `packages/webui/src/lib/ws-client.ts`; consumers resolve through that facade.

## Test Collection, Typechecking, and Browser Smokes

- Read the current root and package Vitest configs, package scripts, and test tsconfig instead of predicting collection. The root currently collects both `packages/**/tests/**/*.test.{ts,tsx}` and `packages/**/src/**/__tests__/**`, so a `src/__tests__` suite can run at root and package level.
- `packages/webui/**` is excluded from root Vitest. Run its suite with `cd packages/webui && pnpm test`, following `packages/webui/vitest.config.ts` and `packages/webui/TESTING.md`; `packages/webui-server/tests/` remains root-collected.
- The WebUI config collects `tests/**/*.test.{ts,tsx}`, not `*-smoke.mjs`, and `packages/webui/tsconfig.json` includes only `src/**/*`. Before naming a smoke's gate, check filename references, internal virtual-module or plugin identifiers, `test:*-browser` scripts, config inclusion, and tsconfig; absence from scripts means manual-only (`node tests/<name>.mjs`).
- Read each smoke's `assert.*` calls. Report `console.log` diagnostics as printed, not asserted. Across `page.evaluate`, compare the in-page returned object shape with Node-side property reads; mismatches can escape typecheck and Vitest because `.mjs` smokes are not collected.
- Run `pnpm check:test-types` when test diagnostics could change. `packages/webui-server/vitest.config.ts` currently has one Node project, `include: ['tests/**/*.test.ts']`, and coverage thresholds of 76/69/66 for statements/functions/branches. `packages/simpleui` uses `vite.config.ts`; most suites need `// @vitest-environment jsdom`.

## Ignored Scratch Namespace (`.temp_files/`)

- `.temp_files/` is gitignored and absent from codebase indexes and normal content grep. Use direct `read`, exact containing-directory `tree(..., truncated=false)`, a repo-wide literal-path grep for tracked references, and the complete harness tree artifact; do not content-grep the large scratch tree.
- Classify `.temp_files/*.mjs` by its body and artifacts, not extension or filename. Print-only probes are not assertion gates. Read the sibling runner named in the header and treat files the script writes as operational dependents; a redirected `-run.log` without final `-out.txt`/`.png` artifacts indicates an interrupted run.
- For `.temp_files/*.txt` browser-capture logs, bridge to tracked code through wire tokens such as `token.method`. Decode the `data:` URL in `PAGEERROR: Failed to fetch dynamically imported module` before searching for the failing module's symbols.
- Treat `.temp_files/proof-driven-bug-hunter/<round>/` as volatile: re-tree the exact round immediately before submission and report additions, removals, or `ENOENT`. A round with no sibling `*.test.ts` makes `vitest --config` inert with `No test files found`.
- Validate hardcoded test paths against the runner's actual cwd. Assess scratch configs separately: `test.root`, normalized `test.include`, config imports and aliases, and whether a proof test's relative subject import bypasses `coreAliases`.
- An `ENOENT` round may mean promotion, not deletion: search the slug after `rNN-` in tracked code and `// Round NN:` under `packages/*/tests/` before concluding absence.

## Role-Specific Wiring Checks

- For `packages/webui-server/src/server/*-routes.ts`, run separate exact searches for a specifier such as `from './<name>-routes.js'`, each word-bounded exported `createXxx`/`handleXxx`, and wire-token families (`x.y.run`, `abort`, `result`); inspect protocol, client message types, tests, and top-level declarations separately.
- Changes around `createRouteFamilyDispatcher(` in `message-dispatcher.ts` or `embedded-message-router.ts` must be checked against `packages/webui-server/tests/host-dispatcher-parity.test.ts`; its raw-source `balancedBlockAfter` check can fail on reformatting without a runtime change.
- For a request to persist an event field, read its payload type under `packages/core/src/kernel/events/` before consumers. Then inspect the emit path, such as `packages/core/src/execution/tool-executor-logging.ts`, to decide whether changes are adapter-only or require executor and EventMap edits.
- Trace `process.cwd()` to the filesystem path, spawn cwd, project-root field, or display value it controls; search `process\.chdir\(` separately because it mutates process-wide state. Verify test paths from the command's actual working directory before attributing `No test files found`.