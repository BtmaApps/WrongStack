# Plugin performance measurements

## 2026-09-22: evidence analyzer line lookup

- Workload: 973,200-character CI log, 44,000 ordinary lines followed by 200 findings; one warmup and three measured executions, asserting finding count and first/last line.
- Command: `pnpm.cmd exec tsx packages/plugins/bench/evidence-analyzer.mts`
- Base commit: `0b6f004e3ab45d819b32068943a0d1df8625c69a`; shared dirty checkout.
- Machine/runtime: WHITE, Windows, Node v24.13.0.
- Baseline measured before changing line lookup: 1062.538, 1110.440, 1232.181 ms.
- Scope: analyzer execution, not plugin startup or whole-session latency.
- After replacing per-finding full-log splits with one line-offset index: 1.887, 2.193, 2.834 ms; median 1110.440 → 2.193 ms (99.80% reduction). The 1108.247 ms median delta exceeds both the 169.643 ms baseline spread and the 5% threshold. Retained; the benchmark assertions passed.
