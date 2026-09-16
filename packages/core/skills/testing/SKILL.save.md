# Testing (Compact)

Write tests that fail and pass for the right reason, in the project's own runner, layout, and style.

## Rules

1. Match the project first: runner, test layout, naming, and existing helpers.
2. See a regression test fail without the fix before trusting it.
3. Test behaviour through the public surface, not internal structure.
4. Mock boundaries you don't own (network, clock, randomness, third-party SDKs).
5. Isolate tests: no order dependence; restore mocks, timers, env in teardown.
6. Bound waits that can hang; use fake timers for time-based logic.
7. Report the exact command and pass/fail/skip counts; "no tests matched" is not a pass.

## Key moves

- Find covering tests with codebase-targeted-test when the index is available.
- Flaky = bug: fix the cause (timers, leaked state, unawaited promise, shared ports), not with retries.
- Never loosen assertions, skip tests, or lower thresholds to get green.
