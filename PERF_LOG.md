# Performance log

## 2026-09-26 — techstack: end-to-end inventory-phase bank of both kept changes (perf-ratchet round techstack-inventory-bank-2026-09-26, measurement only)

commit: 63a918164b7c081a924d6f60a7f17071d2d2893f (shared working tree with the two kept changes: npm.ts lockfile memo + detect.ts concurrent readdir prefetch; no code change this round — suites green at this exact tree state this session: tools exit 0 23:22, techstack exit 0 23:24)
machine: AMD Ryzen 9 9950X3D / 126 GB RAM / Windows x64 / Node v24.13.0 (other sessions active)
workload / command: identical to round techstack-inventory-2026-09-26 — `pnpm exec tsx .temp_files/perf-ratchet/techstack-inventory-bank-2026-09-26/bench.mts phase` (1 warmup + 7 in-process runs per process, 5 processes), runInventoryPhase over this repo, no-op store, includeTransitive true
measured (banked): in-process medians 55.4 / 61.7 / 58.0 / 58.8 / 58.1 ms (min 51.8, max 65.6); **median-of-medians 58.1 ms**; dependencies 212 in every one of the 35 runs, workspaces 24 — output invariant held throughout.
series across today's rounds (same command family, same machine, noise varying): 90.5 ms (original baseline) → 68.6 ms (after npm.ts lockfile memo, [KEPT] round 1) → **58.1 ms** (after detect.ts concurrent readdir, [KEPT] round 3) = **-35.8% combined**. The readdir change's end-to-end contribution on this phase: 68.6 → 58.1 = -10.5 ms (-15.3%) — the previously unmeasured knock-on is now banked.
attribution (single-shot, no warmup — comparable to round 1's attr which also ran without warmup): discovery 55.9 ms (was 65.7), inventory 19.2 ms (was 43.3 pre-memo, 20.1 post-memo — the lockfile memo is still fully effective; inventory is now the smaller share). Caveat stated: the warm standalone detection walk measured 27.7 ms in its own bench; the attr-mode discovery figure includes cold JIT/fs-cache for that process and the techstack mapping wrapper, matching round 1's attr-vs-phase inflation pattern.
not measured: cold-cache (OS page cache empty) behavior; enrich (network) and research (LLM) phases remain out of scope by design. No new correctness gates this round — no code changed.

## 2026-09-26 — tools: order-preserving concurrent readdir in detectLanguageWorkspaces (perf-ratchet round tools-discovery-conc-2026-09-26)

commit: 63a918164b7c081a924d6f60a7f17071d2d2893f (shared working tree; pre-change state = HEAD detect.ts, gates green this session at 23:04/23:11/23:18)
machine: AMD Ryzen 9 9950X3D / 126 GB RAM / Windows x64 / Node v24.13.0 (other sessions active — noise floor higher than the prior round)
workload: `detectLanguageWorkspaces({ projectRoot: <this repo> })`, default limits — identical bench to round tools-discovery-2026-09-26
command: `pnpm exec tsx .temp_files/perf-ratchet/tools-discovery-conc-2026-09-26/bench.mts phase` (1 warmup + 7 in-process runs per process, 5 processes)
metric: wall milliseconds of the detection walk
baseline (measured): in-process medians 47.6 / 51.3 / 50.3 / 56.3 / 51.4 ms across 5 processes (min 44.4, max 62.8); median-of-medians 51.3 ms. Spread of medians ≈ 8.7 ms — the machine is noisier than the prior round (whose band was 2.8 ms); verdict band = max(spread, 5%) reported alongside the requested ~2.8 ms. Output byte-stable every run: 37 workspaces, scannedEntries 5000, truncated true.
hypothesis H2 (from round tools-discovery-2026-09-26's attribution): the walk is readdir-syscall-bound — ~51% of runtime in 386 sequential `readdir(withFileTypes)` calls. Issue each directory's immediate-children readdirs concurrently (libuv threadpool, 4 workers on this setup) as data prefetch, while awaiting and PROCESSING entries in the identical sequence — recursion stays at its exact loop position so entry accounting, evidence order, and the maxEntries=5000 truncation set stay byte-identical. Expect roughly a 3-4× effective readdir pipeline → −8-15 ms on the median.
change (one variable): `packages/tools/src/languages/detect.ts` `scanDirectory` — new optional `prefetched` parameter (a `Promise<Dirent[] | undefined>`); before the counting loop each directory issues `fs.readdir` for every immediate subdirectory that passes the ignore/depth filters into a `Map<childPath, promise>` (`.then(ok, () => undefined)` — a failed read resolves undefined and is skipped exactly like the sequential `catch`; no unhandled rejections; unreached children simply drop their result); the recursion passes `childReads.get(fullPath)` so the child awaits the in-flight read instead of issuing its own. Entry counting, evidence push order, and recursion positions are untouched — processing stays strictly sequential.
after (measured, same command, 5 processes): in-process medians 27.7 / 29.6 / 28.5 / 27.4 / 27.0 ms (min 24.2, max 35.7); median-of-medians 27.7 ms vs baseline 51.3 ms = **-23.6 ms (-46.0%)**. Every after-median sits ~18 ms below every before-median — non-overlapping, far outside both the requested ~2.8 ms band and this round's wider ~8.7 ms repeat spread. Variance also fell (after max 35.7 vs baseline max 62.8). Output byte-stable every run: 37 workspaces, scannedEntries 5000, truncated true. Against the quieter prior-round baseline (45.8 ms) the win would still be -18.1 ms. Prediction check: predicted -8-15 ms, measured -23.6 ms — the overlap eliminated essentially the entire serialized readdir share (attribution said 23.4 ms), better than the conservative 3-4× threadpool estimate.
correctness: `tsc --noEmit` clean; biome clean (1 auto-format of the new lines); focused languages-detect 8/8; FULL `pnpm --filter @wrongstack/tools test` exit 0; consumer `pnpm --filter @wrongstack/techstack test` exit 0; output-equivalence harness vs HEAD (full DetectionResult deepStrictEqual on this repo + determinism re-run): identical true, deterministic true (37 workspaces / scannedEntries 5000 / truncated true on both sides).
- [KEPT] order-preserving concurrent readdir prefetch in `scanDirectory`: 51.3 → 27.7 ms median-of-medians (-46.0%) on the real-repo walk; output proven byte-identical vs HEAD. The detection walk — ~75% of techstack's inventory phase after round techstack-inventory-2026-09-26 — is no longer syscall-serialized.
not measured (stated plainly): the knock-on effect on techstack's full inventory phase (its bench was removed with round techstack-inventory-2026-09-26); expected to be large (discovery was ~61-66 ms of that phase) but unmeasured — no claim made. Cold-cache behavior unmeasured (all runs warm). Assumption: concurrent readdirs return the same per-directory listings as sequential ones (holds for an unmutated tree; the equivalence harness ran on a quiet tree).

## 2026-09-26 — tools: detectLanguageWorkspaces directory walk (perf-ratchet round tools-discovery-2026-09-26)

commit: 63a918164b7c081a924d6f60a7f17071d2d2893f (shared working tree)
machine: AMD Ryzen 9 9950X3D / 126 GB RAM / Windows x64 / Node v24.13.0 (other sessions active)
workload: `detectLanguageWorkspaces({ projectRoot: <this repo> })` — the exact call techstack's `discoverWorkspaces` makes (default limits: maxDepth 6, maxEntries 5000; 16 language profiles); the deterministic directory walk behind every techstack inventory and `language_info`/`plan` call
command: `pnpm exec tsx .temp_files/perf-ratchet/tools-discovery-2026-09-26/bench.mts phase` (1 warmup + 7 in-process runs per process, 5 processes); attribution via `... bench.mts attr` (walk replication priced piecewise)
metric: wall milliseconds of the detection walk
baseline (measured): in-process medians 45.2 / 46.6 / 45.8 / 46.6 / 43.8 ms across 5 processes (min 41.6, max 60.2); median-of-medians 45.8 ms; noise band ≈ 2.8 ms (repeat-run spread > 5%). Identical output every run: 37 workspaces (18 typescript + 18 javascript + 1 shell), scannedEntries 5000, truncated true — the walk hits the entry cap, so entry processing ORDER is observable output (which 5000 entries get counted) and must not change.
attribution (measured by faithful replication, warm cache): readdir+sort over 386 visited directories ≈ 23.4 ms (~51% — 386 `readdir(withFileTypes)` syscalls plus per-directory `localeCompare` sorts); per-file × per-profile detector loop ≈ 13.1 ms (~29% — 4,561 files × 16 profiles = ~73k iterations, each running `detectors.find` with a fresh `rule.filename.toLowerCase()` allocation per rule plus `extensions.includes` linear scan); package.json reads ~3 ms per unique root (detectPackageManager re-reads the same root once per TS/JS candidate — each root appears as 2 candidates); residual (canonicalize realpath+stat, source fallbacks, finalize hashing/sorting, Promise.all) ≈ 5-8 ms.
hypothesis H1: precompute per-profile match structures (filename→rule Map with FIRST-rule-wins tie-break, lowercased suffix array in rule order, extensions Set) once per detect call — read in the code: profiles are caller-suppliable so the index must be per-call, not module-level. Removes ~73k find-closure iterations and their per-rule toLowerCase allocations. Expect the detector loop 13.1 → ~5-7 ms and phase median 45.8 → ~39-41 ms (-11-15%); output must stay byte-identical (37 workspaces, scannedEntries 5000, truncated true, same evidence order — iteration order unchanged, find's first-match semantics preserved by construction).
change (one variable): `packages/tools/src/languages/detect.ts` — `buildProfileMatchers()` prepared per-profile ordered rule arrays (filename/suffix lowercased once; ordered, not bucketed, to preserve `find`'s cross-kind first-match semantics), threaded through `scanDirectory` → `collectFileEvidence`, plain first-match loop replacing `detectors.find` + per-rule toLowerCase. Extensions kept as-is.
after (measured, same command, 5 processes): in-process medians 45.0 / 46.7 / 40.2 / 44.9 / 36.0 ms (min 33.0, max 64.6); median-of-medians 44.9 ms vs baseline 45.8 ms = **-0.9 ms (-2.0%)** — INSIDE the ~2.8 ms / 5% noise band. Output identical every run (37 workspaces, scannedEntries 5000, truncated true). After-distribution noisier than baseline (other sessions active; runs 33.0-64.6), but even taking best-case runs the median comparison does not clear the band.
- [REVERTED] H1 precompute: measured -0.9 ms median, inside noise → reverted (`git checkout -- packages/tools/src/languages/detect.ts`; diff-vs-HEAD verified to contain only this round's hunks first; restored state re-verified: focused languages-detect tests 8/8). Why the hypothesis was wrong: predicted -6-8 ms from eliminating ~73k find-closure iterations with per-rule toLowerCase allocations, but the walk is readdir-syscall-bound (attribution: 23.4 ms of 45.8 ms = ~51% across 386 `readdir(withFileTypes)` calls) and V8's ASCII `toLowerCase` fast path + closure inlining evidently made the old loop near-free already. The replication-priced 13.1 ms detector loop overstated the in-situ share — do not retry per-rule precompute; the CPU matching layer is not the bottleneck.
correctness of the attempted change (for the record, all green before the revert): `tsc --noEmit` clean, biome clean, focused languages-detect 8/8, FULL `pnpm --filter @wrongstack/tools test` exit 0, consumer `pnpm --filter @wrongstack/techstack test` exit 0, output-equivalence harness vs HEAD (full DetectionResult deepStrictEqual on this repo + determinism re-run): identical true, deterministic true.
remaining hypotheses (NOT run): the only >few% lever left is overlapping the 386 readdir syscalls — an order-preserving concurrent prefetch (issue sibling-directory readdirs concurrently, await and PROCESS in the identical sequence so entry accounting/evidence order stay byte-identical; truncated=true makes the 5000-entry set observable, so processing order must not move). Package.json read dedup per root ≈ 2-3 ms — sub-noise, not worth a round. Replacing `localeCompare` entry sorts would change collation order and therefore which entries the cap counts — NOT output-equivalent while truncated.

## 2026-09-26 — techstack: inventory-phase wall time on a real pnpm monorepo (perf-ratchet round techstack-inventory-2026-09-26)

commit: 63a918164b7c081a924d6f60a7f17071d2d2893f (shared working tree)
machine: AMD Ryzen 9 9950X3D / 126 GB RAM / Windows x64 / Node v24.13.0 (other sessions active)
workload: `runInventoryPhase` over this repository itself (35-package pnpm monorepo, 368 KB / 8,675-line pnpm-lock.yaml, 24 discovered npm workspaces — each root twice via typescript+javascript profiles — 212 dependency observations); no-op store stub so the measurement isolates discovery + manifest/lockfile parsing; `includeTransitive: true`
command: `pnpm exec tsx .temp_files/perf-ratchet/techstack-inventory-2026-09-26/bench.mts phase` (1 warmup + 7 in-process runs per process, 5 processes) and `... bench.mts attr` for attribution
metric: wall milliseconds of the inventory phase — the deterministic stage of `analyze()` the user feels on every run; enrich (network) and research (LLM) are excluded because they are not deterministically measurable
baseline (measured): in-process medians 94.3 / 90.2 / 87.3 / 97.2 / 90.5 ms across 5 processes (min 82.0, max 107.2); median-of-medians 90.5 ms; workspaces 24, dependencies 212 (identical every run)
attribution (measured, 1 process): discovery 65.7 ms (~60%), adapter inventory 43.3 ms (~40%) — flat ~2.0-2.3 ms per npm workspace regardless of dependency count (a 0-dep workspace still costs 2.1 ms). Read in the code: every workspace's `NpmAdapter.inventory()` re-reads the 368 KB lockfile and line-scans all 8,675 lines twice (`parsePnpmImporterVersions` + `parsePnpmAllVersions`, each doing its own `split(/\r?\n/)`), 24× per run; discovery's directory walk (`@wrongstack/tools/languages`) is out of this round's scope, as is the per-root workspace duplication (dedup would change observable snapshot output).
hypothesis H1: parse the pnpm lockfile once per (path, mtimeMs, size) instead of 24× — expect inventory-attributed time 43.3 ms → ≤10 ms and phase median 90.5 → ~60-70 ms (-25-35%); dependencies must stay exactly 212.
change (one variable): `packages/techstack/src/adapters/npm.ts` — generalized `parsePnpmImporterVersions(content, path)` into `parsePnpmImporters(content)` collecting every importer in one pass (same loop, same field transitions), added `loadPnpmLockParse(path)`: module-level memo keyed by lockfile path, validated by stat (mtimeMs, size), LRU-capped at 4 entries; `inventory()`'s pnpm branch now looks up its importer in the shared parse. `parsePnpmAllVersions`/`parseNpmLockVersions` and the transitive pass untouched.
after (measured, same command, 5 processes): in-process medians 61.2 / 68.6 / 60.8 / 83.1 / 68.8 ms (min 59.5, max 102.5); median-of-medians 68.6 ms vs baseline 90.5 ms = **-24.2%**; workspaces 24, dependencies 212 (identical every run). Every after-median is below every before-median (worst after 83.1 < best before 87.3) — non-overlapping, far outside the ~10 ms spread band. Attribution after: discovery 61.5 ms (unchanged), inventory 43.3 → 20.1 ms (-54%).
sub-prediction miss (honest): inventory landed at 20.1 ms, not the predicted ≤10 ms — per-workspace fixed costs remain (one package.json read + `detectLockfile` ancestor walk + a ~1000-entry allVersions map copy per workspace). Phase delta (-21.9 ms) matches the inventory delta (-23.2 ms); discovery noise explains the rest.
correctness: `tsc --noEmit` exit 0; focused vitest (npm-adapter, transitive-inventory, parser-edge-cases, 100-coverage) 89 tests exit 0; FULL suite `pnpm --filter @wrongstack/techstack test` exit 0 pre- and post-change (40 files, 703 tests pre; identical file set post); output-equivalence harness (HEAD adapter vs cached adapter over all 24 real workspaces, includeTransitive true+false, cold+warm cache, retrievedAt-normalized deepStrictEqual): 212 = 212 observations, identical: true.
- [KEPT] pnpm lockfile parsed+read once per (path, mtimeMs, size) instead of 24× per inventory run; importer scan collects all importers in the single pass. Phase median 90.5 → 68.6 ms (-24.2%) on the real-monorepo workload; identical observable output proven against HEAD.
remaining in-scope hypotheses (NOT run — each bounded at ~3-7 ms on a ~68 ms total, at or below the ~10 ms noise band, so not worth a round): guard the per-workspace allVersions copy behind `includeTransitive` (default runs never consume it); memoize `detectLockfile` ancestor walks. The phase is now ~75% discovery (`@wrongstack/tools/languages` walk) — out of this round's packages/techstack scope; that is where the next real win lives.

## 2026-09-26 — Codex interrupted replay and prewarm correctness

Baseline command: `pnpm exec vitest run packages/providers/tests/codex-replay-edge-cases.test.ts packages/providers/tests/codex-websocket.test.ts`; shared working tree / Windows x64 / AMD Ryzen 9 9950X3D / Node v24.13.0. Measured: 7 failing regressions, 18 passing tests. Trailing reasoning was replayed without a following output; a mutated tool input retained its old serialized JSON (with and without raw metadata); incomplete/failed `response.done` warmups admitted a second inference frame; cancellation at warmup completion also admitted a second frame. Correctness evidence only, no live token or latency claim.
Additional measured baseline: `pnpm exec vitest run packages/providers/tests/codex-websocket.test.ts -t 'starts the inference watchdog'` fails with a synthetic 100 ms warmup and 10 ms inference watchdog. The inference queue timed out before inference began, causing a false WebSocket fallback. Fake timers isolate the ordering; no live latency measurement.
After: all 28 focused replay/WebSocket tests pass; final provider + relevant CLI run passes 1301 tests (1 skip). Failed/incomplete/cancelled prewarm and cancellation-at-completion send only the warmup frame, never the second inference frame. The 100 ms warmup / 10 ms watchdog fixture succeeds without fallback. Canonical tool input is serialized from current values; the unsafe identity-only serialization cache is removed for correctness, with no CPU-speed claim. Source HEAD remains 63a918164b7c081a924d6f60a7f17071d2d2893f plus shared working-tree changes.

## 2026-09-26 — Codex fallback isolation follow-up

Correctness baseline, shared working tree at 63a918164b7c081a924d6f60a7f17071d2d2893f; Windows x64 / AMD Ryzen 9 9950X3D / Node v24.13.0. Command: `pnpm exec vitest run packages/providers/tests/codex-websocket.test.ts packages/cli/tests/webui-server/setup-events.test.ts`. A failed thread forced its healthy sibling to SSE: 1 failing regression / 17 passing tests. No live token or latency claim; this verifies transport isolation.
After: the failing thread stays on SSE and the sibling gets its own WebSocket (2 socket creations, 3 HTTP requests across failure + repeat + sibling + original-thread repeat). Included in final 1289-test provider/CLI run. Reasoning output is now separately visible in opt-in probe records without adding it to total output twice. Pure request-body extraction resolves Codex's architecture hotspot growth; no execution-speed claim.

## 2026-09-26 — Codex replay and repeated context baseline

commit: 63a918164b7c081a924d6f60a7f17071d2d2893f (shared working tree)
machine: AMD Ryzen 9 9950X3D / Windows x64 / Node v24.13.0
workload: real Agent / system prompt builder / Responses conversion, three user turns and nine requests, fake WebSocket; two fixture tools, no live inference
command: `pnpm exec vitest run --config .temp_files/codex-cache-audit/audit.config.ts .temp_files/codex-cache-audit/audit.test.ts --silent=false --reporter=verbose`
metric (measured): delta requests out of eight continuation opportunities; repeated live-tail characters
baseline: current live tail 0/8; diagnostic no-tail control 8/8; no-tail control with server-formatted JSON arguments 2/8. Live-tail sizes 562, 562, 562, 598, 598, 598, 634, 634, 634 characters. These deterministic fixtures measure transport eligibility and text size, not backend token/quota savings or wall-time speed.
Correctness defects measured separately: probe reports 700 prompt tokens / 86% instead of 1000 / 60% for input=100/read=600/write=300; cross-model fingerprint reports 100% matching characters without isolating model identity.
after (measured): live-tail sizes 265, 265, 265, 301, 301, 301, 337, 337, 337 characters, identical in three consecutive audit runs. Repeated tail total 5382 -> 2709 characters (49.7%); 297 characters/request moved out of the changing suffix. Stable instruction text is still sent/cached; this is not a 49.7% total-token or quota claim. The initial relocation introduced extra fixed prose and exposed a tiny-prompt accounting fixture threshold; the prose was shortened while retaining the interpretation rules, and that regression passed without changing accounting thresholds.
Final shortened-prefix measurement (`after-final.log`): instructions 18809 -> 19102 (+293 characters); tail -297, combined text -4 per request. Character relocation improves the cacheable share; backend token savings remain unmeasured.
- [KEPT] Stable interpretation rules in system prefix; current state remains at the tail. No old live snapshots accumulated and no unsafe response-id continuation.
- [CORRECTNESS] Exact server tool-argument replay survives aggregate + JSON persistence; regression command: `pnpm exec vitest run packages/providers/tests/codex-cache-regressions.test.ts`. A server-formatted function call now permits the next tool-result-only delta. Stale/malformed metadata uses canonical arguments.
- [CORRECTNESS] Probe write-token denominator, account/model/thread isolation, request correlation, and local-character-vs-token naming repaired. No live backend cost claim.

## 2026-09-24 — codebase index: import-aware ref binding cost

commit: 1f4435905 (working tree)
machine: AMD Ryzen 9 9950X3D / 126 GB RAM / Windows / Node v24.13.0
workload: consistent copy (`VACUUM INTO`) of the live WrongStack index (9.7k files, 332k refs, built before this change); one upgrade full run, then a whole-index rebind, a full run over the unchanged checkout, and one-file edit runs (content stamp forced stale, same bytes) of `codebase-index/indexer.ts` (27 importers), `core/src/utils/index.ts` (barrel, 642 importers) and `core/src/types/index.ts` (barrel, 1196 importers)
command: `npx tsx .temp_files/bind/bench.mts snap.db` and `npx tsx .temp_files/bind/edit-prof.mts snap.db <files>`; binding time read from wrapped store methods
metric: wall milliseconds; edit figures are the third of three runs per file
baseline: first implementation (rebinds every ref of every file holding a ref into the changed file): utils barrel edit 409 ms (binding 291 ms over 45571 refs), types barrel edit 624 ms (binding 507 ms over 73093 refs), indexer.ts edit 161 ms (binding 16 ms)
after: utils barrel edit 149 ms (binding 40 ms over 2703 refs), types barrel edit 216 ms (binding 125 ms over 7056 refs), indexer.ts edit 144 ms (binding 4 ms); full no-op run 516 to 702 ms across runs (no binding work); whole-index rebind 1.25 to 1.45 s; one-time upgrade run 13.3 s (re-parses the 978 symbol-less files, rebinds everything)
- [KEPT] Memoised export lookup with per-file forward maps (re-exports by name, wildcard targets) instead of scanning a barrel's hundreds of re-export refs per ref: types barrel binding 507 ms to 302 ms before the next item.
- [KEPT] Rebind (file, name) pairs rather than whole files: every ref of a re-parsed file, elsewhere only refs named like one that pointed into the changed file; owner declarations narrowed to those names and owner imports taken from the loaded refs. Refs loaded 94% (utils) and 90% (types) fewer; binding 86% and 59% lower.
- [KEPT] Upgrade check found a latent Git-trust bug: a row with no content hash has an empty stamp, `gitBlobStamp(blob, '')` is empty too, and equality trusted it forever; trust now needs a non-empty stamp (test pins it).
- [REVERTED] Exempt bound edges from the rank pass's homonym and visibility penalties: `codebase-context` on four reference queries got worse. At full weight a TUI test file topped "daemon idle shutdown" (1.00 against 0.39 for the next file); exempting only visibility moved `archiveManagedTask` from first to fourth on "kanban task archive tombstone". Binding alone kept or improved all four.
scope: index-server operations in-process; the binding pass is a correctness change (37.9k refs bound to modules outside the index instead of a project homonym, 92k calls bound through imports, 952 symbol-less files now owning 23k refs); these figures are its cost

## 2026-09-24 — codebase index: change-proportional runs and graph reads

commit: 1f4435905 (working tree)
machine: AMD Ryzen 9 9950X3D / 126 GB RAM / Windows / Node v24.13.0
workload: copy of the live WrongStack index (9.6k files, 74k symbols, 270k refs); per process: warm full run, then a full run over the unchanged checkout, four one-file edit runs (first discarded: TypeScript compiler load), the watcher echo of that edit, package graph, `@wrongstack/core` file graph, `codebase-context` cold and warm, rank pass
command: `npx tsx .temp_files/idxbench/ab.mts <baseline|current> live.db`, three fresh processes per variant, alternating; baseline = HEAD copy of `packages/tools/src`
metric: wall milliseconds per operation; median of three processes (other sessions were active on the machine, so spreads are wide)
baseline: full no-op 4912/5359/5437 (median 5359); edit 420/528 (two valid runs, see correction below); echo 335/455 (same);  package graph 855/906/1187 (906); core file graph 1149/1358/1458 (1358); context cold 1109/1242/2002 (1242); rank pass 1222/1373/2028 (1373)
after: full no-op 681/718/2001 (median 718); edit 86/92/92 (92); echo 2/2/2 (2); package graph 341/389/418 (389); core file graph 660/687/697 (687); context cold 478/542/556 (542); rank pass 534/599/614 (599)
- [KEPT] Relation pass proportional to the run's changes (rewritten/added/deleted), label writes as a diff, structure cached behind `relation_epoch`: edit about 80% and echo 99% lower, far outside the run spread.
- [KEPT] Rank refresh on accumulated drift (25 files) instead of every full run; full no-op run 87% lower median together with the next two items.
- [KEPT] Per-file Git trust (`files.git_blob`) and one `git ls-files -t -s -m -d -o` process replacing three, end-of-run re-listing only when a stamp is written.
- [KEPT] xxHash64 on 32-bit halves instead of BigInt: 4.4x throughput on 2000×10 KB buffers (572 ms before, 130 ms after), output bit-identical (KAT + BigInt cross-check test).
- [KEPT] Package graph folded to package pairs in one array-mode scan instead of a file-pair GROUP BY: 57% lower median, output identical (51 nodes, 920 edges compared field by field).
- [KEPT] `+call_type` planner hints on the drill-down import query and the scoped resolution writes: core file graph 49% lower median.
- [KEPT] Wiring-graph inputs from one narrow symbol scan and array-mode reads, per-file memoised visibility: context cold 56%, rank pass 56% lower median; homonym counts equal to the SQL form on all 33,847 ids.
scope: index-server operations in-process; excludes IPC framing, WebUI rendering and the TUI
correction: the first baseline edit/echo figures (322/333/342 and 313/329/335 ms) were taken from a baseline copy whose `@typescript/typescript6` link did not resolve, so its edit runs failed to parse and did less work than a real edit. Re-measured with the link fixed: edit 420/528 ms, echo 335/455 ms against 85/86/103 ms and 2 ms after; one of three baseline processes aborted with IndexSourceChangedError because other sessions were editing the tree during its 5–15 s full run.

## 2026-09-24 — codebase index: cold full index

commit: 1f4435905 (working tree)
machine: AMD Ryzen 9 9950X3D / 126 GB RAM / Windows / Node v24.13.0
workload: `force: true` full index of this repository into an empty index directory (9.7k files: 8607 parsed, 1059 empty, 74193 symbols), inline parsing (source run, no worker pool)
command: `npx tsx .temp_files/idxbench/cold.mts <baseline|current>`, two fresh processes per variant, alternating; baseline = HEAD copy of `packages/tools/src`
metric: wall milliseconds of `runIndexerWithStore`; identical file outcomes and symbol counts in every run
baseline: 81676, 81797 ms
after: 47257, 45236 ms
- [KEPT] Defer per-batch ref resolution to one pass after the batch loop (whole-table when the run resolves globally anyway): the per-batch `to_name IN (…)` updates rescanned a growing refs table and were 26 s of self time in the baseline profile.
- [KEPT] TypeScript signatures sliced from source up to the body/members instead of printing the whole node with the TS printer (every function body and class member re-emitted, then cut to 500 chars): ~11 s inclusive in the baseline profile; signatures are now the declaration header only.
- [KEPT] Bulk-insert a cleared rebuild without the symbols/refs secondary indexes (rebuilt once after the batch loop) and skip its pointless delete/invalidate lookups: three alternating pairs against the same tree without the index drop, wall 30209/28594/28299 ms (median 28594) to 28212/25768/26368 ms (median 26368), process CPU 33938/32047/31110 ms to 30313/28797/29531 ms; each pair improved, 7.8% lower median, just above the 7% spread of this machine. A test pins that every index is rebuilt.
- [KEPT] Project server (frugal profile) rebuilding into an empty index uses a private 2-worker parser pool and the balanced batch width, shut down when the run ends; incremental and full runs stay single-threaded. Through the built daemon, bun 23204/21108 ms and node 22272/21828 ms, against about 40 s before (bun 40447/40554, node 43147/43582 ms).
scope: cold indexing only; the daemon's worker pool parallelises parsing on top of this. Through the built daemon (frugal profile, no parser pool): about 40 s on both node and bun once the machine was quiet; in-process with the parser pool, 23.7 s (node) and 29.4 s (bun)

## 2026-09-23 — default plugin factory imports

commit: 708c42baf
machine: AMD Ryzen 9 9950X3D / 126 GB RAM / Windows / Node v24.13.0
workload: import and instantiate the 90 official plugin factories in a fresh Node process, compared with importing only the five default-active official factories
command: `1..3 | ForEach-Object { node .temp_files/plugin-import-bench.mjs all }` (and `selected`)
metric: elapsed milliseconds after the factory module is loaded; three fresh processes per variant
baseline: all 90 = 258.023, 223.395, 219.958 ms (median 223.395 ms); 5 selected = 93.370, 98.325, 103.094 ms (median 98.325 ms)
after: selected default factories = 109.884, 101.719, 83.483 ms (median 101.719 ms)
- [KEPT] Decide enablement before factory import: 90 imports to 5 for the default official set; 54.5% lower median than the old 90-import path, above the 26.0% run-spread threshold. The unchanged selected-only control was 98.325 ms median before the edit.
scope: microbenchmark of factory imports and instantiation; excludes CLI startup, host setup, provider calls, and tool prompts

## 2026-09-23 — injection-shield bounded output extraction

commit: 708c42baf
machine: AMD Ryzen 9 9950X3D / 126 GB RAM / Windows / Node v24.13.0
workload: extract the first 262144 characters from 1000 content blocks of 20000 characters, repeated 30 times in one process
command: `1..3 | ForEach-Object { node .temp_files/injection-extract-bench.mjs }`
metric: extraction elapsed milliseconds, three fresh processes
baseline: 111.305, 100.218, 93.723 ms (median 100.218 ms)
after: 2.688, 2.487, 2.404 ms (median 2.487 ms)
- [KEPT] Stop joining content blocks at the configured scan limit: 97.5% lower median extraction time, outside the 17.5% run-spread threshold. All runs extracted the same 7864320-character total across 30 iterations.
scope: extraction only; does not measure regex scanning, full hook latency or end-to-end task time

## 2026-09-24 — HQ event-log recent-read baseline; STOP (noise)

commit: 1f4435905aa6fb0e752c960e3ab35fb2c7ae3a9f (shared working tree)
machine: Windows x64 / Node v24.13.0; concurrent activity including a root test run
workload: `HqEventLog.recent(50)` over a 31,158,580-byte HQ-format JSONL log of 2,200 14 KB-payload events; 20 warmups and 400 verified reads per process
metric: wall milliseconds per read, five fresh processes
command: `for /L %i in (1,1,5) do @pnpm exec tsx .temp_files\perf-ratchet\hq-event-log-20260924\bench.mts`
baseline: 4.495, 3.869, 4.993, 4.445, 5.183 ms/read (min 3.869, median 4.495, max 5.183); repeat-run spread 1.315 ms / 29.3% of median
- [STOP; NO CHANGE] Candidate: avoid `Buffer.concat` for one-piece lines in the 64 KiB tail scan, predicted <10% benefit. Baseline spread (29.3%) exceeds the predicted win. No source change was attempted, hence no keep/revert verdict or after number. A root `pnpm test` baseline was started and canceled when the noisy baseline triggered the stop rule; it did not finish or establish correctness. No post-change tests were run. The benchmark is representative of the read code path, not an actual server request.

## 2026-09-24 — HQ event-log recent-read retry; deferred before baseline

commit: 1f4435905aa6fb0e752c960e3ab35fb2c7ae3a9f (shared working tree)
machine: Windows x64 / Node v24.13.0, 32 logical CPUs
quiet gate: `node .temp_files\perf-ratchet\hq-recent-20260924-r2\quiet.mjs` sampled total CPU time over three independent 3-second intervals: 78.6%, 81.4%, 63.7% busy (the round-owned probe was removed afterward).
- [DEFERRED; NO ATTEMPT] Machine load failed the quiet prerequisite. No benchmark baseline, hypothesis change, correctness-suite completion, re-measurement, or keep/revert verdict occurred. HQ source was untouched; the earlier noisy baseline was not reused.
