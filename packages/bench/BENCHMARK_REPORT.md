# @wrongstack/bench — Benchmark Report

> **Package:** `@wrongstack/bench` (v0.287.0)  
> **Date:** 2026-07-14  
> **Description:** Model-independent agentic benchmark harness for WrongStack.  
> **Source:** `packages/bench/`

---

## What is `wstack bench`?

`wstack bench` is a **model-independent agentic benchmark harness**. It holds the
WrongStack harness **fixed** (system prompt + tool set + agent loop + scaffolding)
and swaps **only the model** between runs, then grades the result with the suite's
**own tests** — never an LLM judge.

### Key invariants

| Invariant | Why it matters |
|-----------|---------------|
| **Deterministic grading** | Pass/fail comes from the suite's own test suite (exit code), not a model-as-judge. |
| **Harness fingerprint** | Every report is stamped with a hash of CLI version, tool roster, iteration cap, yolo flag, task subset, and prompt/config hashes. Rows are comparable **only** when fingerprints match. |

### How it works — under the hood

Each `(task × model)` cell runs the real `wstack` binary as an isolated subprocess:

```bash
wstack --prompt "<task>" --provider <p> --model <m> \
       --output-json --no-tui --no-interactive --no-banner \
       --yolo --no-models-refresh --skip-index
```

The subprocess runs in:
- An **isolated workdir** (template copied fresh per cell — no cross-contamination)
- An **isolated `WRONGSTACK_HOME`** (carries no secrets; provider keys inherited from parent env)

The only variable between cells is `--provider` / `--model`. Process isolation
also makes the run robust to: crashing models, per-task timeouts (tree-kill), and OOMs.

---

## Suites

