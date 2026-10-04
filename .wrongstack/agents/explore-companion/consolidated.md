# explore-companion Role Instructions

## Result Submission

- Submit findings with `submit_result`; this role has no `mailbox`. Keep every field ASCII-only. If validation rejects a result, shorten the narrative and `files_examined` before removing evidence.
- Separate confirmed findings from inconclusive checks. Tool failure, ignored paths, index gaps, truncation, or an unqualified zero-hit result never proves absence.
- Re-read or re-tree volatile targets immediately before `submit_result`; report observed state transitions rather than an earlier snapshot.

## Search and Evidence Discipline

- Read named files directly. Treat skeleton ranges and call-graph rows as leads; confirm declarations, imports, assertions, and wiring with exact searches or short reads.
- Build tracked candidate sets with repo-wide, case-sensitive `grep` in `files_with_matches` mode and `truncated=false`. Read hits to reject comments, generated artifacts, same-file references, and suffix collisions.
- Use word-boundary tokens such as `\bSymbol\b` and search every export separately. Pair import-specifier greps (`from ['"]…<mod>…['"]`) with a separate bare-token grep on the module path — inline dynamic `import()` calls never match the `from '…'` form. Include `.mjs` in the extension set when mapping `packages/webui/src/components/**` consumers; browser smokes under `packages/webui/tests/*-smoke.mjs` import components via in-page source strings and are invisible to `.{ts,tsx}`-only sweeps.
- Avoid directory-level nested braces, extension alternation, and large combined token patterns for file enumeration or capped searches. Confirm config presence with flat globs, exact-name reads, or `tree`; split searches by family and run the most generic token alone after an unexpected zero.
- Raw `<` may arrive HTML-escaped. For JSX/component usage, combine an exact import search with `\bComponentName\b`, then inspect hits to distinguish imports, JSX render sites, re-exports, and mentions.
- Content search does not search filenames. A test need not mention itself. Zero hits describe only the searched scope; filesystem absence requires direct `ENOENT` plus an untruncated containing-directory tree.
- `codebase-impact-analysis` misattributes `callerName`/`callerKind` on import-edge rows and labels rows with `line: 0`; treat its affected-file list as authoritative and confirm exact import/render lines with a word-bounded token grep plus the JSX-site read. The same conflation discipline applies to `codebase-outgoing-calls` for tsx components: local closure functions (`fire`, `disarm`) resolve to unrelated same-name symbols repo-wide.

## Public Surface and Consumer Closure

- Establish API exposure before counting consumers: diff module exports against every barrel re-export, follow wildcard barrels, and inspect the owning `package.json` `exports`. A wildcard barrel (`export * from '../execution/design-*.js'`, public subpath `./design`) resolves to false "0 direct call sites" while its transitive rows flood with unrelated `line:0` noise — close such modules with a word-bounded token grep, never `codebase-impact-analysis` alone.
- Barrels re-export selectively: a barrel that carries `create*AuthStrategy` from `subscription-flows.js` may omit `refreshDeviceSubscription` (reached only via a non-barrel sibling like `packages/providers/src/subscription-oauth.ts`). Always grep the barrel and non-barrel siblings together, then pair import-specifier greps with a check of imported names against the target module's export list — a barrel-only sweep miscounts when consumers pull only sibling modules re-exported by the same barrel.
- For browser-safe core utils, close consumers with both `@wrongstack/core/utils/<name>` (no `.js`) and the `<name>.js` specifier form — compat entries re-export core utils via the bare package subpath, and `packages/tools/src/index.ts` barrels them again; a `.js`-suffix-only grep undercounts the cli/tui/webui/simpleui consumer set by the whole hub chain.
- For React components, also grep render tests for `data-testid` tokens (`getByTestId('…')`) and `getByText(`/`queryByText(` literals — both pin runtime contracts that `packages/webui` tests never typecheck (`packages/webui/tsconfig.json` includes only `src/**/*`), so renames or template-string changes break the suite with zero compiler signal. When a component renders no `data-testid`, fall back to `getByText` literals; when neither exists, grep for class-name tokens (e.g. `automation-(overlay|dialog|close)`) rather than component names to find true consumers.
- Verify render-test coverage with an import grep, not filename adjacency: a component's render test can live in an unrelatedly-named file (`AgentDetailSection` rendered by `packages/webui/tests/components/subagent-chat-tabs.test.tsx`), while the same-named test file may exercise only the store. A word-bounded `\bComponent\b` grep with `.mjs` in scope closes both directions.
- An alias accepted only by `scripts/vitest-core-aliases.mjs` but absent from `exports` is an exposure anomaly, not a public Node ESM path.

## Test Collection, Typechecking, and Browser Smokes

- Read the current root and per-package Vitest configs, package scripts, and test tsconfig instead of predicting collection. The root `vitest.config.ts` excludes `tests/components|hooks|stores|lib|integration|server|i18n|helpers|fixtures|setup|types/**` while deliberately leaving `tests/pure/**` collectible — a script pointing `TEST` at `packages/webui/tests/pure/**` runs at root; pointing it at any other webui test dir collects zero files and exits 1. For `packages/plugins/tests/*.test.ts`, check both the package `vitest.config.ts` (`include: ['tests/**/*.test.ts']`, `globals: false`, coverage thresholds over `src/**`) and the root `vitest.config.ts` `packages/**/tests/**` include, plus `packages/plugins/tsconfig.test.json` (exercised by `pnpm check:test-types`).
- The WebUI config collects `tests/**/*.test.{ts,tsx}`, not `*-smoke.mjs`; before naming a smoke's gate, check filename references, internal virtual-module or plugin identifiers, `test:*-browser` scripts, config inclusion, and tsconfig. Absence from scripts means manual-only (`node tests/<name>.mjs`).
- `docs/reports/architecture-health-current.json` lists every root-collected test file under a `projects` array (e.g. `"root-node"`); one grep corroborates collection cheaply.
- Run `pnpm check:test-types` when test diagnostics could change. Most `packages/simpleui` suites need `// @vitest-environment jsdom`.

## `.design/` Briefs

- `.design/` is gitignored — a `glob` returning 0 files is ignore-filtering, not absence; prove existence with direct `read`.
- `readDesignBrief()` in `packages/core/src/execution/design-detect.ts` injects the first 6000 bytes into agent system prompts on every Design Studio turn. Treat briefs as a runtime prompt-injection source, not inert docs: edits have zero test blast radius (`packages/core/tests/execution/design-detect.test.ts` uses `fs.mkdtemp` fixtures) and zero git-recovery options, but directly change the constraints future agent turns receive.

## Ignored Scratch Namespace (`.temp_files/`)

- `.temp_files/` is gitignored and absent from codebase indexes and normal content grep. Use direct `read`, exact containing-directory `tree(..., truncated=false)`, a repo-wide literal-path grep for tracked references, and the complete harness tree artifact; do not content-grep the large scratch tree.
- Classify `.temp_files/*.mjs` by its body and artifacts, not extension or filename. Print-only probes are not assertion gates. A bare `proof.ts`/`.mjs` with top-level `main()` + `process.exitCode` is self-executing and plain `node` cannot run it when it imports tracked sources via literal relative paths.

_(truncated at 8192 bytes — the next optimization pass must shorten it)_