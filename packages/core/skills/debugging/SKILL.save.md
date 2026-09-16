# Debugging (Compact)

Start from an observed failure and find the first point where reality diverges from expectation.

## Rules

1. Reproduce before fixing; make it reproducible if it isn't.
2. Read the whole error: the first project frame and any `Caused by`.
3. One hypothesis that explains every symptom; cheapest experiment that could disprove it.
4. Change one thing at a time; keep a log of what was tried.
5. Fix the cause, not the symptom (no swallowing, widening, retries, special cases).
6. Prove it: reproduction passes, regression test red then green, neighbours pass.
7. Remove temporary instrumentation.
8. After three failed hypotheses, re-check assumptions or bisect.

## Localize

Stack trace to first project frame; trace wrong values backwards; callers and callees from the codebase index; `git bisect run` when it used to work; halve the search space.
