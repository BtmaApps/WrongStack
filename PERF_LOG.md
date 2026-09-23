# Performance log

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
