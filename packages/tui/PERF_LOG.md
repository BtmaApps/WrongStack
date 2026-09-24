# TUI performance ratchet — 2026-09-24

Scope: `packages/tui`. Metric: warm-index `@` file-search wall time per query, in milliseconds; synchronous search delays interactive typing. Workload: the package's real on-disk searchable paths, six representative queries, 1,200 searches per fresh Node process. Command (run from repository root): `cd packages\tui && for /L %i in (1,1,5) do @node .temp_files\perf-ratchet\search-20260924\search.mjs`. Node v24.13.0; machine `WHITE`; commit `1f4435905`. The temporary benchmark lives within `packages/tui/.temp_files/perf-ratchet/search-20260924/` and is removed after the round.

| Stage | Five runs (ms/search) | Min / median / max (ms/search) | Verdict |
| --- | --- | --- | --- |
| Baseline | 0.096413, 0.105325, 0.102071, 0.103266, 0.097034 | 0.096413 / 0.102071 / 0.105325 | Baseline; spread 0.008912 ms (8.73% of median) |
| Attempt 1: normalize query once | 0.117742, 0.109041, 0.091219, 0.091260, 0.092133 | 0.091219 / 0.092133 / 0.117742 | **REVERT**: median 9.74% lower, but after-run spread 0.026523 ms (28.79% of median) exceeds the apparent win; same benchmark checksum 7400 |

Benchmark source (retained here because the round-owned file was removed after measurement; the historical command above requires recreating it at that path):

```js
import { performance } from 'node:perf_hooks';
import { searchFiles } from '../../../src/file-search.ts';
const root = process.cwd();
const queries = ['src', 'test', 'component', 'hook', 'zzzzz', 'file-search'];
await searchFiles(root, 'src');
let checksum = 0;
const start = performance.now();
for (let i = 0; i < 1200; i++) {
  const matches = await searchFiles(root, queries[i % queries.length]);
  checksum += matches.length;
}
console.log(JSON.stringify({ msPerSearch: (performance.now() - start) / 1200, checksum }));
```

Hypothesis (SPECULATIVE): `score()` normalizes the identical query once per indexed path; moving that normalization to `searchFiles()` should remove repeated lowercase/replace work and cut warm-index search time by at least 15% without changing ranking.

Correctness gate: `pnpm --filter @wrongstack/tui test` exited 0 before and after the attempted change; the five benchmark processes each returned checksum 7400 in both stages. `codebase-targeted-test` found no mapped suites, so the full package suite was used. Existing React `act(...)` warnings were emitted by tests in both runs.

Decision: **REVERT** attempt 1. Diff summary of rejected change: normalize query lowercase and separators once in `searchFiles()` instead of for every path in `score()`. Although the changed-run median was 0.009938 ms/search below baseline, its 0.026523 ms repeat-run spread was larger; this experiment cannot distinguish the effect from machine noise. No production optimization survived. No profiler was run, so the hypothesis was **not disproven** and no alternative bottleneck was established. The benchmark warmed its on-disk index and therefore does not measure cold indexing, total render time, or actual keypress-to-paint latency. Shared machine load was not captured, another source of uncertainty. The original `src/file-search.ts` content was restored; the pre-existing `package.json` modification was not touched.

## Controlled-load repeat attempt — 2026-09-24

Machine `WHITE`, Node v24.13.0, commit `1f4435905`, same six-query real-index workload as above but 12,000 timed searches per run after 1,200 warm-up searches. Run from repository root: `cd packages\tui && for /L %i in (1,1,5) do @node .temp_files\perf-ratchet\search-20260924-controlled\search.mjs`. The round-owned script samples `os.cpus()` ticks around the measured window and counts `node.exe` processes with `tasklist` before and after it. Recorded host CPU includes this benchmark; node count is a contention indicator, not an isolation guarantee. Temporary script source is recorded below; it is removed when this repeat is closed.

The pre-change `pnpm --filter @wrongstack/tui test` initially exited 1 (1 failed / 6,555 passed; `use-history-archive.test.tsx` expected 50 loaded entries and got none). `pnpm --filter @wrongstack/tui exec vitest run --config vitest.config.ts tests/use-history-archive.test.tsx` then exited 0 (3 passed), and the unchanged full package suite rerun exited 0. No production code was changed while resolving this baseline gate.

| Baseline run | ms/search | Host CPU during run | Benchmark process CPU | node.exe before → after | Checksum |
| --- | ---: | ---: | ---: | ---: | ---: |
| First pass 1 | 0.119022 | 65.39% | 97.32% | 91 → 93 | 74000 |
| First pass 2 | 0.114599 | 59.88% | 97.73% | 90 → 89 | 74000 |
| First pass 3 | 0.124884 | 53.54% | 96.96% | 89 → 92 | 74000 |
| First pass 4 | 0.135089 | 60.76% | 98.33% | 92 → 97 | 74000 |
| First pass 5 | 0.121578 | 61.96% | 98.56% | 108 → 117 | 74000 |
| Second pass 1 | 0.106011 | 44.58% | 99.52% | 89 → 89 | 74000 |
| Second pass 2 | 0.127697 | 65.16% | 93.84% | 89 → 89 | 74000 |
| Second pass 3 | 0.110974 | 58.91% | 99.80% | 90 → 92 | 74000 |
| Second pass 4 | 0.124478 | 47.08% | 99.28% | 96 → 90 | 74000 |
| Second pass 5 | 0.125450 | 67.05% | 94.46% | 90 → 91 | 74000 |

First-pass min / median / max: 0.114599 / 0.121578 / 0.135089 ms/search (spread 0.020490 ms, 16.85% median). Second-pass min / median / max: 0.106011 / 0.124478 / 0.127697 ms/search (spread 0.021686 ms, 17.42% median). **Verdict: INVALID BASELINES due to large and shifting host load; no changed-run measurement and no production edit.** Even the two unchanged baselines disagree by 2.39% in median. The CPU counters do not identify which other process causes contention. No profile was run; the normalization hypothesis remains speculative.

Benchmark source:

```js
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { searchFiles } from '../../../src/file-search.ts';
const root = process.cwd();
const queries = ['src', 'test', 'component', 'hook', 'zzzzz', 'file-search'];
const nodeCount = () => execFileSync('tasklist', ['/FI', 'IMAGENAME eq node.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8' }).split('\n').filter((line) => line.startsWith('"node.exe"')).length;
const ticks = () => os.cpus().reduce((a, c) => { for (const [k, v] of Object.entries(c.times)) { a.total += v; if (k === 'idle') a.idle += v; } return a; }, { total: 0, idle: 0 });
await searchFiles(root, 'src');
for (let i = 0; i < 1200; i++) await searchFiles(root, queries[i % queries.length]);
const processesBefore = nodeCount();
const cpuBefore = ticks();
const selfBefore = process.cpuUsage();
let checksum = 0;
const start = performance.now();
for (let i = 0; i < 12000; i++) checksum += (await searchFiles(root, queries[i % queries.length])).length;
const elapsed = performance.now() - start;
const self = process.cpuUsage(selfBefore);
const cpuAfter = ticks();
const processesAfter = nodeCount();
console.log(JSON.stringify({ msPerSearch: elapsed / 12000, checksum, hostCpuPercent: 100 * (1 - (cpuAfter.idle - cpuBefore.idle) / (cpuAfter.total - cpuBefore.total)), selfCpuPercent: 100 * (self.user + self.system) / (elapsed * 1000), nodeProcessesBefore: processesBefore, nodeProcessesAfter: processesAfter }));
```

