# @wrongstack/bench

Model-independent agentic benchmark harness for WrongStack.

## What it measures

WrongStack is the **harness** — system prompt, tool set, agent loop, scaffolding.
The model is the only swappable variable. Each (task × model) cell runs the real
`wstack` binary in single-shot mode (`--output-json`) inside an isolated workdir;
the result is graded by the **suite's own tests** — never an LLM. This is the
difference from `wstack modeldiag eval`, which ranks free-form answers with an
LLM judge (model-dependent).

Three invariants keep the report objective:

1. **Deterministic grading.** Polyglot runs the exercise's hidden tests;
   SWE-bench runs `FAIL_TO_PASS` / `PASS_TO_PASS`. Exit code decides pass/fail.
2. **Harness fingerprint.** Every report is stamped with a hash of the CLI
   version, tool roster + tool manifest, iteration cap, yolo flag, task subset,
   and the behaviour-affecting config the sandboxed CLI actually reads. Rows
   compare only when the fingerprint matches.
3. **Noise is reported, not hidden.** Agentic runs are stochastic. `--repeats N`
   runs every task N times and the leaderboard then shows Pass@1 alongside
   Pass@N, All-pass, and a per-task flakiness count, so a lucky run cannot be
   read as a better model.

## Harness profile

By default the sandbox runs the pinned **lean profile**, not the operator's
own settings: factory defaults, the operator's provider definitions (auth
only), and `LEAN_BENCH_CONFIG` — the `quick` system prompt with the aggressive
token-saving tier, and MCP, plugins, memory, the prompt library and the
explore/skill companions off. The same suite therefore fingerprints the same on
every machine, and a published score describes WrongStack rather than one
person's config.

`quick` was chosen by measurement, not taste. On glm-5.3-flash
(2026-10-27) it passed the `hard` suite 16/16 at 83.9k tokens per solve; the
factory `pro` prompt passed 15/16 at 434.8k. On `core` all variants passed
6/6 and `quick` cost 34.5k tokens per task against `pro`'s 179.9k.

- `--host-profile` runs your own active profile instead (companions, skills,
  brain, …) — useful to measure a personal setup, not to publish.
- `--harness <file.json>` deep-merges config over the lean profile for harness
  A/B runs (`{"systemPrompt":{"variant":"pro"}}`). It changes the fingerprint.

## Suites

| Suite | Standard | Grader | Status |
|---|---|---|---|
| `core` | Bundled 6-task agent-edit eval (shipped with the package) | Node tests the agent must not gut | ✅ default, Docker-free; saturated — regression and token checks, not ranking |
| `hard` | Bundled 8-task discriminating eval: spec edge cases, hidden interacting bugs, a behavior-preserving refactor | Node tests the agent must not gut | ✅ Docker-free |
| `smoke` | 3 trivial file edits | command + file assertions | wiring check only — not a quality score |
| `local` | Project-defined manifest tasks | command + file assertions in workdir | ✅ Docker-free, graded inline |
| `polyglot` | Aider polyglot (225 Exercism exercises, 6 languages) | every exercise test, enabled the way Aider's harness does | ✅ Docker-free, graded inline |
| `swebench` | SWE-bench Verified (fixed subset) | export predictions → official harness (inline Docker grading via injectable hook) | ✅ runs + exports; ⚙️ inline grading pluggable |

For SWE-bench the bench runs the agent on each materialized instance and extracts a
conformant model patch (`git diff`, with held-out test files and harness bookkeeping —
`.gitignore` / `.wrongstack/` — stripped), then writes a `predictions-<slug>-<label-hash>.jsonl` in the
official format. Grading itself is delegated to the canonical
`princeton-nlp/SWE-bench` harness (deterministic, version-sensitive) rather than
re-implemented — or plugged in inline via a `SwebenchExternalGrade` hook when Docker is
available. Exported-but-ungraded rows show `—` in the report's Pass@1 column so they never
masquerade as failures.

Polyglot follows Aider's test protocol. Exercism ships all but the first test
disabled, so tests are un-skipped before the agent starts and again at grading
(JS `xtest(` → `test(`, Java `@Disabled` stripped, cpp configured with
`EXERCISM_RUN_ALL_TESTS`, Rust `--include-ignored`). Test files and build
scaffolding (`CMakeLists.txt`, cpp `test/`, Java `build.gradle`) are restored
from the template before grading. `--subset polyglot-wstack-40` runs a pinned,
hash-selected 10-per-language subset (python/javascript/go/rust) for fast
iteration; publish scores from the full set.

## Requirements

- **API keys in env** — providers read keys from the environment (e.g.
  `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`). The isolated
  `WRONGSTACK_HOME` carries no secrets. A saved `wstack auth` provider/model
  is enough for the default smoke run.
- **Core (default):** Node only. Six agent-edit tasks with tests, shipped in `@wrongstack/bench`.
- **Smoke:** 3 trivial edits to prove the harness spawns. Do not rank models on it.
- **Local:** a `bench.local.json` manifest and one fixture directory per task.
- **Polyglot:** a local checkout of the polyglot-benchmark repo plus the
  language toolchains you want to grade: Python+pytest, Node+npm, Go, Rust,
  CMake + a C++17 compiler (Ninja on Windows), and a JDK (Gradle is fetched by
  the wrapper). A language whose toolchain is missing fails at grade time —
  restrict with `--languages` instead of publishing those zeros.
- **SWE-bench (Phase 2):** Docker + a prepared dataset directory.

## Usage

Instant path — no config file, no dataset clone. Compares the named models on
the bundled 6-task `core` suite (real tests) and writes a leaderboard plus
per-task matrix:

