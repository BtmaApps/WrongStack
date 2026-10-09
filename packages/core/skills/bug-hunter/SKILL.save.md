# Bug Hunter (Compact)

<!-- source-version: 2.2.1 -->

## Selection card
- Task: Run the WrongStack bug-hunt and cascade workflow. / TR: WrongStack bug hunt ve cascade akışını yürüt.
- Start: Identify the scope and obtain an executable before-proof or review evidence.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Rules

1. Always include a `file:line` you have actually read — verify the line exists;
   never invent, guess, or extrapolate a reference. No line reference = can't be
   fixed.
2. Grep finds candidates; reading finds bugs. No hit becomes a finding until you
   can state the input that triggers it and what breaks.
3. Never scan `node_modules`, build output, or generated code.
4. Don't report style issues as bugs — those are lint findings.
5. Don't inflate severity or pad the report. Twelve confirmed findings beat
   forty maybes, and a clean scan is a valid result.
6. Sort output: critical > high > medium > low.

## Detailed workflow

Load the full bug-hunter skill before relying on its specialized modes,
references or output contracts. Its current SKILL.md is the source of truth;
this compact body does not expand task scope or authorization.

## Before returning

- Every `file:line` opened and confirmed — none from grep output alone
- Every finding states a triggering input, a consequence, and the basis for the
  expected behaviour
- Excluded paths honoured; test-file findings labelled as such
- Severities pass the reachability and blast-radius checks; nothing rounded up
- Scan: summary counts match the findings; `<nextsteps>` mirrors them in order
- Cascade: fixes are minimal, unfixed findings listed with reasons, no mailbox
  message sent
- Proof-driven: one root cause, not a duplicate of a prior round; the choice,
  rejected candidates, and coverage gaps are in the report
