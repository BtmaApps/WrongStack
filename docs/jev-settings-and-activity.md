# Jev settings and activity

Open **WebUI → Settings → Jev** to select TypeSafe, OpenRouter Decisions or a
custom endpoint; add, replace or remove the profile API key; override the model
and request timeout; and enable or disable each consumer. The saved key is never
returned to the browser. Changing providers clears the old credential, endpoint
and model. A route-specific environment key can still apply after removing the
saved key.

**Test saved connection** sends one small, billed decision request. It uses the
saved settings, so save edits first. Configuration status is not a connectivity
test. Existing sessions should be restarted to apply changes to all consumers:
some clients and feature middleware are created at boot.

In the TUI, `/jev` (alias `/typesafe`) shows the account and every feature switch.
`/settings jev` reaches the same command. Examples:

```text
/jev login typesafe
/jev login openrouter
/jev endpoint https://example.com/v1/systemone
/jev login custom
/jev model default
/jev timeout 4000
/jev feature brain off
/jev feature skillSuggestion on
/jev feature tool on
/jev test
/jev logs memoryRecall
/jev remove-key
```

Login reads the credential through the surface's masked secret prompt; never put
it in slash-command arguments. Jev is a decision provider and remains separate
from chat model selection.

## Agent-callable decisions

With an account configured, the `tool` feature exposes `jev` alongside `llm`
and `council`. Disable it with `/jev feature tool off` or **Agent decision tool**
in Settings → Jev (`typesafe.judgments.tool: false`). This tool tracks saved
account and feature changes in running CLI/TUI and embedded WebUI sessions.
Its prompt guidance is included only when the tool is in the session catalog.

The system prompt teaches the model to use Jev proactively at meaningful decision
points: when interpreting known evidence against explicit criteria could change
its next action. Examples include comparing plausible options, filtering relevant
findings, prioritizing review candidates and assessing requirement coverage.
Normally one request per unresolved decision is enough; related questions can be
batched. Simple deterministic tasks may need none, while complex tasks can use it
at several stages as evidence changes. Unchanged judgments should be reused, with
no calls-per-turn quota or repeated questions seeking a preferred answer.

`jev_status({})` reports local eligibility and shared authentication/cooldown
state without a billed request. Use `/jev test` for a live connection check.
The model calls `jev` only when a bounded judgment would help, passing explicit
JSON evidence and question rubrics:

```json
{
  "state": { "testsPassed": true, "remainingFailures": 0 },
  "questions": {
    "ready": {
      "type": "noul",
      "instructions": "Does the evidence show all tests passed?"
    }
  }
}
```

`noul` returns a yes/no probability; `choice` requires at least two option IDs
mapped to descriptions; `score` requires at least two concrete level descriptions,
lowest first. Results include typed answers, model and token usage. The tool uses
the saved account, shares its failure protection and records activity under `tool`.
Missing or incompatible answers are errors, never implicit negative verdicts.
Confidence measures distribution concentration, not correctness; use `llm` for
prose and `council` for multiple perspectives.

## Permission, prerequisites and observed use

The eleven switches grant permission to use Jev; they do not mean that a call is
running. Each feature card shows its **saved profile** prerequisites, its trigger
conditions and the latest runtime request in the displayed process log. An
unconfigured account, non-selective compaction, disabled/undefined model tiers,
disabled skills or disabled SAGE turn context recall are reported explicitly.
Session-specific settings and middleware installed at boot can differ from the
saved profile. Restart existing sessions after changing the profile dependencies.

The Jev screen edits the profile compaction strategy and SAGE turn context recall
directly. Its expandable model-tier editor uses the existing tier settings and
saves immediately. Enable tiers, add at least two levels in cost/capability order,
bind their models or fallback profiles, and choose a default. Explicit delegation
model/tier choices and role/phase routing still take precedence over Jev advice.

The CLI/TUI equivalents include `/jev compaction selective`, `/jev recall on`
and `/tier`. SAGE memory recall requires both memory/SAGE and turn context recall
to be enabled; the tool-result injection path alone does not run this Jev filter.

## Live capability checks

**Test all 11 features**, `/jev check`, and `wstack typesafe check-judgments` share
the same runner. It sends 22 synthetic cases through the real feature question
builders, including skill suggestions and fleet dispatch. The checks use the
saved account and run even for disabled features. They make billed calls but
read no project content and do not change configuration, close Kanban cards or
spawn agents. A passing check is evidence about those fixtures, not proof of
long-term decision quality or use in the current session.

The server shares simultaneous requests for a check, limits a run to 60 seconds,
and keeps the latest report in memory for that account configuration. A changed
account invalidates the report. Provider failures, missing answers and cases
that never reached Jev cannot pass merely because a feature returned its fallback.

Diagnostic requests carry `purpose: self-test`. They are hidden from the normal
activity view unless **Include diagnostic requests** is selected, and never
populate a feature's latest runtime-request indicator.

The WebUI activity view refreshes every three seconds and shows the most recent
300 requests made by **this server process**, across its sessions. Each entry
contains a request ID, time, consumer, process working directory, route, model,
elapsed time, token usage, bounded answer identifiers/numbers and a safe failure
category. It covers judgment features, skill suggestions, fleet classification
and connection probes. No prompt state, question instructions, API credentials,
response legends or raw provider error bodies are recorded.

`answered` means the service returned a typed response; the consumer may still
decline a low-confidence answer. `incomplete` means required answers were missing
or malformed. `fallback` marks requests that failed or were
blocked by the resting/authentication gates. Features that are disabled or never
invoked do not generate request entries. The settings panel shows their switches.

Activity is also written to `~/.wrongstack/logs/jev-<pid>.jsonl`. The panel and
`/jev logs` show the exact path and any write failure. Each process file rotates
at 5 MB with one `.1` backup. Files from previous processes remain on disk for
investigation; the browser tail is current-process only. The working directory
is process attribution, not a per-session project identifier.
