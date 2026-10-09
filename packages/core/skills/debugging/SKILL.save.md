# Debugging (Compact)

<!-- source-version: 1.2.1 -->

## Selection card
- Task: Reproduce and diagnose a reported failure. / TR: Bildirilen hatayı yeniden üret ve teşhis et.
- Start: Identify the scope and obtain an executable before-proof or review evidence.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Debugging is a search for the first point where reality diverges from
expectation. It goes fast when every step narrows the search with evidence, and
slowly when it guesses and patches symptoms. The deliverable is a fix at the
cause, a test that fails without it, and an explanation that accounts for every
observation.

This skill starts from an observed failure, or from a suspected defect that
`bug-hunter` selected and that now has to be proven. Scanning code for defects
nobody has reported yet is `bug-hunter`.

## Rules

1. Reproduce before fixing. Get a command, test, or input that shows the failure
   on demand. If that isn't possible yet, the first job is making it
   reproducible — logs, inputs, environment — not changing code. If it never
   becomes reproducible, production code stays untouched and the report says
   what was tried.
2. Read the whole error. The top of a stack trace is where the failure surfaced;
   the cause is often further down: a `Caused by`, the first frame in project
   code, or the earliest error in the log.
3. Form a hypothesis that explains every symptom, then run the cheapest
   experiment that could prove it wrong.
4. Change one thing at a time, and keep a short log of what was tried and what
   it showed.
5. Fix the cause, not the symptom. Swallowing the error, widening a type, adding
   a retry, or special-casing the failing input is only right when that really is
   the correct behaviour.
6. Prove the fix: the reproduction passes, a regression test fails without the
   fix, and neighbouring tests still pass.
7. Remove temporary instrumentation before finishing.
8. After three disproven hypotheses, step back. Re-check the assumptions — right
   file, right build, right branch, right environment — or bisect.

## Detailed workflow

Load the full debugging skill before relying on its specialized modes,
references or output contracts. Its current SKILL.md is the source of truth;
this compact body does not expand task scope or authorization.

## Before returning

- [ ] Failure reproduced, or it is stated plainly why it couldn't be
- [ ] Reproduction calls the production path, fails on the contract assertion,
      and has a passing control
- [ ] Root cause stated, consistent with every symptom
- [ ] Fix at the cause; no swallowed errors or special-casing
- [ ] Regression test seen red, then green; related suites pass
- [ ] Temporary instrumentation removed
