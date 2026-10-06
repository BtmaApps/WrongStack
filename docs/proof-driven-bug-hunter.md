# Proof-Driven Bug Hunter

`/bughunt [scope]` investigates one round in a Solo session. Use
`/bughunt --rounds 3 packages/tui` to authorize three sequential rounds. WebUI
offers a scope selector and a one-to-three-round budget. Each round may fix one
proven root cause; the budget does not guarantee that many bugs exist.

## Required skills

Before discovery, the round loads four bundled skills: `bug-hunter` (its
proof-driven mode chooses one provable candidate), `debugging` (reproduction
and root cause), `testing` (the proof and the durable regression test), and
`verify-before-done` (final evidence and the report). The prompt names them as
`$bug-hunter`, `$debugging`, `$testing`, and `$verify-before-done`. The
skill-mention middleware, installed on both the CLI and WebUI hosts, turns
those into an instruction to load each skill with the `skill` tool.

The host also enforces it. The prompt carries a marker:

```text
<!-- wrongstack:required-skills bug-hunter debugging testing verify-before-done -->
```

When a user turn containing that marker reaches the agent loop, the gate is
armed for the session. Until each named skill is either delivered to its last
page by the `skill` tool or reported by that tool as missing or unavailable,
the tool executor refuses every mutating tool call: `edit`, `write`, `patch`,
`bash`, `exec`, and any other tool marked mutating. The refusal names the skills
still pending. Reading and searching stay allowed. The requirement lives in
the session context, not the transcript, so compaction does not remove it;
later rounds, which carry no marker, keep it. A loaded skill, however, counts
only while the `skill` call that delivered it is still readable: once
compaction folds that call into a digest or elides its input or result, the
skill is pending again and the next edit is refused until it is reloaded. A new
marker (a new hunt) starts over, and `/clear`, `/resume`, and project switching
reset or rebuild it. After a resume, the latest `skill` call naming the skill in
the restored transcript stands in for the delivery. A runtime without the
`skill` tool is not gated, because it could never satisfy the gate. The `skill`
tool's pages are exempt from output previewing, so a page it counts is a page
the model received in full. The code is in
`packages/core/src/skills/required-skill-gate.ts`.

The round report lists the skills it loaded and any that were unavailable. The
prompt still wins
where a skill's default conflicts with it. For example, `bug-hunter` scans are
report-only, but this round fixes the bug and writes its test.

## Evidence required in each round

1. Record the starting revision, dirty paths, environment, and scope. Establish
   expected behavior from the contract and trace a reachable production path.
2. Run a reproduction before editing production code. It must assert correct
   behavior and fail because of the defect. Include an unaffected control case.
   Import failures, missing dependencies, and timeouts are verification gaps.
3. Apply a minimal root-cause fix. Run the same reproduction with unchanged
   assertions and fixtures. If those change, obtain fresh pre-fix evidence using
   an isolated copy, without reverting shared-checkout work.
4. Keep a regression in the normal test suite. Run related tests and checks,
   then the full test gate when feasible. Record every omitted or failed gate.
5. Preserve the evidence in the round report before removing disposable files
   from the unique `.temp_files/proof-driven-bug-hunter/<round-id>/` directory.

The canonical prompt lives in
`packages/core/data/prompts/_seed/debugging.jsonl`. Its generated prompt and
manifest checksum must stay synchronized. The evidence rules guide the model;
the application does not independently certify the proof or parse the outcome
labels below to decide whether a run may continue.

## Round report

Use a short report that another engineer can reproduce:

```text
Outcome: fixed-and-verified | fixed-verification-incomplete | no-proven-bug | blocked
Scope / starting revision / dirty paths:
Skills: loaded | unavailable
Root-cause fingerprint: affected path + trigger + violated contract
Impact and expected-behavior evidence:
Before: working directory, command, exit code, meaningful failure output
Change: root-cause fix and affected files
After: same command, exit code, meaningful passing output
Regression test:
Related checks / full gate / skipped or blocked checks:
Inspected surfaces and remaining coverage gaps:
Cleanup: removed owned path, or retained path and reason
```

A successful turn is not necessarily a verified fix. Incomplete related
verification must remain visible. No proven bug means the investigation did not
produce sufficient evidence; it does not certify the entire scope as clean.

## Continuation

Plain `/bughunt` stops after one round. An explicit round budget allows the
application to submit the next round automatically after a successful turn.
Each continuation retains the original scope and reviews previous reports to
avoid counting the same root cause twice. Resolve or report incomplete
verification before adding another fix.

In the TUI, `/bughunt stop` reduces the budget to the current round (for example,
`1/25` becomes `1/1`). The running round finishes normally and no further round
starts. If the next round is still queued, it is cancelled immediately.

The TUI cancels a queued continuation when history is replaced, the hook
unmounts, another hunt replaces it, or the round aborts/fails. Duplicate
completion notifications while the continuation is queued cannot spend another
round. These lifecycle cases are covered in
`packages/tui/tests/use-bug-hunt-loop.test.tsx`.
