# Performance log

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