```bash
wstack bench run --cell anthropic/claude-sonnet-4-6,openai/gpt-5.4

# Three attempts per task — the leaderboard then reports Pass@3 and flakiness
wstack bench run --cell anthropic/claude-sonnet-4-6,openai/gpt-5.4 --repeats 3

wstack bench compare ./bench-results/<baseline> ./bench-results/<candidate>
```

`--cell` accepts `provider/model` or `label=provider/model`. If you omit it,
the saved `wstack` provider/model is used. `bench.config.json` still works
when you want a reusable matrix.

```bash
# Larger suites
git clone https://github.com/Aider-AI/polyglot-benchmark /path/to/polyglot
cat > bench.config.json <<'JSON'
{
  "maxIterations": 40,
  "concurrency": 4,
  "timeoutMs": 600000,
  "repeats": 1,
  "cells": [
    { "label": "opus-4.8", "provider": "anthropic", "model": "claude-opus-4-8" },
    { "label": "gpt-5.4",  "provider": "openai",    "model": "gpt-5.4" }
  ]
}
JSON
wstack bench run --suite polyglot --polyglot-dir /path/to/polyglot \
  --models bench.config.json --limit 5 --out ./bench-results

# Re-render the markdown report from a finished run
wstack bench report ./bench-results/<timestamp>

# List available suites + configured cells
wstack bench list --models bench.config.json
```

## Local manifest suite

Use this for WrongStack-specific regression evals: tool behavior, prompt changes,
permission policy, multi-file edits, or any task that can be graded by a command
and/or simple file checks.

For transcript-mined retrieval/recall/tooling diagnostics, add `traceEval` to a
local task. Its source transcript is hash-pinned and its three metrics form a
causal funnel: retrieval → correct model edit intent → that exact edit's successful
application. See [the bench command reference](../../docs/subcommands/bench.md#transcript-mined-diagnostic-cases)
for the manifest shape and corpus rules. Do not use synthetic cases for this
corpus: edit-application failures depend on the real session/tool trace.

Use `wstack bench mine --transcript <session.jsonl> --out ./evals` to copy the
original JSONL into `evals/corpus/` and generate one curator-ready draft per edit
attempt. Freeze the source worktree and add a deterministic grader before moving
a draft into `bench.local.json`.

```
evals/
  bench.local.json
  fixtures/
    add-banner/
      README.md
      package.json
      test.mjs
```

```json
{
  "tasks": [
    {
      "id": "add-banner",
      "prompt": "Update README.md so it starts with the product banner. Do not modify package.json.",
      "templateDir": "./fixtures/add-banner",
      "grader": {
        "type": "command",
        "command": "node",
        "args": ["test.mjs"],
        "shell": false
      },
      "assertions": [
        { "type": "file_contains", "path": "README.md", "text": "# WrongStack" },
        { "type": "file_not_contains", "path": "README.md", "text": "TODO" }
      ]
    }
  ]
}
```

Run it with:

```bash
wstack bench run --suite local --suite-dir ./evals --models bench.config.json
# or point directly at a manifest
wstack bench run --suite local --manifest ./evals/bench.local.json --models bench.config.json
```

Supported assertions: `file_exists`, `file_not_exists`, `file_contains`,
`file_not_contains`. The local subset fingerprint includes task ids, prompts,
grader/assertion definitions, excludes, protected files, and a hash of the
copied fixture content.

The grader runs in the agent's own workdir, so list the files it must see as
shipped — the checker script, its test fixtures — under `protectedFiles`
(e.g. `"protectedFiles": ["test.mjs", "package.json"]`). They are copied back
from `templateDir` before grading, and the grade detail names any the agent had
changed. Without it, an agent can rewrite the checker to pass.

Artifacts per run (`bench-results/<timestamp>/`):

- `results.jsonl` — one row per (task × cell × attempt), appended as each row
  lands so an interrupted run keeps everything it finished
- `summary.json` — fingerprint + folded cell results
- `report.md` — leaderboard, cost-vs-quality, per-task matrix, model
  disagreements, and a `## Failures` section with each failing row's status and
  grader/agent detail
- `compare.md` — written by `wstack bench compare <baseline> <candidate>` into the candidate dir

Token columns come from the session log, not the CLI usage block: `tok/task`
is every token an attempt moved (the full prompt including cache reads, plus
output, for the leader and every subagent or companion), and `tok/solve` is all
tokens spent divided by passing attempts — the price of one solved task,
failures included. The usage block counts only fresh leader tokens; one
measured run reported 9.4k against an actual ~83k. Because the counts are
per-request events, timed-out and crashed rows still contribute their tokens;
only their cost stays an unrecoverable zero, and the report says `$/task` is a
lower bound.

`wstack bench run` exits non-zero when *every* attempt crashed before producing
a result — a bad model id or missing credentials is a broken run, not a 0% score.

## SWE-bench dataset layout

`--dataset-dir <path>` must contain one directory per pinned instance id:

```
<datasetDir>/<instance_id>/
  repo/           git checkout at base_commit
  instance.json   { problem_statement, test_patch, FAIL_TO_PASS, PASS_TO_PASS, image }
```

```bash
# Run the agents and export predictions (no Docker needed):
wstack bench run --suite swebench --dataset-dir ./swe-data --models bench.config.json --limit 5

# Then grade with the official harness:
python -m swebench.harness.run_evaluation \
  --predictions_path ./bench-results/<ts>/predictions-<slug>-<label-hash>.jsonl --run_id my-run
```

The pinned subset lives in `subsets/swe-bench-verified-50.json` — replace the
starter list with your chosen N instance ids from the official
`princeton-nlp/SWE-bench_Verified` dataset and never change it afterwards
(changing the subset changes the fingerprint).