| Suite | Standard | What it measures | Grading method |
|-------|----------|-----------------|----------------|
| `local` | Custom manifest tasks in a `bench.local.json` | WrongStack-specific regression tests (tool behavior, prompt changes, multi-file edits) | Run a command and/or file assertions (`file_contains`, `file_exists`, etc.) in the workdir |
| `polyglot` | [Aider polyglot-benchmark](https://github.com/Aider-AI/polyglot-benchmark) — 225 Exercism exercises across 6 languages | Edit accuracy across languages | Run each exercise's **hidden tests** in the workdir (exit code = pass/fail) |
| `swebench` | [SWE-bench Verified](https://www.swebench.com/) (fixed 50-instance subset) | End-to-end issue resolution | Export conformant `model_patch` → official `FAIL_TO_PASS` / `PASS_TO_PASS` harness (or inline Docker via pluggable hook) |

### Polyglot languages

| Language | Toolchain required |
|----------|-------------------|
| Python | `python` + `pytest` |
| JavaScript/TypeScript | `node` + `npm` |
| Go | `go` |
| Rust | `rustc` + `cargo` |
| C++ | `g++` / `clang++` |
| Java | `javac` |

---

## CLI commands

| Command | Effect |
|---------|--------|
| `wstack bench` | Print usage |
| `wstack bench list [--models <config>]` | Show suites and configured model cells |
| `wstack bench mine --transcript <session.jsonl> [--out <dir>]` | Copy a real session transcript into the corpus and generate curator-ready trace-eval drafts |
| `wstack bench run --suite <id> [flags]` | Run a suite across the model matrix and write a report |
| `wstack bench report <run-dir>` | Re-render `report.md` from a finished run's `summary.json` |

### `run` flags

| Flag | Default | Meaning |
|------|---------|---------|
| `--suite <local\|polyglot\|swebench>` | `polyglot` | Which suite to run |
| `--models <path>` | `bench.config.json` | Model matrix config |
| `--limit <N>` | all | Cap the number of tasks (cheap smoke runs) |
| `--concurrency <K>` | from config (4) | Cells run concurrently |
| `--out <dir>` | `bench-results` | Output base directory |
| `--suite-dir <path>` | — | Required for `local` — directory with `bench.local.json` |
| `--manifest <path>` | `<suite-dir>/bench.local.json` | Explicit local manifest path |
| `--polyglot-dir <path>` | — | Required for polyglot — checkout of polyglot-benchmark |
| `--languages <a,b>` | all | Restrict polyglot languages |
| `--dataset-dir <path>` | — | Required for swebench — materialized instances |
| `--docker` | off | Inline SWE-bench grading (otherwise predictions exported) |

---

## Config format (`bench.config.json`)

```json
{
  "maxIterations": 40,
  "concurrency": 4,
  "timeoutMs": 600000,
  "cells": [
    { "label": "opus-4.8", "provider": "anthropic", "model": "claude-opus-4-8" },
    { "label": "gpt-5.4",  "provider": "openai",    "model": "gpt-5.4" }
  ]
}
```

- `cells` — required array of model cells (at least one, labels must be unique)
- Default label = `provider/model` when `label` is omitted
- Provider API keys read from environment (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.)

---

## Output artifacts (`<out>/<timestamp>/`)

| File | Contents |
|------|----------|
| `report.md` | Leaderboard sorted by Pass@1, stamped with harness fingerprint |
| `summary.json` | Fingerprint + folded per-cell results (machine-readable) |
| `results.jsonl` | One row per `(task × cell)` — full reproducibility |
| `predictions-<slug>-<label-hash>.jsonl` | (SWE-bench only) official-format predictions; hash preserves distinct cell identities |

### Report columns

| Column | Meaning |
|--------|---------|
| **Pass@1** | % of graded tasks that passed the deterministic grader |
| **Edit-apply** | % of `edit`/`write` tool calls that applied cleanly (edit accuracy) |
| **$/task** | Average cost per task |
| **tok in/out** | Average tokens in/out per run |
| **iters (p50)** | Median iterations per task |
| **wall (p50)** | Median wall-clock time per task |
| **timeout %** | Fraction of tasks that hit the timeout |
| **429s** | Total provider rate-limit retries |

For **transcript-mined trace-eval cases**, three additional causal columns appear:

| Column | Meaning |
|--------|---------|
| **Retrieval** | Did the model find the right files? |
| **Recall (given retrieval)** | Given evidence found, did the model express the correct edit intent? |
| **Edit application (given recall)** | Given correct intent, did the tool apply cleanly? |

This creates a diagnostic funnel distinguishing retrieval failures, model reasoning
failures, and tooling/application failures — rather than lumping everything into Pass@1.

---

## Benchmark tests — source & results

All tests live in `packages/bench/tests/`. They run with **vitest** (no real API calls —
all runs use fake `wstack` scripts or fixture data).

### How to run

```bash
pnpm --filter @wrongstack/bench test
# or
pnpm vitest run packages/bench/tests
```

### Full test inventory

| # | Test file | Tests | What it validates |
|---|-----------|-------|-------------------|
| 1 | `config.test.ts` | 6 | `parseBenchConfig` — parses valid config, applies defaults, enforces label uniqueness, rejects empty/deficient configs |
| 2 | `config-load.test.ts` | 5 | `loadBenchConfig` — reads from disk, reports missing/invalid files |
| 3 | `fingerprint.test.ts` | 8 | `computeHarnessFingerprint` — deterministic output, order-independent tool names, hash changes on any field change, readable label rendering |
| 4 | `fingerprint-coverage.test.ts` | 8 | Edge cases: empty tool list, optional hashes, stringified numeric tool names |
| 5 | `aggregate.test.ts` | 8 | `aggregateCell` / `median` — pass rate, edit-apply rate, timeout rate, p50, graded vs ungraded exclusion, conditional trace-eval funnel, empty result set |
| 6 | `aggregate-coverage.test.ts` | 3 | Edge: ungraded-only results, zero-edit tasks |
| 7 | `isolation.test.ts` | 8 | `createSandbox` / `prepareWorkdir` / `cleanupSandbox` — directory tree creation, template copy, `.meta` exclusion, fresh copies on re-prepare, safe slugification |
| 8 | `runner.test.ts` | 5 | `runWstack` — parses `--output-json` usage block, reports crashed on missing JSON, kills hung processes on timeout; `mapWithConcurrency` preserves order and respects limit |
| 9 | `runner-extra.test.ts` | 9 | Edge: empty output, partial JSON, truncated payload, high concurrency, missing token fields |
| 10 | `exec-command.test.ts` | 9 | `execCommand` — stdout capture, shell quoting, timeout kill, maxBufferBytes truncation, exit code passthrough, stderr capture |
| 11 | `exec-command-coverage.test.ts` | 2 | Edge: simultaneous buffer fill in both streams, re-truncation guard |
| 12 | `polyglot-suite.test.ts` | 10 | Suite loader — discovers exercises from fixture tree, computes stable subset id, skips non-dirs, builds correct `BenchTask` shape |
| 13 | `polyglot-grader.test.ts` | 3 | Grade a real polyglot exercise — pass on exit 0, fail on exit 1, reports command errors |
| 14 | `polyglot-grader-extra.test.ts` | 6 | Edge: missing test runner, truncated output, unexpected exit codes |
| 15 | `local-manifest-suite.test.ts` | 4 | Suite loader — tasks from `bench.local.json`, includes trace-eval fields, stable subset id, default manifest path |
| 16 | `local-manifest-suite-coverage.test.ts` | 41 | Edge: missing manifest, invalid JSON, empty tasks, missing templateDir, trace-eval provenance verification (hash mismatch, range mismatch, session id mismatch) |
| 17 | `local-manifest-grader.test.ts` | 3 | Grade — command grader (exit code), file assertion grader (`file_contains`, `file_not_contains`), both combined |
| 18 | `local-manifest-grader-coverage.test.ts` | 10 | Edge: timeout in grader command, truncated output, both assertion types, all assertions passing/failing |
| 19 | `swebench-suite.test.ts` | 8 | Suite loader — discovers instances, loads instance.json, reads problem_statement, stable subset id |
| 20 | `swebench-grader.test.ts` | 3 | Grade — patch extraction, empty patch = failure, exported prediction = ungraded |
| 21 | `swebench-grader-coverage.test.ts` | 3 | Edge: external grade hook (graded:true, ungraded:undefined), empty patch |
| 22 | `swebench-patch.test.ts` | 6 | `extractModelPatch`, `filterPatchExcludingPaths` — real git repo with diffs, strips test/harness files |
| 23 | `swebench-patch-extra.test.ts` | 3 | Edge: empty repo, untracked files only, tag-based patches |
| 24 | `predictions.test.ts` | 6 | Prediction export — `writePredictionsJsonl`, `parseResolvedIds`, `writeInstancePrediction`, round-trip |
| 25 | `predictions-extra.test.ts` | 3 | Edge: empty result set, malformed patch, missing instance fields |
| 26 | `predictions-coverage.test.ts` | 4 | Edge: ungraded predictions, empty JSONL export, missing `model_name_or_path` |
| 27 | `session-metrics.test.ts` | 2 | `readToolMetrics` — counts edit/write calls, edit errors, rate-limit retries from JSONL events |
| 28 | `session-metrics-extra.test.ts` | 8 | Edge: empty JSONL, truncated events, missing `ok` field, multiple edit types |
| 29 | `session-metrics-coverage.test.ts` | 3 | Edge: no edit calls, tool_call_end without start, nested tool calls |
| 30 | `trace-eval.test.ts` | 2 | `evaluateTraceEval` — retrieval → recall → edit-application funnel from real session events |
| 31 | `trace-eval-coverage.test.ts` | 3 | Edge: missing retrieval evidence, partial recall match, tool_call_end with null `ok` |
| 32 | `transcript-mine.test.ts` | 2 | `mineTranscript` — extracts edit attempts, produces drafts with retrieval markers |
| 33 | `transcript-mine-coverage.test.ts` | 15 | Edge: empty transcript, multiple edits, no edit calls, session id mismatch |
| 34 | `orchestrate.test.ts` | 3 | Full integration: `runBenchmark` fans out every `(task × cell)`, grades, folds into a fingerprinted report |
| 35 | `orchestrate-extra.test.ts` | 2 | Edge: grader error recorded as failed grade with detail |
| 36 | `orchestrate-coverage.test.ts` | 2 | Edge: `keepSandbox` skips cleanup, trace-eval tasks run correctly |
| 37 | `report.test.ts` | 8 | Report rendering: `renderMarkdownReport` — leaderboard table, fingerprint header, sorted by Pass@1 |
| 38 | `markdown-coverage.test.ts` | 5 | Edge: empty cell list, zero tasks, all-failing rows, report with trace-eval columns |

### Results — 2026-07-14 run

```
 Test Files  38 passed (38)
      Tests  239 passed (239)
   Duration  6.03s (transform 10.97s, setup 704ms, import 16.99s, tests 17.40s)
```

**239 tests across 38 test files — all passing.** Zero failures, zero flakes.

---

## Architecture

```
packages/bench/
├── src/
│   ├── index.ts              # Public API re-exports
│   ├── config.ts             # bench.config.json parse/validate
│   ├── config.ts             # (types)
│   ├── fingerprint.ts        # computeHarnessFingerprint()
│   ├── isolation.ts          # Sandbox: isolated WRONGSTACK_HOME + per-cell workdirs
│   ├── runner.ts             # Spawn wstack subprocess, parse --output-json, tree-kill
│   ├── session-metrics.ts    # Edit-apply %, 429 counts from session JSONL
│   ├── trace-eval.ts         # Retrieval → recall → edit-application funnel
│   ├── exec-command.ts       # Grading subprocess runner (timeout, truncation)
│   ├── aggregate.ts          # Fold TaskResult[] → CellResult
│   ├── transcript-mine.ts    # Mine real session transcripts → trace-eval drafts
│   ├── orchestrate.ts        # runBenchmark() — fan out, grade, fold
│   ├── graders/
│   │   ├── polyglot-grader.ts
│   │   ├── local-manifest-grader.ts
│   │   └── swebench-grader.ts
│   ├── suites/
│   │   ├── polyglot.ts
│   │   ├── local-manifest.ts
│   │   ├── swebench.ts
│   │   └── swebench-patch.ts
│   └── report/
│       ├── markdown.ts
│       ├── json.ts
│       └── predictions.ts
├── tests/
│   └── *.test.ts            # 38 test files, 239 tests
├── subsets/
│   └── swe-bench-verified-50.json
└── README.md
```

### Dependency direction

```
@wrongstack/bench → @wrongstack/core  (never the other way)
```

---

## How to run yourself

### Prerequisites

- API keys in env (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.)
- For polyglot: `git clone https://github.com/Aider-AI/polyglot-benchmark /path/to/polyglot`
- Language toolchains for grading (python+pytest, node+npm, go, rust, etc.)

### Polyglot benchmark

```bash
wstack bench run --suite polyglot --polyglot-dir /path/to/polyglot \
  --models bench.config.json --limit 5 --out ./bench-results
```

### Local regression tests

```bash
wstack bench run --suite local --suite-dir ./evals \
  --models bench.config.json
```

### SWE-bench

```bash
wstack bench run --suite swebench --dataset-dir ./swe-data \
  --models bench.config.json --limit 5
python -m swebench.harness.run_evaluation \
  --predictions_path ./bench-results/<ts>/predictions-<slug>-<label-hash>.jsonl --run_id my-run
```

---

## Trace evaluation (transcript-mined diagnostics)

For retrieval/recall/tooling diagnostics, `traceEval` cases are mined from **real**
session transcripts (not synthetic). Every case has an immutable provenance record:

- Original session ID
- Source transcript path + SHA-256
- Inclusive event range

The diagnostic funnel separates failure modes:

1. **Retrieval** — Did the model find the right files? (over all trace cases)
2. **Recall (conditional)** — Given evidence was found, did the model express the correct edit intent?
3. **Edit application (conditional)** — Given correct intent, did the tool apply cleanly?

This answers "retrieval, model, or tooling?" directly from the leaderboard.

```bash
wstack bench mine \
  --transcript ~/.wrongstack/projects/<project>/sessions/<date>/sess_<id>.jsonl \
  --out ./evals
```

---

*Generated from `packages/bench/` — @wrongstack/bench v0.287.0*
