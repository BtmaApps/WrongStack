# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-03T13:19:28.003Z; skill=codebase-navigation; applied=13; wins=13; skipped=19; skippedWins=19 -->
- **Always close consumers of `packages/core/src/execution/design-*.ts` modules with a word-bounded token grep, never trust `codebase-impact-analysis` alone — production callers import via the wildcard barrel `packages/core/src/design/index.ts` (`export * from '../execution/design-*.js'`, public subpath `./design` in `packages/core/package.json`), which the call graph resolves to a false "0 direct call sites" while its transitive rows flood with unrelated `apps/desktop/**` `line:0` noise. Anchor: `@wrongstack/core/design`, `captureProjectTokens`, `packages/tools/src/design.ts`, `packages/tui/src/hooks/use-design-kit-slash-commands.ts`.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/core/src/execution/design-*.ts`
  - *How:* `codebase-impact-analysis`
  - *How:* `packages/core/src/design/index.ts`
  - *How:* `export * from '../execution/design-*.js'`
  - *How:* `./design`
  - *How:* `packages/core/package.json`
  - *How:* `apps/desktop/**`
  - *How:* `line:0`
  - *How:* `@wrongstack/core/design`
  - *How:* `captureProjectTokens`
  - *How:* `packages/tools/src/design.ts`
  - *How:* `packages/tui/src/hooks/use-design-kit-slash-commands.ts`
  - *How:* `@wrongstack/core`

<!-- learned-stamp: category=warning; capturedAt=2026-10-03T08:05:49.256Z; skill=codebase-navigation; applied=31; wins=31; skipped=32; skippedWins=32 -->
- **Always grep a component's direct test for the `data-testid` tokens it queries (e.g. `getByTestId('notification-menu-trigger')` in `packages/webui/tests/components/*.test.tsx`) before assessing the blast radius of editing that component — testids are a runtime contract, not a type-level one, and `packages/webui` tests are never typechecked (`packages/webui/tsconfig.json` includes only `src/**/*`), so renaming a rendered `data-testid` (e.g. `notification-menu-trigger`, `notification-badge` in `packages/webui/src/components/NotificationMenu.tsx`) breaks the suite with zero compiler signal.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `data-testid`
  - *How:* `getByTestId('notification-menu-trigger')`
  - *How:* `packages/webui/tests/components/*.test.tsx`
  - *How:* `packages/webui`
  - *How:* `packages/webui/tsconfig.json`
  - *How:* `src/**/*`
  - *How:* `notification-menu-trigger`
  - *How:* `notification-badge`
  - *How:* `packages/webui/src/components/NotificationMenu.tsx`

<!-- learned-stamp: category=warning; capturedAt=2026-10-03T07:24:46.880Z; skill=codebase-navigation; applied=2; wins=2; skipped=67; skippedWins=67 -->
- **Always verify render-test coverage with an import grep, not filename adjacency, when mapping consumers of a `packages/webui/src/components/**` component: the component's direct render test can live in an unrelatedly-named file (e.g. `AgentDetailSection` is rendered by `packages/webui/tests/components/subagent-chat-tabs.test.tsx`), while the same-named test file (`agent-detail-section.test.tsx`) may exercise only the store (`useFleetStore`) and never import the component. A word-bounded `\bComponent\b` grep with `.mjs` included in scope closes both directions in one pass.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/webui/src/components/**`
  - *How:* `AgentDetailSection`
  - *How:* `packages/webui/tests/components/subagent-chat-tabs.test.tsx`
  - *How:* `agent-detail-section.test.tsx`
  - *How:* `useFleetStore`
  - *How:* `\bComponent\b`
  - *How:* `.mjs`

<!-- learned-stamp: category=warning; capturedAt=2026-10-03T05:45:37.982Z; skill=codebase-navigation; applied=38; wins=38; skipped=53; skippedWins=53 -->
- **Never apply the blanket "`packages/webui/**` is excluded from root Vitest" claim when predicting whether a root-cwd `vitest run packages/webui/tests/<path>` collects tests — read the per-directory `exclude` list in root `vitest.config.ts` (currently lines ~224–234, excluding `tests/components|hooks|stores|lib|integration|server|i18n|helpers|fixtures|setup|types/**` while deliberately leaving `tests/pure/**` collectible). A script pointing `TEST` at `packages/webui/tests/pure/**` runs at root and is functional; pointing it at any other webui test dir collects zero files, exits 1, and makes pass/fail signals meaningless. Anchor: `vitest.config.ts`, `packages/webui/tests/pure/**`, `exclude`, `npx vitest run`.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/webui/**`
  - *How:* `vitest run packages/webui/tests/<path>`
  - *How:* `exclude`
  - *How:* `vitest.config.ts`
  - *How:* `tests/components|hooks|stores|lib|integration|server|i18n|helpers|fixtures|setup|types/**`
  - *How:* `tests/pure/**`
  - *How:* `TEST`
  - *How:* `packages/webui/tests/pure/**`
  - *How:* `npx vitest run`

<!-- learned-stamp: category=warning; capturedAt=2026-10-03T08:37:13.939Z; skill=codebase-navigation; applied=4; wins=4; skipped=56; skippedWins=56 -->
- **Pair every import-specifier grep (`from ['"]…<mod>…['"]`) with a bare-token grep for the module path when closing consumers of a types module: inline dynamic type imports such as `import('../stores/types.js').SubagentView` in `packages/webui/src/components/use-office-map-topology.ts` never match the `from '…'` form, so a specifier-only sweep undercounts. The bare-token `files_with_matches` pass is the cheap way to catch them and reconcile counts.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `from ['"]…<mod>…['"]`
  - *How:* `import('../stores/types.js').SubagentView`
  - *How:* `packages/webui/src/components/use-office-map-topology.ts`
  - *How:* `from '…'`
  - *How:* `files_with_matches`
  - *How:* `../stores/types.js`

<!-- learned-stamp: category=warning; capturedAt=2026-10-03T12:25:11.263Z; skipped=45; skippedWins=45 -->
- **When a `packages/webui/src/components/**` component renders no `data-testid` attributes, grep its render tests for `getByText(`/`queryByText(` literals instead — those literals pin the exact string template (e.g. `` `${theme} ${pair} ${ratio.toFixed(2)}:1` `` in `packages/webui/src/components/ContrastBadges.tsx:44` is frozen by `getByText('light primary/bg 1.18:1')` in `packages/webui/tests/components/design-studio-contrast-badges.test.tsx`), and since `packages/webui` tests are never typechecked, separator/precision changes break the suite with zero compiler signal.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/webui/src/components/**`
  - *How:* `data-testid`
  - *How:* `getByText(`
  - *How:* `queryByText(`
  - *How:* `in`
  - *How:* `is frozen by`
  - *How:* `), and since`
  - *How:* `packages/webui/src/components/ContrastBadges.tsx`
  - *How:* `packages/webui/tests/components/design-studio-contrast-badges.test.tsx`

<!-- learned-stamp: category=warning; capturedAt=2026-10-03T17:54:13.613Z; skill=codebase-navigation; applied=8; wins=8; skipped=16; skippedWins=16 -->
- **When asked for "callers/dependents of `package.json`" in this repo, answer at the manifest level, not the call-graph level: root `package.json` has no `exports`/`main`/`bin` (`codebase-skeleton` returns `symbolCount: 0`), so close the question by grepping `scripts/*.mjs` for field-level access (`bump-version.mjs`, `build-portable.mjs`, `build.mjs`, `test-affected.mjs`, `release-check-matrix.mjs`) and pointing workspace membership at `pnpm-workspace.yaml`, never a root `workspaces` field.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `package.json`
  - *How:* `exports`
  - *How:* `main`
  - *How:* `bin`
  - *How:* `codebase-skeleton`
  - *How:* `symbolCount: 0`
  - *How:* `scripts/*.mjs`
  - *How:* `bump-version.mjs`
  - *How:* `build-portable.mjs`
  - *How:* `build.mjs`
  - *How:* `test-affected.mjs`
  - *How:* `release-check-matrix.mjs`
  - *How:* `pnpm-workspace.yaml`
  - *How:* `workspaces`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T17:59:23.900Z; skill=codebase-navigation; applied=5; wins=5; skipped=18; skippedWins=18 -->
- **[skill: codebase-navigation] Always check a `.temp_files/proof-driven-bug-hunter/<round>/` file's shape before predicting how it runs: `*.test.ts` with a sibling `vitest.proof.config.mjs` is vitest-driven, but a bare `proof.ts` (or `.mjs`) with a top-level `main()` + `process.exitCode` is a self-executing manual script that plain `node` cannot run when it imports tracked sources via a literal relative `.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`
  - *How:* `*.test.ts`
  - *How:* `vitest.proof.config.mjs`
  - *How:* `proof.ts`
  - *How:* `.mjs`
  - *How:* `main()`
  - *How:* `process.exitCode`
  - *How:* `node`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T18:03:44.144Z; skill=codebase-navigation; applied=8; wins=8; skipped=13; skippedWins=13 -->
- **Always close consumers of a browser-safe core util in this repo with a bare-subpath grep (`@wrongstack/core/utils/<name>`, no `.js`) in addition to the `<name>.js` specifier grep — compat entries like `packages/tools/src/<name>.ts` re-export core utils via the bare package subpath, and `packages/tools/src/index.ts` barrels them again, so a `.js`-suffix grep undercounts the cli/tui/webui/simpleui consumer set by the whole hub chain.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `@wrongstack/core/utils/<name>`
  - *How:* `.js`
  - *How:* `<name>.js`
  - *How:* `packages/tools/src/<name>.ts`
  - *How:* `packages/tools/src/index.ts`
  - *How:* `@wrongstack/core`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T21:11:54.767Z; skill=codebase-navigation; skipped=10; skippedWins=10 -->
- **Always close dependents of `packages/providers/src/oauth/*` modules through BOTH the barrel `packages/providers/src/oauth/index.ts` and non-barrel sibling imports — the barrel re-exports selectively (e.g. it carries the 3 `create*AuthStrategy` factories from `subscription-flows.js` but NOT `refreshDeviceSubscription`), so a specifier grep of the barrel alone miscounts the public surface; the refresh path reaches production only via `packages/providers/src/subscription-oauth.ts`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/providers/src/oauth/*`
  - *How:* `packages/providers/src/oauth/index.ts`
  - *How:* `create*AuthStrategy`
  - *How:* `subscription-flows.js`
  - *How:* `refreshDeviceSubscription`
  - *How:* `packages/providers/src/subscription-oauth.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T08:10:49.506Z; skill=codebase-navigation; applied=2; wins=2; skipped=60; skippedWins=60 -->
- **Always diff a `.temp_files/*.mjs` scratch probe against its tracked twin beyond the shared helper name: one `codebase-search` on the distinctive function (here `uncommentedLines`) locates the twin, then read both rule-constant blocks. Scratch copies typically drop guard-only structures (here `ISOLATED_COLOR_SURFACES` in `packages/webui/tests/lib/theme-color-boundaries.test.ts`) and swap relative `srcRoot` resolution for a hardcoded absolute path — those omissions are exactly where a leader's edit silently diverges from the enforced gate. [skill: codebase-navigation]**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/*.mjs`
  - *How:* `codebase-search`
  - *How:* `uncommentedLines`
  - *How:* `ISOLATED_COLOR_SURFACES`
  - *How:* `packages/webui/tests/lib/theme-color-boundaries.test.ts`
  - *How:* `srcRoot`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T07:05:50.426Z; skill=codebase-navigation; applied=13; wins=13; skipped=58; skippedWins=58 -->
- **Always distrust `callerName`/`callerKind` attribution on import-edge rows in `codebase-impact-analysis` output for `packages/webui/src/components/**` consumers: it labeled the `WorktreesPanel` import inside `ChangesPanel.tsx` as belonging to the unrelated top-level `STATUS_META` const and emitted an indirect row with `callerName: "FileRow", line: 0`. Treat the affected-file list as authoritative and confirm the exact import/render lines with a word-bounded token grep (`\b<ComponentName>\b`) plus the JSX-site read — the same conflation discipline already used for `codebase-incoming-calls` single-letter rows.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `callerName`
  - *How:* `callerKind`
  - *How:* `codebase-impact-analysis`
  - *How:* `packages/webui/src/components/**`
  - *How:* `WorktreesPanel`
  - *How:* `ChangesPanel.tsx`
  - *How:* `STATUS_META`
  - *How:* `callerName: "FileRow", line: 0`
  - *How:* `\b<ComponentName>\b`
  - *How:* `codebase-incoming-calls`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T08:57:16.458Z; skill=codebase-navigation; applied=1; wins=1; skipped=55; skippedWins=55 -->
- **Always read a React component's source instead of trusting `codebase-outgoing-calls` for its internal behavior: local closure functions inside components (`fire`, `disarm` in `packages/webui/src/components/MessageBubble/FailedRunContinue.tsx`) resolve to unrelated same-name symbols repo-wide (e.g. `fire` in `packages/acp/tests/acp-concurrent-prompt.test.ts`), producing false callee edges. Same conflation discipline as incoming-calls, but for outgoing rows on tsx components.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `codebase-outgoing-calls`
  - *How:* `fire`
  - *How:* `disarm`
  - *How:* `packages/webui/src/components/MessageBubble/FailedRunContinue.tsx`
  - *How:* `packages/acp/tests/acp-concurrent-prompt.test.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T08:04:36.728Z; skill=codebase-navigation; applied=1; wins=1; skipped=64; skippedWins=64 -->
- **Always resolve a CSS `import './<name>.css'` specifier to its containing directory before attributing consumers: two files in different packages can both say `import './automation.css'` yet load two different stylesheets. When mapping a stylesheet's blast radius, glob for same-named twins in sibling packages (here `packages/simpleui/src/automation.css` vs `packages/webui/src/components/automation.css`, both imported via identical relative specifiers from `automation-workspace.tsx` and `AutomationView.tsx` respectively), then grep each twin separately for token-level divergence before telling the leader an edit is or isn't cross-package. Also grep class-name tokens (e.g. `automation-(overlay|dialog|close)`) rather than component names to find the stylesheet's true class consumers — the dialog classes were rendered by `automation-panel.tsx`, not the importing file itself.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `import './<name>.css'`
  - *How:* `import './automation.css'`
  - *How:* `packages/simpleui/src/automation.css`
  - *How:* `packages/webui/src/components/automation.css`
  - *How:* `automation-workspace.tsx`
  - *How:* `AutomationView.tsx`
  - *How:* `automation-(overlay|dialog|close)`
  - *How:* `automation-panel.tsx`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T13:26:06.084Z; skill=codebase-navigation; applied=1; wins=1; skipped=28; skippedWins=28 -->
- **Always verify which named symbols each barrel consumer actually pulls before counting it as a dependent of a component module: a test file importing from a re-export barrel (e.g. `packages/tui/tests/sidebar-presentation.test.tsx` importing `ConnectionsPanelSidebar` from `../src/components/sidebar-panels.js`) may consume only sibling modules re-exported by the same barrel (here `sidebar-panels-workspace.js`, not `sidebar-panels-task.js`). Pair the import-specifier grep (`from '…<barrel>.js'`) with a check of the imported names against the target module's export list — the barrel's own re-export blocks name the true source file for each symbol.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/tui/tests/sidebar-presentation.test.tsx`
  - *How:* `ConnectionsPanelSidebar`
  - *How:* `../src/components/sidebar-panels.js`
  - *How:* `sidebar-panels-workspace.js`
  - *How:* `sidebar-panels-task.js`
  - *How:* `from '…<barrel>.js'`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T13:14:13.940Z; skill=codebase-navigation; applied=11; wins=11; skipped=23; skippedWins=23 -->
- **When a repository comment claims behavior is "pinned by `<name>.test.ts`", grep the claimed assertion (e.g. the exact fixture string like `[x] partial`) inside the named test file before attributing the pin — same-named test twins commonly exist across packages (here the comment in `packages/webui/src/lib/goal.ts` points at `packages/webui/tests/stores/goal-store.test.ts`, not `packages/core/tests/storage/goal-store.test.ts`). Also: a test file with no `export` statements has zero importers by construction; the only legitimate "callers" are vitest `include` patterns in `vitest.config.ts`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `<name>.test.ts`
  - *How:* `[x] partial`
  - *How:* `packages/webui/src/lib/goal.ts`
  - *How:* `packages/webui/tests/stores/goal-store.test.ts`
  - *How:* `packages/core/tests/storage/goal-store.test.ts`
  - *How:* `export`
  - *How:* `include`
  - *How:* `vitest.config.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T06:45:46.183Z; skill=codebase-navigation; applied=20; wins=20; skipped=54; skippedWins=54 -->
- **When closing consumers of a `packages/webui/src/components/**` React component, always extend the token-grep extension set beyond `*.{ts,tsx}` to include `.mjs` — browser smokes under `packages/webui/tests/*-smoke.mjs` import components directly via in-page source strings, and a `.ts,.tsx`-only sweep missed the sole executable consumer (`mailbox-compose-browser-smoke.mjs` importing `ChangesPanel`). Pair the word-bounded token grep with the package `package.json` `test:*-browser` scripts to learn whether that consumer is a manual gate.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/webui/src/components/**`
  - *How:* `*.{ts,tsx}`
  - *How:* `.mjs`
  - *How:* `packages/webui/tests/*-smoke.mjs`
  - *How:* `.ts,.tsx`
  - *How:* `mailbox-compose-browser-smoke.mjs`
  - *How:* `ChangesPanel`
  - *How:* `package.json`
  - *How:* `test:*-browser`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T08:49:20.721Z; skill=codebase-navigation; applied=8; wins=8; skipped=49; skippedWins=49 -->
- **When mapping a `.design/*` file's blast radius in this repo, treat it as a **runtime prompt-injection source, not inert docs**: `.design/` is gitignored (`.gitignore` ~, so `glob` returning 0 files is ignore-filtering, not absence — prove existence with direct `read`), and `readDesignBrief()` in `packages/core/src/execution/design-detect.ts` injects its first 6000 bytes into agent system prompts on every Design Studio turn. Edits have zero test blast radius (`packages/core/tests/execution/design-detect.test.ts` uses `fs.mkdtemp` fixtures) and zero git-recovery options, but directly change the constraints future agent turns receive.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.design/*`
  - *How:* `.design/`
  - *How:* `.gitignore`
  - *How:* `glob`
  - *How:* `read`
  - *How:* `readDesignBrief()`
  - *How:* `packages/core/src/execution/design-detect.ts`
  - *How:* `packages/core/tests/execution/design-detect.test.ts`
  - *How:* `fs.mkdtemp`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T05:54:54.645Z; skill=codebase-navigation; applied=13; wins=13; skipped=76; skippedWins=76 -->
- **When mapping a `.temp_files/*.mjs` harness or runner script, always scan for undeclared identifiers left over from renames (e.g. a `void <name>;` lint-silencer naming an array that was renamed to `real`). Scratch `.mjs` has no typecheck gate, so the crash surfaces only at runtime — typically after the expensive loop finishes but before results print — making a long run produce no output. Anchor: `.temp_files/`, `void`, `ReferenceError`, `--reporter=dot`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/*.mjs`
  - *How:* `void <name>;`
  - *How:* `real`
  - *How:* `.mjs`
  - *How:* `.temp_files/`
  - *How:* `void`
  - *How:* `ReferenceError`
  - *How:* `--reporter=dot`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T05:42:32.789Z; skill=codebase-navigation; applied=15; wins=15; skipped=77; skippedWins=77 -->
- **When mapping a `.temp_files/*.mjs` patcher/generator script, extract its hardcoded `SRC`/`DST` path constants first — they are the complete incoming/outgoing edge list. Close them with one anchor grep into the `SRC` twin (verifying the script's `src.includes(...)` literals still match) and one existence read of the `DST` artifact, skipping `codebase-*` tools entirely (index-blind to `.temp_files/`). This is cheaper and more precise than searching for a tracked twin by distinctive function names when the script names its source explicitly.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/*.mjs`
  - *How:* `SRC`
  - *How:* `DST`
  - *How:* `src.includes(...)`
  - *How:* `codebase-*`
  - *How:* `.temp_files/`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T05:40:22.518Z; skill=codebase-navigation; applied=7; wins=7; skipped=86; skippedWins=86 -->
- **When mapping a `.temp_files/*.mjs` scratch analysis script, run one `codebase-search` on its distinctive function names (e.g. `decodePng`) to find the tracked twin it was lifted from — scratch scripts commonly derive from tracked browser smokes like `packages/webui/tests/*-smoke.mjs`, and the twin is where real, gate-relevant behavior lives. The dependency arrow is one-way (scratch copies tracked), so scratch edits have zero blast radius, but a leader intending behavioral change may have edited the wrong file.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/*.mjs`
  - *How:* `codebase-search`
  - *How:* `decodePng`
  - *How:* `packages/webui/tests/*-smoke.mjs`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T21:19:22.088Z; skill=node-modern; skipped=6; skippedWins=6 -->
- **When mapping a `.temp_files/proof-driven-bug-hunter/<round>/` blast radius, treat the sibling `run.mjs` as the sole invoker of `vitest.proof.config.mjs` and read it before predicting gates: it hardcodes the repo-root-relative `--config` path (breaking on any round-dir or config rename) and spawns `<repo-root>/node_modules/vitest/vitest.mjs` with `cwd: process.cwd()`, so the round only runs when invoked from the repo root; its exit code and tee'd output land in the sibling `proof.before.log`. Tracked-code grep for the config name returns zero by design — `.temp_files/` is gitignored.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`
  - *How:* `run.mjs`
  - *How:* `vitest.proof.config.mjs`
  - *How:* `--config`
  - *How:* `<repo-root>/node_modules/vitest/vitest.mjs`
  - *How:* `cwd: process.cwd()`
  - *How:* `proof.before.log`
  - *How:* `.temp_files/`
  - *How:* `node_modules/vitest/vitest.mjs`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T14:09:15.619Z; skill=node-modern; applied=8; wins=8; skipped=17; skippedWins=17 -->
- **When mapping the blast radius of any `packages/plugins/tests/*.test.ts` file, always check **both** vitest collectors before predicting gates: the package config (`packages/plugins/vitest.config.ts`, `include: ['tests/**/*.test.ts']`, `globals: false`, coverage thresholds 94/95/91/79 over `src/**`) and the root `vitest.config.ts` `packages/**/tests/**` include — plus `packages/plugins/tsconfig.test.json` (includes `tests/**/*`, exercised by the repo-level `pnpm check:test-types`). `docs/reports/architecture-health-current.json` lists every root-collected test file under a `projects` array (e.g. `"root-node"`), which corroborates collection cheaply in one grep.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/plugins/tests/*.test.ts`
  - *How:* `packages/plugins/vitest.config.ts`
  - *How:* `include: ['tests/**/*.test.ts']`
  - *How:* `globals: false`
  - *How:* `src/**`
  - *How:* `vitest.config.ts`
  - *How:* `packages/**/tests/**`
  - *How:* `packages/plugins/tsconfig.test.json`
  - *How:* `tests/**/*`
  - *How:* `pnpm check:test-types`
  - *How:* `docs/reports/architecture-health-current.json`
  - *How:* `projects`
  - *How:* `"root-node"`

---
*Last capture: 2026-10-03T21:19:22.088Z · 23 entries*
